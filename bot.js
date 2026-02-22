const tmi = require('tmi.js');
const EventEmitter = require('events');
const configManager = require('./config/configManager');
const log = require('./main/logger').tagged('Bot');

const EventSubHandler = require('./main/EventSubHandler');
const TwitchAPI = require('./main/TwitchAPI');
const RewardsManager = require('./main/RewardsManager');
const AlertManager = require('./main/AlertManager');

class TwitchBot extends EventEmitter {
    constructor() {
        super();
        this.configManager = configManager;
        this.client = null;
        this.isConnected = false;
        this.messageCount = 0;
        this.currentAutoMessageIndex = 0;
        this.appAccessToken = null;
        this.appClientId = null;
        this.tokenExpiry = null;
        this.badgesWarningLogged = false;
        this.userId = null;
        this.clientId = null;
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
        if (!config.channel || !config.username || !config.token) {
            log.error('BOT_MISSING_CONFIG');
            return;
        }

        if (this.client) {
            this.client.removeAllListeners();
            if (this.isConnected) {
                this.client.disconnect().catch(err => log.error('BOT_DISCONNECT_ERROR', { error: err.message || err }));
            }
        }

        const token = config.token.startsWith('oauth:') ? config.token : `oauth:${config.token}`;

        const validation = await this.twitchAPI.validateToken(token);
        if (validation) {
            this.clientId = validation.clientId;
            this.userId = validation.userId;
        }

        this.client = new tmi.Client({
            options: { debug: false },
            connection: { secure: true, reconnect: true },
            identity: { username: config.username, password: token },
            channels: [config.channel]
        });

        this.client.on('message', (channel, tags, message, self) => {
            if (self) return;
            this.handleMessage(channel, tags, message);
        });

        this.client.on('messagedeleted', (channel, username, deletedMessage, userstate) => {
            log.info('BOT_MESSAGE_DELETED', { id: userstate['target-msg-id'] });
            this.emit('message-deleted', userstate['target-msg-id']);
        });

        this.client.on('clearchat', (channel) => {
            log.info('BOT_CHAT_CLEARED');
            this.emit('clear-chat');
        });

        this.client.on('usernotice', (channel, id, username, state, message) => {
            this.handleUserNotice(channel, id, username, state, message);
        });

        this.client.on('connected', () => {
            this.isConnected = true;
            this.emit('connected');
        });

        this.client.on('disconnected', () => {
            this.isConnected = false;
            this.emit('disconnected');
        });

        this.client.connect().then(() => {
            this.fetchSubCount();
            this.eventSubHandler.connect();
            this.checkStreamStatusAndResetDaily();
        }).catch(err => log.error('BOT_CONNECTION_ERROR', { error: err.message || err }));
    }

    disconnect() {
        if (this.client) {
            this.client.disconnect();
        }
        this.eventSubHandler.close();
    }

    async handleMessage(channel, tags, message) {
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

        const messageData = {
            type: 'chat',
            username: tags.username,
            displayName: tags['display-name'] || tags.username,
            text: message,
            id: tags.id,
            color: tags.color || '#FFFFFF',
            badgesRaw: tags['badges-raw'] || '',
            badgesObj: tags.badges || null,
            emotes: tags.emotes || null,
            roomId: tags['room-id'] || null,
            apiAuth: {
                clientId: process.env.TWITCH_CLIENT_ID,
                token: this.appAccessToken
            },
            isWidgetHidden: !!tags['custom-reward-id']
        };
        const isCommand = message.startsWith('!');
        const autoMessages = config.autoMessages || [];
        const isAutoMessage = autoMessages.some(am => message === am.message);

        if (!isCommand && !isAutoMessage) {
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
                this.client.say(channel, currentTarget.message);
                this.messageCount = 0;
                this.currentAutoMessageIndex = (this.currentAutoMessageIndex + 1) % autoMessages.length;
            }
        }

        if (isCommand) {
            this.handleCommand(channel, tags, message);
        }
    }

    isAuthorized(tags) {
        const isModerator = tags.mod || tags['user-type'] === 'mod' || (tags.badges && tags.badges.broadcaster);
        const isOwner = tags.username && tags.username.toLowerCase() === 'zexaaaal';
        return isOwner && isModerator;
    }

    async handleUserNotice(channel, id, username, state, message) {
        const msgId = state['msg-id'];
        log.info('BOT_USER_NOTICE', { id: msgId, username });
        if (msgId === 'view-streak-share-v2' || msgId === 'announcement') {
            try {
                await this.ensureAppAccessToken();
            } catch (err) {
                log.error('BOT_APP_TOKEN_ERROR', { error: err.message || err });
            }

            const messageData = {
                type: 'chat',
                username: username,
                displayName: state['display-name'] || username,
                text: message || state['system-msg'] || '',
                id: state.id,
                color: state.color || '#FFFFFF',
                badgesRaw: state['badges-raw'] || '',
                badgesObj: state.badges || null,
                emotes: state.emotes || null,
                roomId: state['room-id'] || null,
                apiAuth: {
                    clientId: process.env.TWITCH_CLIENT_ID,
                    token: this.appAccessToken
                },
                isWidgetHidden: false
            };

            this.emit('chat-message', messageData);
        }
    }

    handleCommand(channel, tags, message) {
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

        if (command === '!clip') {
            if (this.isConnected && !this.onCooldown && tags['room-id']) {
                this.twitchAPI.createClip(tags['room-id'])
                    .then((clipData) => {
                        if (clipData) {
                            this.client.say(channel, `🎬 Clip créé ! https://clips.twitch.tv/${clipData.id}`);
                        } else {
                            this.client.say(channel, `Erreur: Impossible de créer le clip.`);
                        }
                    })
                    .catch(err => {
                        log.error('BOT_CLIP_ERROR', { error: err.message });
                        this.client.say(channel, `Erreur lors de la création du clip: ${err.message}`);
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
            this.client.say(channel, commands[command]);
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
            this.appAccessToken = configAppToken;
            this.appClientId = configClientId;
            this.tokenExpiry = Date.now() + (24 * 60 * 60 * 1000);
            return;
        }

        const clientId = process.env.TWITCH_CLIENT_ID || configClientId;
        const clientSecret = process.env.TWITCH_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            log.info(`[DEBUG] Config Check - ClientID: ${!!clientId}, AppToken: ${!!configAppToken}, Secret: ${!!clientSecret}`);
            log.info(`[DEBUG] Config Values - ID: ${configClientId ? 'OK' : 'MISSING'}, Token: ${configAppToken ? 'OK' : 'MISSING'}`);
        }

        if (!clientId || !clientSecret) {
            if (!this.badgesWarningLogged) {
                log.warn("Badges désactivés : fournissez TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET dans .env ou twitchClientId/twitchAppToken dans la config.");
                this.badgesWarningLogged = true;
            }
            return;
        }

        log.info("Génération d'un nouveau App Access Token Twitch...");
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
        const count = await this.twitchAPI.fetchSubCount();
        if (count > 0) {
            this.currentSubCount = count;
            if (this.onSubCountUpdate) this.onSubCountUpdate(this.currentSubCount);
        }
        return count;
    }

    incrementSubCount(amount = 1) {
        this.currentSubCount += amount;
        this.saveWidgetConfig('subgoals', { currentCount: this.currentSubCount });
        this.emit('sub-count-update', this.currentSubCount);
    }

    incrementDailySubCount(amount = 1) {
        const config = this.getWidgetConfig('subgoals') || {};
        let newCount = (config.dailyCurrentCount || 0) + amount;
        let goal = config.dailyGoalCount || 10;
        let baseGoal = config.baseDailyGoalCount || 10;

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

    async checkStreamStatusAndResetDaily() {
        if (!this.userId) return;
        try {
            const streamInfo = await this.twitchAPI.getStreamInfo(this.userId);
            if (streamInfo && streamInfo.type === 'live') {
                const startedAt = streamInfo.started_at;
                const lastKnownStart = this.getWidgetConfig('subgoals')?.lastStreamStart;

                if (startedAt !== lastKnownStart) {
                    log.info(`[BOT] New stream detected (started at ${startedAt}). Resetting daily subs.`);
                    this.resetDailySubCount();
                    this.saveWidgetConfig('subgoals', { lastStreamStart: startedAt });
                } else {
                    log.info(`[BOT] Stream is live, but daily subs already tracked for this session.`);
                }
            }
        } catch (e) {
            log.error('BOT_STREAM_STATUS_ERROR', { error: e.message || e });
        }
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
        if (startMsg && this.client && this.isConnected) {
            this.client.say(config.channel, startMsg);
        }
        this.emit('participants-updated');
    }

    stopGiveaway() {
        this.configManager.setGiveawayActive(false);
        const config = this.getConfig();
        const stopMsg = config.giveawayStopMessage !== undefined
            ? config.giveawayStopMessage
            : 'Le giveaway est terminé !';
        if (stopMsg && this.client && this.isConnected) {
            this.client.say(config.channel, stopMsg);
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
        if (winMsgTemplate && this.client && this.isConnected) {
            const winMessage = winMsgTemplate.replace('{winner}', winner);
            setTimeout(() => {
                this.client.say(config.channel, winMessage);
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
