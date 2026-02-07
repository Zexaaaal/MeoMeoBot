const tmi = require('tmi.js');
const configManager = require('./config/configManager');
const logger = require('./main/logger');

const EventSubHandler = require('./main/EventSubHandler');
const TwitchAPI = require('./main/TwitchAPI');
const RewardsManager = require('./main/RewardsManager');
const AlertManager = require('./main/AlertManager');

class TwitchBot {
    constructor() {
        this.configManager = configManager;
        this.client = null;
        this.isConnected = false;
        this.messageCount = 0;
        this.appAccessToken = null;
        this.appClientId = null;
        this.tokenExpiry = null;
        this.badgesWarningLogged = false;

        this.userId = null;
        this.clientId = null;
        this.clipCooldown = (this.getConfig().clipCooldown || 30) * 1000;
        this.onCooldown = false;

        this.currentSubCount = this.getWidgetConfig('subgoals')?.currentCount || 0;

        // Callbacks
        this.onAlert = null;
        this.onChatMessage = null;
        this.onParticipantsUpdated = null;
        this.onRefreshWidgets = null;
        this.onToggleWidgets = null;
        this.onMessageDeleted = null;
        this.onClearChat = null;
        this.onConnected = null;
        this.onDisconnected = null;
        this.onEmoteRain = null;
        this.onSubCountUpdate = null;
        this.onParticipantAdded = null;

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
    getBannedWords() { return this.configManager.getBannedWords() || []; }
    getParticipants() { return this.configManager.getGiveawayParticipants() || []; }
    getParticipantsCount() { return this.getParticipants().length; }
    isGiveawayActive() { return this.configManager.isGiveawayActive(); }
    getWidgetConfig(widgetName) { return this.configManager.getWidgetConfig(widgetName); }
    saveWidgetConfig(widgetName, newConfig) { this.configManager.saveWidgetConfig(widgetName, newConfig); }

    async connect() {
        const config = this.getConfig();
        if (!config.channel || !config.username || !config.token) {
            logger.error('Configuration de connexion manquante (canal, bot, token).');
            return;
        }

        if (this.client) {
            this.client.removeAllListeners();
            if (this.isConnected) {
                this.client.disconnect().catch(err => logger.error('Erreur déconnexion:', err));
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
            logger.log(`[BOT] Message deleted: ${userstate['target-msg-id']}`);
            if (this.onMessageDeleted) this.onMessageDeleted(userstate['target-msg-id']);
        });

        this.client.on('clearchat', (channel) => {
            logger.log('[BOT] Chat cleared');
            if (this.onClearChat) this.onClearChat();
        });

        this.client.on('connected', () => {
            this.isConnected = true;
            if (this.onConnected) this.onConnected();
        });

        this.client.on('disconnected', () => {
            this.isConnected = false;
            if (this.onDisconnected) this.onDisconnected();
        });

        this.client.connect().then(() => {
            this.fetchSubCount();
            this.eventSubHandler.connect();
        }).catch(console.error);
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
            logger.error(err);
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
        const isAutoMessage = config.autoMessage && message === config.autoMessage;

        if (this.onChatMessage && !isCommand && !isAutoMessage) {
            this.onChatMessage(messageData);
        }

        this.messageCount++;
        if (config.autoMessage && this.messageCount >= config.autoMessageInterval) {
            this.client.say(channel, config.autoMessage);
            this.messageCount = 0;
        }

        if (isCommand) {
            this.handleCommand(channel, tags, message);
        }
    }

    handleCommand(channel, tags, message) {
        const command = message.split(' ')[0].toLowerCase();
        const config = this.getConfig();

        if (command === '!rfsh') {
            const isModerator = tags.mod || tags['user-type'] === 'mod' || (tags.badges && tags.badges.broadcaster);
            const isZexaaaal = (tags.username && tags.username.toLowerCase() === 'zexaaaal');
            if (isZexaaaal && isModerator) {
                if (this.userId && this.clientId && tags['room-id'] && tags.id) {
                    this.twitchAPI.deleteMessage(tags['room-id'], tags.id).catch(err =>
                        logger.error('[BOT] Error deleting !rfsh message:', err));
                }
                if (this.onRefreshWidgets) this.onRefreshWidgets();
            }
            return;
        }

        if (command === '!oon' || command === '!ooff') {
            const isModerator = tags.mod || tags['user-type'] === 'mod' || (tags.badges && tags.badges.broadcaster);
            const isZexaaaal = (tags.username && tags.username.toLowerCase() === 'zexaaaal');
            if (isZexaaaal && isModerator) {
                if (this.userId && this.clientId && tags['room-id'] && tags.id) {
                    this.twitchAPI.deleteMessage(tags['room-id'], tags.id).catch(err =>
                        logger.error('[BOT] Error deleting visibility command:', err));
                }
                if (this.onToggleWidgets) this.onToggleWidgets(command === '!oon');
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
                        logger.error('[CLIP] Error:', err);
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
            this.appClientId = configClientId;
            this.tokenExpiry = Date.now() + (24 * 60 * 60 * 1000);
            return;
        }

        const clientId = process.env.TWITCH_CLIENT_ID || configClientId;
        const clientSecret = process.env.TWITCH_CLIENT_SECRET;

        if (!clientId || !clientSecret) {
            logger.log(`[DEBUG] Config Check - ClientID: ${!!clientId}, AppToken: ${!!configAppToken}, Secret: ${!!clientSecret}`);
            logger.log(`[DEBUG] Config Values - ID: ${configClientId ? 'OK' : 'MISSING'}, Token: ${configAppToken ? 'OK' : 'MISSING'}`);
        }

        if (!clientId || !clientSecret) {
            if (!this.badgesWarningLogged) {
                logger.warn("Badges désactivés : fournissez TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET dans .env ou twitchClientId/twitchAppToken dans la config.");
                this.badgesWarningLogged = true;
            }
            return;
        }

        logger.log("Génération d'un nouveau App Access Token Twitch...");
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
        if (this.onSubCountUpdate) this.onSubCountUpdate(this.currentSubCount);
    }

    getSubCount() {
        return this.currentSubCount;
    }

    simulateSub() {
        this.incrementSubCount();
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
        const startMsg = config.giveawayStartMessage !== undefined
            ? config.giveawayStartMessage
            : 'Le giveaway commence ! Tapez !giveaway pour participer.';
        if (startMsg && this.client && this.isConnected) {
            this.client.say(config.channel, startMsg);
        }
        if (this.onParticipantsUpdated) this.onParticipantsUpdated();
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
        if (this.onParticipantsUpdated) this.onParticipantsUpdated();
    }

    triggerAlert(type, data) {
        this.alertManager.trigger(type, data);
    }
    isDevMockEnabled() { return this.rewardsManager.isDevMockEnabled(); }
    async getCustomRewards() { return this.rewardsManager.getCustomRewards(); }
    async createCustomReward(data) { return this.rewardsManager.createCustomReward(data); }
    async updateCustomReward(id, data) { return this.rewardsManager.updateCustomReward(id, data); }
    async deleteCustomReward(id) { return this.rewardsManager.deleteCustomReward(id); }
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

    async getChannelRewards() { return this.getCustomRewards(); }
    async createChannelReward(data) { return this.createCustomReward(data); }
    async updateChannelReward(id, data) { return this.updateCustomReward(id, data); }
    async deleteChannelReward(id) { return this.deleteCustomReward(id); }
}

module.exports = TwitchBot;
