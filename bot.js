const EventEmitter = require('events');
const configManager = require('./config/configManager');
const log = require('./main/logger').tagged('Bot');

const EventSubHandler = require('./main/EventSubHandler');
const TwitchAPI = require('./main/TwitchAPI');
const RewardsManager = require('./main/RewardsManager');
const AlertManager = require('./main/AlertManager');
const chatMapper = require('./main/chat-mapper');

// Twitch asks applications to validate the user token at least once an hour.
const TOKEN_VALIDATE_INTERVAL_MS = 45 * 60 * 1000;
const TOKEN_EXPIRY_WARNING_S = 7 * 24 * 60 * 60;

// Everything the app subscribes to or calls. A missing entry here is the usual
// reason a feature silently does nothing (channel points above all).
const REQUIRED_SCOPES = [
    // Chat now runs over EventSub + Helix rather than IRC, so chat:read and
    // chat:edit are replaced by these two.
    'user:read:chat',
    'user:write:chat',
    'channel:read:redemptions',
    'channel:manage:redemptions',
    'channel:read:subscriptions',
    'channel:read:hype_train',
    'moderator:read:followers',
    'moderator:manage:chat_messages',
    'moderator:manage:banned_users',
    'bits:read',
    'clips:edit',
    'channel:manage:schedule'
];

class TwitchBot extends EventEmitter {
    constructor() {
        super();
        this.configManager = configManager;
        this.isConnected = false;
        this.messageCount = 0;
        this.currentAutoMessageIndex = 0;
        this.botSentMessageIds = new Set();
        this.appAccessToken = null;
        this.appClientId = null;
        this.tokenExpiry = null;
        this.badgesWarningLogged = false;
        this.userId = null;
        this.clientId = null;
        this.tokenScopes = [];
        this.tokenWatchTimer = null;
        this.clipCooldown = (this.getConfig().clipCooldown || 30) * 1000;
        this.onCooldown = false;
        this.currentSubCount = this.getWidgetConfig('subgoals')?.currentCount || 0;
        this._cachedBannedWords = null;

        const lastEvents = this.configManager.getLastEvents();
        this.lastSub = lastEvents.sub || null;
        this.lastFollow = lastEvents.follow || null;
        this.lastDonation = lastEvents.donation || null;

        this.eventSubHandler = new EventSubHandler(this);
        this.twitchAPI = new TwitchAPI(this);
        this.rewardsManager = new RewardsManager(this);
        this.alertManager = new AlertManager(this);

        if (this.rewardsManager.isDevMockEnabled()) {
            this.mockRewards = this.rewardsManager.getMockRewards();
        } else {
            this.mockRewards = [];
        }
    }

    setClipCooldown(seconds) {
        this.clipCooldown = parseInt(seconds, 10) * 1000;
    }

    updateConfig(newConfig) {
        this.configManager.updateConfig(newConfig);
    }

    getConfig() { return this.configManager.getConfig() || {}; }
    getCommands() { return this.configManager.getCommands() || []; }
    getParticipants() { return this.configManager.getGiveawayParticipants() || []; }
    getParticipantsCount() { return this.getParticipants().length; }
    isGiveawayActive() { return this.configManager.isGiveawayActive(); }
    getWidgetConfig(widgetName) { return this.configManager.getWidgetConfig(widgetName); }
    saveWidgetConfig(widgetName, newConfig) { this.configManager.saveWidgetConfig(widgetName, newConfig); }

    async connect() {
        const config = this.getConfig();
        if (!config.channel || !config.token) {
            log.error('BOT_MISSING_CONFIG');
            return;
        }

        const token = config.token.startsWith('oauth:') ? config.token : `oauth:${config.token}`;

        const validation = await this.twitchAPI.validateToken(token);
        if (validation) {
            this.clientId = validation.clientId;
            this.userId = validation.userId;
            this.tokenScopes = validation.scopes || [];
            this.reportScopeGaps();
            this.reportTokenExpiry(validation.expiresIn);
            this.startTokenWatch();
        } else {
            log.error('BOT_TOKEN_INVALID');
            this.emit('token-invalid');
        }

        try {
            await this.ensureAppAccessToken();
        } catch (err) {
            // Only affects chat badges; never block the connection over it.
            log.error('BOT_APP_TOKEN_ERROR', { error: err.message || err });
        }

        // Chat now arrives through the same EventSub socket as every other
        // event, so there is a single connection to keep alive instead of two.
        this.eventSubHandler.connect();
        this.fetchSubCount();
        this.checkStreamStatusAndResetDaily();
    }

    disconnect() {
        this.stopTokenWatch();
        this.eventSubHandler.close();
        if (this.isConnected) {
            this.isConnected = false;
            this.emit('disconnected');
        }
    }

    // Called by EventSubHandler once the chat subscriptions are live.
    setChatConnected(connected) {
        if (this.isConnected === connected) return;
        this.isConnected = connected;
        this.emit(connected ? 'connected' : 'disconnected');
    }

    /**
     * Sends a chat message through Helix. Replaces tmi's client.say().
     * The app already assumes the configured token belongs to the broadcaster
     * (every other Helix call uses this.userId as broadcaster_id), so sender
     * and broadcaster are the same account here.
     */
    async say(text) {
        if (!text) return false;
        if (!this.userId || !this.clientId) {
            log.warn('BOT_SAY_NOT_READY');
            return false;
        }

        const config = this.getConfig();
        const token = (config.token || '').replace('oauth:', '');
        if (!token) return false;

        try {
            const response = await fetch('https://api.twitch.tv/helix/chat/messages', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Client-Id': this.clientId,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    broadcaster_id: this.userId,
                    sender_id: this.userId,
                    // Twitch truncates past 500 characters.
                    message: String(text).slice(0, 500)
                })
            });

            if (!response.ok) {
                log.error('BOT_SAY_ERR', { status: response.status, body: await response.text() });
                return false;
            }

            const data = await response.json();
            const sent = data && data.data && data.data[0];
            if (sent && sent.message_id) {
                this.botSentMessageIds.add(sent.message_id);
                setTimeout(() => this.botSentMessageIds.delete(sent.message_id), 30000);
            }
            // Twitch answers 200 with is_sent:false when AutoMod holds it.
            if (sent && sent.is_sent === false) {
                const reason = sent.drop_reason || {};
                log.warn('BOT_SAY_DROPPED', { reason: reason.message || reason.code || 'inconnu' });
                return false;
            }
            return true;
        } catch (e) {
            log.error('BOT_SAY_ERR', { status: '-', body: e.message || e });
            return false;
        }
    }

    startTokenWatch() {
        this.stopTokenWatch();
        this.tokenWatchTimer = setInterval(() => {
            this.revalidateToken().catch(e =>
                log.error('BOT_TOKEN_WATCH_ERR', { error: e.message || e }));
        }, TOKEN_VALIDATE_INTERVAL_MS);
    }

    stopTokenWatch() {
        if (this.tokenWatchTimer) {
            clearInterval(this.tokenWatchTimer);
            this.tokenWatchTimer = null;
        }
    }

    // An expired token used to fail silently: every Helix call just started
    // throwing "Missing credentials" with nothing shown in the UI.
    async revalidateToken() {
        const config = this.getConfig();
        if (!config.token) return false;

        const validation = await this.twitchAPI.validateToken(config.token);
        if (!validation) {
            log.error('BOT_TOKEN_INVALID');
            this.emit('token-invalid');
            return false;
        }

        this.clientId = validation.clientId;
        this.userId = validation.userId;
        this.tokenScopes = validation.scopes || [];
        this.reportTokenExpiry(validation.expiresIn);
        return true;
    }

    getRequiredScopes() {
        return REQUIRED_SCOPES.slice();
    }

    getMissingScopes() {
        const granted = new Set(this.tokenScopes || []);
        return REQUIRED_SCOPES.filter(s => !granted.has(s));
    }

    reportScopeGaps() {
        const missing = this.getMissingScopes();
        if (missing.length === 0) return;
        log.warn('BOT_SCOPES_MISSING', { scopes: missing.join(', ') });
        this.emit('scopes-missing', missing);
    }

    reportTokenExpiry(expiresIn) {
        // expires_in is 0 for tokens that never expire.
        if (!expiresIn || expiresIn <= 0) return;
        if (expiresIn < TOKEN_EXPIRY_WARNING_S) {
            const days = Math.max(1, Math.round(expiresIn / 86400));
            log.warn('BOT_TOKEN_EXPIRING', { days });
            this.emit('token-expiring', days);
        }
    }

    /** Entry point for channel.chat.message notifications. */
    async handleChatMessage(event) {
        // Only ignore messages programmatically sent by the bot's own say() call.
        if (event.message_id && this.botSentMessageIds && this.botSentMessageIds.has(event.message_id)) {
            this.botSentMessageIds.delete(event.message_id);
            return;
        }

        const tags = chatMapper.toTags(event);
        const message = (event.message && event.message.text) || '';
        const messageData = chatMapper.toWidgetMessage(event);

        return this.handleMessage(tags, message, messageData);
    }

    async handleMessage(tags, message, messageData) {
        if (this.containsBannedWords(message)) {
            if (this.userId && this.clientId && tags['room-id'] && tags['user-id']) {
                await this.twitchAPI.deleteMessage(tags['room-id'], tags.id);
            }
            return;
        }

        try {
            await this.ensureAppAccessToken();
        } catch (err) {
            log.error('BOT_APP_TOKEN_ERROR', { error: err.message || err });
        }

        const config = this.getConfig();

        messageData.apiAuth = {
            clientId: this.appClientId || this.clientId || process.env.TWITCH_CLIENT_ID,
            token: this.appAccessToken
        };

        const isCommand = message.startsWith('!');
        const autoMessages = config.autoMessages || [];
        const isAutoMessage = autoMessages.some(am => message === am.message);
        const urlRegex = /(https?:\/\/[^\s]+|www\.[^\s]+|[a-zA-Z0-9-]+\.(com|org|net|fr|be|ch|ca|eu|tv|gg|me|io|co|info|biz)\b)/i;
        const containsLink = urlRegex.test(message);

        if (!isCommand && !isAutoMessage && !containsLink) {
            this.emit('chat-message', messageData);
        }

        if (autoMessages.length > 0) {
            this.messageCount++;
            if (this.currentAutoMessageIndex >= autoMessages.length) {
                this.currentAutoMessageIndex = 0;
            }

            const currentTarget = autoMessages[this.currentAutoMessageIndex];
            const targetInterval = currentTarget.interval || 40;

            if (this.messageCount >= targetInterval) {
                this.say(currentTarget.message);
                this.messageCount = 0;
                this.currentAutoMessageIndex = (this.currentAutoMessageIndex + 1) % autoMessages.length;
            }
        }

        if (isCommand) {
            this.handleCommand(tags, message);
        }
    }

    isAuthorized(tags) {
        const channel = (this.getConfig().channel || '').toLowerCase().replace(/^#/, '');
        const username = (tags.username || '').toLowerCase();
        const isBroadcaster = !!(tags.badges && tags.badges.broadcaster) || (!!channel && username === channel);
        const isModerator = !!tags.mod || tags['user-type'] === 'mod';
        return isBroadcaster || isModerator;
    }

    /** Entry point for channel.chat.notification (the old IRC USERNOTICE). */
    async handleChatNotification(event) {
        const noticeType = event.notice_type;
        log.info('BOT_USER_NOTICE', { id: noticeType, username: event.chatter_user_login });

        if (!chatMapper.shouldForwardNotice(noticeType)) return;

        try {
            await this.ensureAppAccessToken();
        } catch (err) {
            log.error('BOT_APP_TOKEN_ERROR', { error: err.message || err });
        }

        const messageData = chatMapper.noticeToWidgetMessage(event);
        messageData.apiAuth = {
            clientId: this.appClientId || this.clientId || process.env.TWITCH_CLIENT_ID,
            token: this.appAccessToken
        };

        this.emit('chat-message', messageData);
    }

    handleCommand(tags, message) {
        const command = message.split(' ')[0].toLowerCase();
        const config = this.getConfig();

        if (command === '!rfsh') {
            if (this.isAuthorized(tags)) {
                if (this.userId && this.clientId && tags['room-id'] && tags.id) {
                    this.twitchAPI.deleteMessage(tags['room-id'], tags.id).catch(err =>
                        log.error('BOT_RFSH_DEL_ERROR', { error: err.message || err }));
                }
                this.emit('refresh-widgets');
            }
            return;
        }

        if (command === '!oon' || command === '!ooff') {
            if (this.isAuthorized(tags)) {
                if (this.userId && this.clientId && tags['room-id'] && tags.id) {
                    this.twitchAPI.deleteMessage(tags['room-id'], tags.id).catch(err =>
                        log.error('BOT_OON_DEL_ERROR', { error: err.message || err }));
                }
                this.emit('toggle-widgets', command === '!oon');
            }
            return;
        }

        if (command === '!naporaoult') {
            if (this.isAuthorized(tags)) {
                if (this.userId && this.clientId && tags['room-id'] && tags.id) {
                    this.twitchAPI.deleteMessage(tags['room-id'], tags.id).catch(err =>
                        log.error('BOT_NAPORAOULT_DEL_ERROR', { error: err.message || err }));
                }
                this.emit('naporaoult');
            }
            return;
        }

        if (command === '!clip') {
            if (this.isConnected && !this.onCooldown && tags['room-id']) {
                this.twitchAPI.createClip(tags['room-id'])
                    .then((clipData) => {
                        if (clipData) {
                            this.say(`🎬 Clip créé ! https://clips.twitch.tv/${clipData.id}`);
                        } else {
                            this.say(`Erreur: Impossible de créer le clip.`);
                        }
                    })
                    .catch(err => {
                        log.error('BOT_CLIP_ERROR', { error: err.message });
                        this.say(`Erreur lors de la création du clip: ${err.message}`);
                    });
                this.onCooldown = true;
                setTimeout(() => { this.onCooldown = false; }, this.clipCooldown);
            }
            return;
        }

        const giveawayCommand = config.giveawayCommand || '!giveaway';
        if (this.isGiveawayActive() && command === giveawayCommand) {
            const participants = new Set(this.getParticipants());
            if (!participants.has(tags.username)) {
                this.configManager.addGiveawayParticipant(tags.username);
                this.emit('participant-added', tags.username);
                this.emit('participants-updated');
            }
            return;
        }

        const commands = this.getCommands();
        if (commands[command]) {
            this.say(commands[command]);
        }
    }

    containsBannedWords(message) {
        return this.getBannedWords().some(word => {
            const escapedWord = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(^|[^\\p{L}\\p{Nd}])${escapedWord}(?:s|x)?([^\\p{L}\\p{Nd}]|$)`, 'iu');
            return regex.test(message);
        });
    }

    getBannedWords() {
        if (!this._cachedBannedWords) {
            this._cachedBannedWords = this.configManager.getBannedWords() || [];
        }
        return this._cachedBannedWords;
    }

    async ensureAppAccessToken() {
        if (this.appAccessToken && this.tokenExpiry > Date.now()) {
            return;
        }

        const cfg = this.getConfig();
        const configClientId = cfg.twitchClientId;
        const configAppToken = cfg.twitchAppToken;

        if (configClientId && configAppToken) {
            // We cannot know when a pasted app token expires, so trust it only
            // briefly. A 401 clears it and we fall back to the user token,
            // which needs no scope for the endpoints that use this.
            this.appAccessToken = configAppToken;
            this.appClientId = configClientId;
            this.tokenExpiry = Date.now() + (60 * 60 * 1000);
            return;
        }

        const clientId = process.env.TWITCH_CLIENT_ID || configClientId;
        const clientSecret = process.env.TWITCH_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            log.info('BOT_DEBUG_CONFIG_CHECK', { clientId: !!clientId, configAppToken: !!configAppToken, clientSecret: !!clientSecret });
            log.info('BOT_DEBUG_CONFIG_VALUES', { idStatus: configClientId ? 'OK' : 'MISSING', tokenStatus: configAppToken ? 'OK' : 'MISSING' });
        }

        if (!clientId || !clientSecret) {
            if (!this.badgesWarningLogged) {
                log.warn('BOT_BADGES_DISABLED');
                this.badgesWarningLogged = true;
            }
            return;
        }

        log.info('BOT_NEW_APP_TOKEN');
        const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`, {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error(`Erreur de l'API Twitch: ${response.status} ${await response.text()}`);
        }

        const data = await response.json();
        this.appAccessToken = data.access_token;
        this.appClientId = clientId;
        this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
    }

    async fetchSubCount() {
        // null means the call failed; 0 is a real value and must propagate.
        const count = await this.twitchAPI.fetchSubCount();
        if (count !== null && count !== undefined) {
            this.currentSubCount = count;
            if (this.onSubCountUpdate) this.onSubCountUpdate(this.currentSubCount);
        }
        return this.currentSubCount;
    }

    incrementSubCount(amount = 1) {
        this.currentSubCount += amount;
        this.saveWidgetConfig('subgoals', { currentCount: this.currentSubCount });
        this.emit('sub-count-update', this.currentSubCount);
    }

    incrementDailySubCount(amount = 1) {
        const config = this.getWidgetConfig('subgoals') || {};
        let newCount = (config.dailyCurrentCount || 0) + amount;
        // Guard against a stored goal of 0 or a negative value, which used to
        // spin this loop forever.
        let goal = Math.max(1, parseInt(config.dailyGoalCount, 10) || 10);
        let baseGoal = Math.max(1, parseInt(config.baseDailyGoalCount, 10) || 10);

        while (newCount >= goal) {
            goal += 5;
        }

        this.saveWidgetConfig('subgoals', {
            dailyCurrentCount: newCount,
            dailyGoalCount: goal,
            baseDailyGoalCount: baseGoal
        });

        this.emit('daily-sub-count-update', newCount);
    }

    resetDailySubCount() {
        const config = this.getWidgetConfig('subgoals') || {};
        const baseGoal = config.baseDailyGoalCount || 10;

        this.saveWidgetConfig('subgoals', {
            dailyCurrentCount: 0,
            dailyGoalCount: baseGoal
        });
        this.emit('daily-sub-count-update', 0);
        log.info('BOT_DAILY_SUBS_RESET');
    }

    getSubCount() {
        return this.currentSubCount;
    }

    async fetchFollowerCount() {
        return await this.twitchAPI.fetchFollowerCount();
    }

    async checkStreamStatusAndResetDaily() {
        if (!this.userId) return;
        try {
            const streamInfo = await this.twitchAPI.getStreamInfo(this.userId);

            if (streamInfo && streamInfo.type === 'live') {
                const startedAt = streamInfo.started_at;
                const config = this.getWidgetConfig('subgoals') || {};
                const lastKnownStart = config.lastStreamStart;

                if (startedAt && startedAt !== lastKnownStart) {
                    // New stream detected on startup (app opened after stream started).
                    // Take a baseline snapshot and sync the count.
                    log.info('BOT_STREAM_START_NEW', { startedAt });
                    await this.syncDailySubCountFromBaseline(startedAt);
                } else {
                    // Same stream — just re-sync the count in case subs happened
                    // while the app was closed.
                    log.info('BOT_STREAM_RESYNCING_COUNT');
                    await this.syncDailySubCountFromBaseline(startedAt);
                }
            } else {
                // Stream is offline — ensure count is reset.
                const config = this.getWidgetConfig('subgoals') || {};
                if (config.lastStreamStart) {
                    log.info('BOT_STREAM_OFFLINE_CLEANUP');
                    this.resetDailySubCount();
                    this.saveWidgetConfig('subgoals', { lastStreamStart: null, streamStartSubTotal: null });
                }
            }
        } catch (e) {
            log.error('BOT_STREAM_STATUS_ERROR', { error: e.message || e });
        }
    }

    /**
     * Fetches the current raw sub total and computes dailyCurrentCount
     * as (currentTotal - streamStartSubTotal).
     * If no baseline exists yet, creates one now.
     */
    async syncDailySubCountFromBaseline(startedAt) {
        const config = this.getWidgetConfig('subgoals') || {};
        const currentTotal = await this.twitchAPI.fetchRawSubTotal();
        if (currentTotal === null) return; // API unavailable, skip

        let baseline = config.streamStartSubTotal;

        if (baseline === null || baseline === undefined || config.lastStreamStart !== startedAt) {
            // First time we see this stream — store baseline and reset counter
            baseline = currentTotal;
            this.saveWidgetConfig('subgoals', {
                lastStreamStart: startedAt,
                streamStartSubTotal: baseline,
                dailyCurrentCount: 0,
                dailyGoalCount: config.baseDailyGoalCount || config.dailyGoalCount || 10
            });
            log.info('BOT_DAILY_BASELINE_SET', { baseline, startedAt });
            this.emit('daily-sub-count-update', 0);
            return;
        }

        // Baseline exists for this stream — compute gained subs
        const gained = Math.max(0, currentTotal - baseline);
        const goal = config.dailyGoalCount || 10;

        this.saveWidgetConfig('subgoals', {
            lastStreamStart: startedAt,
            dailyCurrentCount: gained
        });
        log.info('BOT_DAILY_SYNCED', { baseline, currentTotal, gained });
        this.emit('daily-sub-count-update', gained);
    }

    async fetchRawSubTotal() {
        return this.twitchAPI.fetchRawSubTotal();
    }

    addCommand(command, response) {
        this.configManager.setCommand(command, response);
    }

    removeCommand(command) {
        this.configManager.removeCommand(command);
    }

    addBannedWord(word) {
        this.configManager.addBannedWord(word);
        this._cachedBannedWords = null;
        return this.getBannedWords();
    }

    removeBannedWord(word) {
        this.configManager.removeBannedWord(word);
        this._cachedBannedWords = null;
        return this.getBannedWords();
    }

    clearBannedWords() {
        this.configManager.clearBannedWords();
        this._cachedBannedWords = null;
    }

    startGiveaway() {
        this.configManager.setGiveawayActive(true);
        this.configManager.clearGiveawayParticipants();
        const config = this.getConfig();
        const startMsg = config.giveawayStartMessage !== undefined
            ? config.giveawayStartMessage
            : 'Le giveaway commence ! Tapez !giveaway pour participer.';
        if (startMsg && this.isConnected) {
            this.say(startMsg);
        }
        this.emit('participants-updated');
    }

    stopGiveaway() {
        this.configManager.setGiveawayActive(false);
        const config = this.getConfig();
        const stopMsg = config.giveawayStopMessage !== undefined
            ? config.giveawayStopMessage
            : 'Le giveaway est terminé !';
        if (stopMsg && this.isConnected) {
            this.say(stopMsg);
        }
    }

    drawWinner() {
        const participants = this.getParticipants();
        if (participants.length === 0) return null;
        const winner = participants[Math.floor(Math.random() * participants.length)];
        const config = this.getConfig();
        const winMsgTemplate = config.giveawayWinMessage !== undefined
            ? config.giveawayWinMessage
            : 'Félicitations {winner} !';
        if (winMsgTemplate && this.isConnected) {
            const winMessage = winMsgTemplate.replace('{winner}', winner);
            setTimeout(() => {
                this.say(winMessage);
            }, 3000);
        }
        return winner;
    }

    clearParticipants() {
        this.configManager.clearGiveawayParticipants();
        this.emit('participants-updated');
    }

    triggerAlert(type, data) {
        this.alertManager.trigger(type, data);
    }
    isDevMockEnabled() { return this.rewardsManager.isDevMockEnabled(); }
    async getCustomRewards() { return this.rewardsManager.getCustomRewards(); }
    async createCustomReward(data) { return this.rewardsManager.createReward(data); }
    async updateCustomReward(id, data) { return this.rewardsManager.updateReward(id, data); }
    async deleteCustomReward(id) { return this.rewardsManager.deleteReward(id); }
    handleRedemption(rewardId, tags, message) { this.rewardsManager.handleRedemption(rewardId, tags, message); }

    async banUser(broadcasterId, userId, duration, reason) {
        return this.twitchAPI.banUser(broadcasterId, userId, duration, reason);
    }
    async deleteMessage(broadcasterId, messageId) {
        return this.twitchAPI.deleteMessage(broadcasterId, messageId);
    }
    async createClip(broadcasterId) {
        return this.twitchAPI.createClip(broadcasterId);
    }
    async fetchChannelEmotes() {
        return this.twitchAPI.fetchChannelEmotes();
    }
    async searchCategories(query) {
        return this.twitchAPI.searchCategories(query);
    }
    async getSteamGridDbImage(gameName) {
        return this.twitchAPI.getSteamGridDbImage(gameName);
    }
    async getSchedule() {
        return this.twitchAPI.getSchedule();
    }
    async createScheduleSegment(segment) {
        return this.twitchAPI.createScheduleSegment(segment);
    }
    async updateScheduleSegment(id, segment) {
        return this.twitchAPI.updateScheduleSegment(id, segment);
    }
    async deleteScheduleSegment(id) {
        return this.twitchAPI.deleteScheduleSegment(id);
    }

    updateLastSub(name) {
        this.lastSub = { name };
        this.configManager.setLastEvent('sub', this.lastSub);
        this.emit('last-sub', this.lastSub);
    }

    updateLastFollow(name) {
        this.lastFollow = { name };
        this.configManager.setLastEvent('follow', this.lastFollow);
        this.emit('last-follow', this.lastFollow);
    }

    updateLastDonation(name, amount) {
        this.lastDonation = { name, amount };
        this.configManager.setLastEvent('donation', this.lastDonation);
        this.emit('last-donation', this.lastDonation);
    }
}

module.exports = TwitchBot;
