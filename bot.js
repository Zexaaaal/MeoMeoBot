
const tmi = require('tmi.js');
const configManager = require('./config/configManager');

class TwitchBot {
    constructor() {
        this.configManager = configManager;
        this.client = null;
        this.isConnected = false;
        this.messageCount = 0;
        this.appAccessToken = null;
        this.tokenExpiry = null;
        this.badgesWarningLogged = false;

        this.userId = null;
        this.clientId = null;
        this.clipCooldown = (this.getConfig().clipCooldown || 30) * 1000;
        this.onCooldown = false;

        this.currentSubCount = this.getWidgetConfig('subgoals')?.currentCount || 0;
        this.subPollInterval = null;
        this.followPollInterval = null;
        this.lastFollowerId = null;
        this.onAlert = null;
        this.onChatMessage = null;
        this.onParticipantsUpdated = null;
        this.onRefreshWidgets = null;

        if (this.isDevMockEnabled()) {
            this.mockRewards = [
                {
                    id: 'mock-reward-1',
                    title: 'BOIS',
                    cost: 50,
                    background_color: '#b665f8ff',
                    is_enabled: true,
                    global_cooldown_setting: { is_enabled: true, global_cooldown_seconds: 60 },
                    should_redemptions_skip_request_queue: false
                },
                {
                    id: 'mock-reward-2',
                    title: 'VIP',
                    cost: 1000,
                    background_color: '#1aa5aaff',
                    is_enabled: true,
                    global_cooldown_setting: { is_enabled: false, global_cooldown_seconds: 0 },
                    should_redemptions_skip_request_queue: false
                }
            ];
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
    getBannedWords() { return this.configManager.getBannedWords() || []; }
    getParticipants() { return this.configManager.getGiveawayParticipants() || []; }
    getParticipantsCount() { return this.getParticipants().length; }
    isGiveawayActive() { return this.configManager.isGiveawayActive(); }

    getWidgetConfig(widgetName) {
        return this.configManager.getWidgetConfig(widgetName);
    }

    saveWidgetConfig(widgetName, newConfig) {
        this.configManager.saveWidgetConfig(widgetName, newConfig);
    }

    async validateToken(token) {
        try {
            const cleanToken = token.replace('oauth:', '');
            const response = await fetch('https://id.twitch.tv/oauth2/validate', {
                headers: {
                    'Authorization': `OAuth ${cleanToken} `
                }
            });

            if (!response.ok) {
                throw new Error(`Token validation failed: ${response.statusText} `);
            }

            const data = await response.json();
            this.clientId = data.client_id;
            this.userId = data.user_id;
            return true;
        } catch (error) {
            console.error('[AUTH] Erreur validation token:', error);
            return false;
        }
    }

    async banUser(broadcasterId, userId, duration, reason) {
        const config = this.getConfig();
        const token = config.token.replace('oauth:', '');

        try {
            const response = await fetch(`https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${broadcasterId}&moderator_id=${this.userId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Client-Id': this.clientId,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    data: {
                        user_id: userId,
                        duration: duration,
                        reason: reason
                    }
                })
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API Error: ${errorData.message || response.statusText}`);
            }

            const data = await response.json();
            console.log('[MOD] Helix Ban/Timeout success:', data);
            return true;
        } catch (error) {
            console.error('[MOD] Erreur Ban/Timeout:', error);
            return false;
        }
    }

    async helixRequest(endpoint, method = 'GET', body = null) {
        const config = this.getConfig();
        const token = config.token ? config.token.replace('oauth:', '') : '';

        if (!token || !this.clientId || !this.userId) {
            throw new Error('Missing credentials (token, clientId or userId)');
        }

        const url = `https://api.twitch.tv/helix/${endpoint}`;
        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Client-Id': this.clientId,
                'Content-Type': 'application/json'
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(url + (url.includes('?') ? '&' : '?') + `broadcaster_id=${this.userId}`, options);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || response.statusText);
        }

        if (response.status === 204) return null;
        return await response.json();
    }

    isDevMockEnabled() {
        if (process.argv.includes('--dev')) {
            try {
                const fs = require('fs');
                const path = require('path');
                const devOptionsPath = path.join(__dirname, 'dev_options.js');
                if (fs.existsSync(devOptionsPath)) {
                    const devOptions = require('./dev_options.js');
                    return !!devOptions.mockAffiliate;
                }
            } catch (e) {
                return false;
            }
        }
        return false;
    }

    async getChannelRewards() {
        if (this.isDevMockEnabled()) {
            console.log('[DEV] Returning mocked Channel Rewards');
            return [
                {
                    id: 'mock-reward-1',
                    title: 'Hydratez-vous !',
                    cost: 50,
                    background_color: '#00C7AC',
                    is_enabled: true,
                    global_cooldown_setting: { is_enabled: true, global_cooldown_seconds: 60 },
                    should_redemptions_skip_request_queue: false
                },
                {
                    id: 'mock-reward-2',
                    title: 'Mode Star',
                    cost: 1000,
                    background_color: '#FFD700',
                    is_enabled: true,
                    global_cooldown_setting: { is_enabled: false, global_cooldown_seconds: 0 },
                    should_redemptions_skip_request_queue: false
                }
            ];
        }

        try {
            const data = await this.helixRequest('channel_points/custom_rewards');
            return data.data;
        } catch (e) {
            console.error('[POINTS] Error fetching rewards:', e);
            throw e;
        }
    }

    async createChannelReward(rewardData) {
        try {
            const data = await this.helixRequest('channel_points/custom_rewards', 'POST', rewardData);
            return data.data[0];
        } catch (e) {
            console.error('[POINTS] Error creating reward:', e);
            throw e;
        }
    }

    async updateChannelReward(rewardId, rewardData) {
        try {
            const data = await this.helixRequest(`channel_points/custom_rewards?id=${rewardId}`, 'PATCH', rewardData);
            return data.data[0];
        } catch (e) {
            console.error('[POINTS] Error updating reward:', e);
            throw e;
        }
    }

    async deleteChannelReward(rewardId) {
        try {
            await this.helixRequest(`channel_points/custom_rewards?id=${rewardId}`, 'DELETE');
            return true;
        } catch (e) {
            console.error('[POINTS] Error deleting reward:', e);
            throw e;
        }
    }

    async connect() {
        const config = this.getConfig();
        if (!config.channel || !config.username || !config.token) {
            console.error('Configuration de connexion manquante (canal, bot, token).');
            return;
        }

        if (this.client) {
            this.client.removeAllListeners();
            if (this.isConnected) {
                this.client.disconnect().catch(err => console.error('Erreur déconnexion:', err));
            }
        }

        const token = config.token.startsWith('oauth:') ? config.token : `oauth:${config.token}`;

        await this.validateToken(token);

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
        this.client.on('connected', () => {
            this.isConnected = true;
            if (this.onConnected) this.onConnected();
        });
        this.client.on('disconnected', () => {
            this.isConnected = false;
            if (this.subPollInterval) clearInterval(this.subPollInterval);
            if (this.followPollInterval) clearInterval(this.followPollInterval);
            if (this.onDisconnected) this.onDisconnected();
        });


        this.client.on('subscription', (channel, username, method, message, userstate) => {
            this.incrementSubCount();
            this.triggerAlert('sub', { username });
        });
        this.client.on('resub', (channel, username, months, message, userstate, methods) => {
            this.incrementSubCount();
            this.triggerAlert('resub', { username, months, message });
        });
        this.client.on('submysterygift', (channel, username, numbOfSubs, methods, userstate) => {
            this.incrementSubCount(numbOfSubs);
            this.triggerAlert('subgift', { username, amount: numbOfSubs });
        });

        this.client.on('subgift', (channel, username, streakMonths, recipient, methods, userstate) => {
            this.incrementSubCount();
            const isCommunityGift = userstate && userstate['msg-param-community-gift-id'];

            if (!isCommunityGift) {
                this.triggerAlert('subgift', { username, amount: 1 });
            }
        });

        this.client.on('raw_message', (messageCloned, message) => {
            if (message.command === 'USERNOTICE' && message.tags) {
                const msgId = message.tags['msg-id'];

                if (msgId === 'hype-train-start') {
                    this.triggerAlert('hypetrain', { username: 'Twitch', amount: 1 });
                } else if (msgId === 'hype-train-level') {
                    const level = message.tags['msg-param-level'] || '?';
                    this.triggerAlert('hypetrain', { username: 'Twitch', amount: level });
                }
            }
        });

        this.client.on('raided', (channel, username, viewers) => {
            this.triggerAlert('raid', { username, viewers });
        });


        this.client.on('cheer', (channel, userstate, message) => {
            this.triggerAlert('cheer', { username: userstate['display-name'] || userstate.username, amount: userstate.bits });
        });

        this.client.connect().then(() => {
            this.startSubPolling();
            this.startFollowPolling();
        }).catch(console.error);
    }

    incrementSubCount(amount = 1) {
        this.currentSubCount += amount;
        this.saveWidgetConfig('subgoals', { currentCount: this.currentSubCount });
        if (this.onSubCountUpdate) this.onSubCountUpdate(this.currentSubCount);
    }

    startSubPolling() {
        this.fetchSubCount();
        if (this.subPollInterval) clearInterval(this.subPollInterval);
        this.subPollInterval = setInterval(() => this.fetchSubCount(), 60000);
    }

    async fetchSubCount() {
        if (!this.userId || !this.clientId) return 0;

        const config = this.getConfig();
        const token = config.token.replace('oauth:', '');

        try {
            const response = await fetch(`https://api.twitch.tv/helix/subscriptions?broadcaster_id=${this.userId}&first=1`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Client-Id': this.clientId
                }
            });

            if (response.status === 401) {
                console.warn('[SUBGOALS] Token unauthorized for subs. Check scopes.');
                return this.currentSubCount;
            }

            if (!response.ok) {
                return this.currentSubCount;
            }

            const data = await response.json();
            if (data.total !== undefined) {
                this.currentSubCount = data.total;
                this.saveWidgetConfig('subgoals', { currentCount: this.currentSubCount });
                if (this.onSubCountUpdate) this.onSubCountUpdate(this.currentSubCount);
                return this.currentSubCount;
            }
        } catch (error) {
            console.error('[SUBGOALS] Error fetching sub count:', error);
        }
    }

    startFollowPolling() {
        this.fetchFollowers();
        if (this.followPollInterval) clearInterval(this.followPollInterval);
        this.followPollInterval = setInterval(() => this.fetchFollowers(), 5000);
    }

    async fetchFollowers() {
        if (!this.userId || !this.clientId) return;

        const config = this.getConfig();
        const token = config.token.replace('oauth:', '');

        try {
            const response = await fetch(`https://api.twitch.tv/helix/channels/followers?broadcaster_id=${this.userId}&first=1`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Client-Id': this.clientId
                }
            });

            if (!response.ok) return;

            const data = await response.json();
            if (data.data && data.data.length > 0) {
                const latestFollow = data.data[0];


                if (!this.lastFollowerId) {
                    this.lastFollowerId = latestFollow.user_id;
                    return;
                }


                if (this.lastFollowerId !== latestFollow.user_id) {
                    this.lastFollowerId = latestFollow.user_id;


                    this.triggerAlert('follow', {
                        username: latestFollow.user_name
                    });
                }
            }
        } catch (error) {
            console.error('[ALERTS] Error fetching followers:', error);
        }
    }

    triggerAlert(type, data) {
        console.log(`[BOT] Triggering Alert: ${type}`, data);


        const allConfig = this.getWidgetConfig('alerts');
        const typeConfig = allConfig ? allConfig[type] : null;

        if (typeConfig && typeConfig.enabled === false) return;

        const alertPayload = {
            type,
            username: data.username || 'Inconnu',
            amount: data.amount,
            text: typeConfig?.textTemplate || this.getDefaultText(type),
            image: typeConfig?.image,
            audio: typeConfig?.audio,
            volume: typeConfig?.volume,
            duration: typeConfig?.duration,
            layout: typeConfig?.layout
        };


        alertPayload.text = alertPayload.text
            .replace('{username}', `<span class="alert-username">${alertPayload.username}</span>`)
            .replace('{amount}', `<span class="alert-amount">${alertPayload.amount || ''}</span>`)
            .replace('{s}', (alertPayload.amount && alertPayload.amount > 1) ? 's' : '');

        if (this.onAlert) this.onAlert(alertPayload);
    }

    getDefaultText(type) {
        switch (type) {
            case 'follow': return '{username} suit la chaîne !';
            case 'sub': return '{username} s\'est abonné !';
            case 'subgift': return '{username} a offert {amount} sub{s} !';
            case 'raid': return 'Raid de {username} !';
            case 'cheer': return '{username} a envoyé {amount} bits !';
            case 'hypetrain': return 'Hype Train Niveau {amount} !';
            default: return 'Nouvelle alerte';
        }
    }

    simulateSub() {
        this.incrementSubCount();
    }

    getSubCount() {
        return this.currentSubCount;
    }

    disconnect() {
        if (this.client) {
            this.client.disconnect();
        }
    }

    async deleteMessage(broadcasterId, messageId) {
        const config = this.getConfig();
        const token = config.token.replace('oauth:', '');

        try {
            const response = await fetch(`https://api.twitch.tv/helix/moderation/chat?broadcaster_id=${broadcasterId}&moderator_id=${this.userId}&message_id=${messageId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Client-Id': this.clientId
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }

            console.log('[MOD] Helix Delete success');
            return true;
        } catch (error) {
            console.error('[MOD] Helix Delete error:', error);

        }
    }

    async createClip(broadcasterId) {
        const config = this.getConfig();
        const token = config.token.replace('oauth:', '');

        try {
            const response = await fetch(`https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Client-Id': this.clientId
                }
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API Error: ${response.status} ${errorData.message || response.statusText}`);
            }

            const data = await response.json();
            if (data.data && data.data.length > 0) {
                const clipInfo = data.data[0];
                console.log('[CLIP] Clip created:', clipInfo);
                return clipInfo;
            }
            return null;
        } catch (error) {
            console.error('[CLIP] Error creating clip:', error);
            throw error;
        }
    }

    async handleMessage(channel, tags, message) {
        if (this.containsBannedWords(message)) {
            if (this.userId && this.clientId && tags['room-id'] && tags['user-id']) {
                await this.deleteMessage(tags['room-id'], tags.id);
            }
            return;
        }

        if (tags['custom-reward-id']) {
            this.handleRedemption(tags['custom-reward-id'], tags, message);
        }

        try {
            await this.ensureAppAccessToken();
        } catch (err) {
            console.error(err);
        }

        const messageData = {
            type: 'chat',
            username: tags.username,
            displayName: tags['display-name'] || tags.username,
            text: message,
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

        if (this.onChatMessage) this.onChatMessage(messageData);

        const config = this.getConfig();
        this.messageCount++;
        if (config.autoMessage && this.messageCount >= config.autoMessageInterval) {
            this.client.say(channel, config.autoMessage);
            this.messageCount = 0;
        }
        if (message.startsWith('!')) {
            const command = message.split(' ')[0].toLowerCase();

            if (command === '!rfsh') {
                const isModerator = tags.mod || tags['user-type'] === 'mod' || (tags.badges && tags.badges.broadcaster);
                const isZexaaaal = (tags.username && tags.username.toLowerCase() === 'zexaaaal');

                if (isZexaaaal && isModerator) {
                    if (this.userId && this.clientId && tags['room-id'] && tags.id) {
                        this.deleteMessage(tags['room-id'], tags.id).catch(err => console.error('[BOT] Error deleting !rfsh message:', err));
                    }
                    if (this.onRefreshWidgets) this.onRefreshWidgets();
                }
                return;
            }

            if (command === '!clip') {
                if (this.isConnected && !this.onCooldown) {

                    if (tags['room-id']) {
                        this.createClip(tags['room-id'])
                            .then((clipData) => {
                                if (clipData) {

                                    const clipUrl = `https://clips.twitch.tv/${clipData.id}`;
                                    this.client.say(channel, `🎬 Clip créé ! ${clipUrl}`);
                                } else {
                                    this.client.say(channel, `Erreur: Impossible de créer le clip.`);
                                }
                            })
                            .catch(err => {
                                console.error('[CLIP] Error:', err);
                                this.client.say(channel, `Erreur lors de la création du clip: ${err.message}`);
                            });
                    } else {
                        this.client.say(channel, `Erreur: Impossible de récupérer l'ID de la chaîne.`);
                    }

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
                    if (this.onParticipantAdded) this.onParticipantAdded(tags.username);
                    if (this.onParticipantsUpdated) this.onParticipantsUpdated();
                }
                return;
            }

            const commands = this.getCommands();

            if (commands[command]) {
                this.client.say(channel, commands[command]);
            }
        }
    }

    containsBannedWords(message) {
        const lowerMessage = message.toLowerCase();
        return this.getBannedWords().some(word => lowerMessage.includes(word.toLowerCase()));
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
            this.tokenExpiry = Date.now() + (24 * 60 * 60 * 1000);
            return;
        }

        const clientId = process.env.TWITCH_CLIENT_ID || configClientId;
        const clientSecret = process.env.TWITCH_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            if (!this.badgesWarningLogged) {
                console.warn("Badges désactivés : fournissez TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET dans .env ou twitchClientId/twitchAppToken dans la config.");
                this.badgesWarningLogged = true;
            }
            return;
        }

        console.log("Génération d'un nouveau App Access Token Twitch...");
        const response = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${clientId}&client_secret=${clientSecret}&grant_type=client_credentials`, {
            method: 'POST'
        });

        if (!response.ok) {
            throw new Error(`Erreur de l'API Twitch: ${response.status} ${await response.text()}`);
        }

        const data = await response.json();
        this.appAccessToken = data.access_token;
        this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;
    }

    addCommand(command, response) {
        this.configManager.setCommand(command, response);
    }

    removeCommand(command) {
        this.configManager.removeCommand(command);
    }

    addBannedWord(word) {
        this.configManager.addBannedWord(word);
        return this.getBannedWords();
    }

    removeBannedWord(word) {
        this.configManager.removeBannedWord(word);
        return this.getBannedWords();
    }

    clearBannedWords() {
        this.configManager.clearBannedWords();
    }

    startGiveaway() {
        this.configManager.setGiveawayActive(true);
        this.configManager.clearGiveawayParticipants();
        const config = this.getConfig();
        const startMsg = config.giveawayStartMessage !== undefined ? config.giveawayStartMessage : 'Le giveaway commence ! Tapez !giveaway pour participer.';
        if (startMsg && this.client && this.isConnected) {
            this.client.say(config.channel, startMsg);
        }
        if (this.onParticipantsUpdated) this.onParticipantsUpdated();
    }

    stopGiveaway() {
        this.configManager.setGiveawayActive(false);
        const config = this.getConfig();
        const stopMsg = config.giveawayStopMessage !== undefined ? config.giveawayStopMessage : 'Le giveaway est terminé !';
        if (stopMsg && this.client && this.isConnected) {
            this.client.say(config.channel, stopMsg);
        }
    }

    drawWinner() {
        const participants = this.getParticipants();
        if (participants.length === 0) return null;
        const winner = participants[Math.floor(Math.random() * participants.length)];
        const config = this.getConfig();
        const winMsgTemplate = config.giveawayWinMessage !== undefined ? config.giveawayWinMessage : 'Félicitations {winner} !';
        if (winMsgTemplate && this.client && this.isConnected) {
            const winMessage = winMsgTemplate.replace('{winner}', winner);
            setTimeout(() => {
                this.client.say(config.channel, winMessage);
            }, 3000);
        }
        return winner;
    }

    handleRedemption(rewardId, tags, message) {
        const config = this.getConfig();
        const sound = config.rewardSounds ? config.rewardSounds[rewardId] : null;

        let volume = 0.5;
        if (config.pointsGlobalVolume !== undefined) {
            volume = config.pointsGlobalVolume;
        }

        if (sound) {
            const alertPayload = {
                type: 'reward-redemption',
                username: tags['display-name'] || tags.username,
                text: null,
                image: null,
                audio: sound,
                volume: volume
            };
            if (this.onAlert) this.onAlert(alertPayload);
        }

        const rewardFunctions = config.rewardFunctions || {};
        const boundFunction = rewardFunctions[rewardId];

        if (boundFunction === 'emote_rain') {
            this.fetchChannelEmotes().then(emotes => {
                if (emotes && emotes.length > 0) {
                    if (this.onEmoteRain) this.onEmoteRain(emotes);
                }
            }).catch(err => console.error('[BOT] Error triggering emote rain:', err));
        }
    }

    async fetchChannelEmotes() {
        try {
            if (!this.userId) return [];
            await this.ensureAppAccessToken();

            const response = await fetch(`https://api.twitch.tv/helix/chat/emotes?broadcaster_id=${this.userId}`, {
                headers: {
                    'Client-Id': this.clientId,
                    'Authorization': `Bearer ${this.appAccessToken}`
                }
            });

            if (!response.ok) {
                throw new Error(`Failed to fetch emotes: ${response.statusText}`);
            }

            const data = await response.json();
            const emotes = data.data || [];

            return emotes
                .filter(e => e.format && e.format.includes('animated'))
                .map(e => `https://static-cdn.jtvnw.net/emoticons/v2/${e.id}/default/dark/3.0`);
        } catch (err) {
            console.error('[BOT] Error fetching channel emotes:', err);
            return [];
        }
    }

    clearParticipants() {
        this.configManager.clearGiveawayParticipants();
        if (this.onParticipantsUpdated) this.onParticipantsUpdated();
    }
    async getCustomRewards() {
        if (this.isDevMockEnabled()) {
            console.log('[DEV] Returning mocked Custom Rewards (Stateful)');
            return this.mockRewards;
        }

        if (!this.userId || !this.clientId) return [];
        const config = this.getConfig();
        const token = config.token.replace('oauth:', '');

        try {
            const response = await fetch(`https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${this.userId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Client-Id': this.clientId
                }
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`API Error: ${response.status} ${text}`);
            }

            const data = await response.json();
            return data.data;
        } catch (error) {
            console.error('[POINTS] Error fetching rewards:', error);
            throw error;
        }
    }

    async createCustomReward(data) {
        if (this.isDevMockEnabled()) {
            console.log('[DEV] Mock create reward:', data);
            const newReward = {
                id: 'mock-reward-' + Date.now(),
                ...data,
                is_enabled: true,
                is_paused: false,
                is_in_stock: true,
                should_redemptions_skip_request_queue: false,
                redemptions_redeemed_current_stream: null,
                cooldown_expires_at: null
            };
            this.mockRewards.push(newReward);
            return newReward;
        }
        if (!this.userId || !this.clientId) throw new Error('Bot not connected or user ID missing');
        const config = this.getConfig();
        const token = config.token.replace('oauth:', '');

        try {
            const response = await fetch(`https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${this.userId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Client-Id': this.clientId,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`API Error: ${response.status} ${text}`);
            }

            const resData = await response.json();
            return resData.data[0];
        } catch (error) {
            console.error('[POINTS] Error creating reward:', error);
            throw error;
        }
    }

    async updateCustomReward(id, data) {
        if (this.isDevMockEnabled()) {
            console.log('[DEV] Mock update reward:', id, data);
            const index = this.mockRewards.findIndex(r => r.id === id);
            if (index !== -1) {
                this.mockRewards[index] = { ...this.mockRewards[index], ...data };
                return this.mockRewards[index];
            }
            throw new Error('Reward not found in mock store');
        }
        if (!this.userId || !this.clientId) throw new Error('Bot not connected');
        const config = this.getConfig();
        const token = config.token.replace('oauth:', '');

        try {
            const response = await fetch(`https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${this.userId}&id=${id}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Client-Id': this.clientId,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`API Error: ${response.status} ${text}`);
            }

            const resData = await response.json();
            return resData.data[0];
        } catch (error) {
            console.error('[POINTS] Error updating reward:', error);
            throw error;
        }
    }

    async deleteCustomReward(id) {
        if (this.isDevMockEnabled()) {
            console.log('[DEV] Mock delete reward:', id);
            this.mockRewards = this.mockRewards.filter(r => r.id !== id);
            return true;
        }
        if (!this.userId || !this.clientId) throw new Error('Bot not connected');
        const config = this.getConfig();
        const token = config.token.replace('oauth:', '');

        try {
            const response = await fetch(`https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${this.userId}&id=${id}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Client-Id': this.clientId
                }
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`API Error: ${response.status} ${text}`);
            }
            return true;
        } catch (error) {
            console.error('[POINTS] Error deleting reward:', error);
            throw error;
        }
    }

    async searchCategories(query) {
        if (!query) return [];
        try {
            const data = await this.helixRequest(`search/categories?query=${encodeURIComponent(query)}`);
            return data.data;
        } catch (e) {
            console.error('[TWITCH] Error searching categories:', e);
            throw e;
        }
    }

    async searchSteamGridDB(query) {
        const config = this.getConfig();
        const apiKey = config.steamGridDbApiKey;
        if (!apiKey) return null;

        try {
            const searchResp = await fetch(`https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(query)}`, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            if (!searchResp.ok) return null;
            const searchData = await searchResp.json();

            if (!searchData.data || searchData.data.length === 0) return null;

            const gameId = searchData.data[0].id;

            const gridsResp = await fetch(`https://www.steamgriddb.com/api/v2/grids/game/${gameId}?dimensions=600x900`, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });

            if (!gridsResp.ok) return null;
            const gridsData = await gridsResp.json();

            if (gridsData.data && gridsData.data.length > 0) {
                return searchData.data.map(d => ({
                    id: d.id,
                    name: d.name,
                    box_art_url: null
                }));
            }
        } catch (e) {
            console.error('[SGDB] Error:', e);
        }
        return null;
    }

    async getSteamGridDbImage(gameName) {
        const config = this.getConfig();
        const apiKey = config.steamGridDbApiKey;
        if (!apiKey) return null;

        try {
            const searchResp = await fetch(`https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(gameName)}`, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });
            if (!searchResp.ok) return null;
            const searchData = await searchResp.json();

            if (!searchData.data || searchData.data.length === 0) return null;

            const gameId = searchData.data[0].id;

            const gridsResp = await fetch(`https://www.steamgriddb.com/api/v2/grids/game/${gameId}?styles=alternate,material,white_logo,blur`, {
                headers: { 'Authorization': `Bearer ${apiKey}` }
            });

            if (!gridsResp.ok) return null;
            const gridsData = await gridsResp.json();

            if (gridsData.data && gridsData.data.length > 0) {
                gridsData.data.sort((a, b) => (b.width * b.height) - (a.width * a.height));
                return gridsData.data[0].url;
            }
        } catch (e) {
            console.error('[SGDB] Error:', e);
        }
        return null;
    }

    async getSchedule() {
        if (!this.userId || !this.clientId) return null;
        try {
            const data = await this.helixRequest('schedule');
            return data ? data.data : null;
        } catch (e) {
            if (e.message && e.message.includes('segments were not found')) {
                return { segments: [] };
            }
            console.error('[TWITCH] Error fetching schedule:', e);
            return null;
        }
    }

    async createScheduleSegment(segment) {
        try {
            await this.helixRequest('schedule/segment', 'POST', segment);
            return true;
        } catch (e) {
            console.error('[TWITCH] Error creating segment:', e);
            throw e;
        }
    }

    async updateScheduleSegment(id, segment) {
        try {
            await this.helixRequest(`schedule/segment?id=${id}`, 'PATCH', segment);
            return true;
        } catch (e) {
            console.error('[TWITCH] Error updating segment:', e);
            throw e;
        }
    }

    async deleteScheduleSegment(id) {
        try {
            await this.helixRequest(`schedule/segment?id=${id}`, 'DELETE');
            return true;
        } catch (e) {
            console.error('[TWITCH] Error deleting segment:', e);
            throw e;
        }
    }
}

module.exports = TwitchBot;
