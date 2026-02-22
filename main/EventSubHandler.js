const WebSocket = require('ws');
const log = require('./logger').tagged('EventSub');

class EventSubHandler {
    constructor(bot) {
        this.bot = bot;
        this.ws = null;
        this.sessionId = null;
        this.reconnectUrl = null;
        this.lastHypeTrainLevel = 0;
        this.pendingSubAlerts = new Map();
    }

    connect() {
        if (this.ws) {
            this.ws.on('error', () => { });
            this.ws.removeAllListeners();
            if (this.ws.readyState !== WebSocket.CLOSED && this.ws.readyState !== WebSocket.CLOSING) {
                try {
                    this.ws.on('error', () => { });
                    this.ws.close();
                } catch (e) {
                    log.warn('[EventSub] Error closing socket:', e.message);
                }
            }
            this.ws = null;
        }

        const url = this.reconnectUrl || 'wss://eventsub.wss.twitch.tv/ws';
        // log.info('EVENTSUB_CONNECTING', { url });

        this.ws = new WebSocket(url);

        this.ws.on('message', (data) => {
            try {
                const message = JSON.parse(data);
                this.handleMessage(message);
            } catch (e) {
                log.error('[EventSub] Erreur parsing message:', e);
            }
        });

        this.ws.on('close', (code, reason) => {
            // log.info('EVENTSUB_DISCONNECTED', { code });
            this.sessionId = null;
            this.reconnectUrl = null;
            setTimeout(() => this.connect(), 5000);
        });

        this.ws.on('error', (err) => {
            log.error('[EventSub] Erreur WebSocket:', err);
        });
    }

    handleMessage(message) {
        const { metadata, payload } = message;
        const messageType = metadata.message_type;

        if (messageType === 'session_welcome') {
            this.sessionId = payload.session.id;
            // log.info('EVENTSUB_SESSION_WELCOME', { sessionId: this.sessionId });
            this.subscribeToAllEvents();
        } else if (messageType === 'session_keepalive') {

        } else if (messageType === 'notification') {
            // log.info('EVENTSUB_NOTIFICATION_RECEIVED', { type: payload.subscription.type });
            this.handleNotification(payload);
        } else if (messageType === 'session_reconnect') {
            this.reconnectUrl = payload.session.reconnect_url;
            // log.info('EVENTSUB_RECONNECT_REQUESTED', { url: this.reconnectUrl });
            this.connect();
        } else if (messageType === 'revocation') {
            log.warn('[EventSub] Souscription révoquée:', payload.subscription.type);
        }
    }

    async subscribeToAllEvents() {
        if (!this.bot.userId || !this.sessionId) return;

        const events = [
            { type: 'channel.channel_points_custom_reward_redemption.add', version: '1', condition: { broadcaster_user_id: this.bot.userId } },
            { type: 'channel.subscribe', version: '1', condition: { broadcaster_user_id: this.bot.userId } },
            { type: 'channel.subscription.gift', version: '1', condition: { broadcaster_user_id: this.bot.userId } },
            { type: 'channel.subscription.message', version: '1', condition: { broadcaster_user_id: this.bot.userId } },
            { type: 'channel.cheer', version: '1', condition: { broadcaster_user_id: this.bot.userId } },
            { type: 'channel.raid', version: '1', condition: { to_broadcaster_user_id: this.bot.userId } },
            { type: 'channel.hype_train.begin', version: '2', condition: { broadcaster_user_id: this.bot.userId } },
            { type: 'channel.hype_train.progress', version: '2', condition: { broadcaster_user_id: this.bot.userId } },
            { type: 'channel.hype_train.end', version: '2', condition: { broadcaster_user_id: this.bot.userId } },
            { type: 'channel.follow', version: '2', condition: { broadcaster_user_id: this.bot.userId, moderator_user_id: this.bot.userId } },
            { type: 'stream.online', version: '1', condition: { broadcaster_user_id: this.bot.userId } }
        ];

        for (const event of events) {
            try {
                await this.subscribeToEvent(event.type, event.version, event.condition);
                // log.info('EVENTSUB_SUBSCRIPTION_SENT', { type: event.type });
            } catch (e) {
                log.error(`[EventSub] Échec souscription ${event.type} :`, e.message);
            }
        }
    }

    async subscribeToEvent(type, version, condition) {
        const config = this.bot.getConfig();
        const token = config.token.replace('oauth:', '');

        const response = await fetch('https://api.twitch.tv/helix/eventsub/subscriptions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Client-Id': this.bot.clientId,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                type,
                version,
                condition,
                transport: {
                    method: 'websocket',
                    session_id: this.sessionId
                }
            })
        });

        if (!response.ok) {
            const err = await response.text();
            log.error(`[EventSub] Erreur souscription ${type} v${version}:`, err);
            throw new Error(err);
        }
    }

    handleNotification(payload) {
        const { subscription, event } = payload;
        const type = subscription.type;

        // log.info('EVENTSUB_NOTIFICATION_RECEIVED', { type });

        switch (type) {
            case 'channel.channel_points_custom_reward_redemption.add':
                this.bot.handleRedemption(event.reward.id, {
                    'display-name': event.user_name,
                    username: event.user_login
                }, event.user_input || '');
                break;

            case 'channel.subscribe': {
                if (!event.is_gift) {
                    const userId = event.user_id;
                    const timeoutId = setTimeout(() => {
                        this.bot.updateLastSub(event.user_name);
                        this.bot.incrementSubCount();
                        const subgoalsConfig = this.bot.getWidgetConfig('subgoals') || {};
                        if (subgoalsConfig.countRegularSubs !== false) {
                            this.bot.incrementDailySubCount();
                        }
                        this.bot.triggerAlert('sub', { username: event.user_name });
                        this.pendingSubAlerts.delete(userId);
                    }, 2000);

                    this.pendingSubAlerts.set(userId, timeoutId);
                }
                break;
            }

            case 'channel.subscription.gift':
                this.bot.incrementSubCount(event.total || 1);
                const subgoalsConfigGift = this.bot.getWidgetConfig('subgoals') || {};
                if (subgoalsConfigGift.countSubGifts === true) {
                    this.bot.incrementDailySubCount(event.total || 1);
                }
                this.bot.triggerAlert('subgift', {
                    username: event.user_name,
                    amount: event.total || 1
                });
                break;

            case 'channel.subscription.message': {
                const userId = event.user_id;
                if (this.pendingSubAlerts.has(userId)) {
                    clearTimeout(this.pendingSubAlerts.get(userId));
                    this.pendingSubAlerts.delete(userId);
                }

                this.bot.incrementSubCount();
                const subgoalsConfigResub = this.bot.getWidgetConfig('subgoals') || {};
                if (subgoalsConfigResub.countRegularSubs !== false) {
                    this.bot.incrementDailySubCount();
                }
                this.bot.updateLastSub(event.user_name);
                this.bot.triggerAlert('resub', {
                    username: event.user_name,
                    months: event.cumulative_months,
                    message: event.message?.text || ''
                });
                break;
            }

            case 'channel.cheer':
                this.bot.triggerAlert('cheer', {
                    username: event.user_name,
                    amount: event.bits
                });
                break;

            case 'channel.raid':
                this.bot.triggerAlert('raid', {
                    username: event.from_broadcaster_user_name,
                    viewers: event.viewers
                });
                break;

            case 'channel.hype_train.begin':
                this.bot.triggerAlert('hypetrain', {
                    username: 'Twitch',
                    amount: event.level || 1
                });
                break;

            case 'channel.hype_train.progress':
                if (event.level > (this.lastHypeTrainLevel || 0)) {
                    this.lastHypeTrainLevel = event.level;
                }
                break;

            case 'channel.hype_train.end':
                this.lastHypeTrainLevel = 0;
                break;

            case 'channel.follow':
                this.bot.updateLastFollow(event.user_name);
                this.bot.triggerAlert('follow', { username: event.user_name });
                break;

            case 'stream.online':
                this.bot.resetDailySubCount();
                if (event.started_at) {
                    this.bot.saveWidgetConfig('subgoals', { lastStreamStart: event.started_at });
                }
                break;
        }
    }

    close() {
        for (const timeoutId of this.pendingSubAlerts.values()) {
            clearTimeout(timeoutId);
        }
        this.pendingSubAlerts.clear();
        if (this.ws) {
            this.ws.removeAllListeners();
            this.ws.on('error', () => { });
            this.ws.close();
            this.ws = null;
        }
        if (this.keepaliveTimeout) {
            clearTimeout(this.keepaliveTimeout);
            this.keepaliveTimeout = null;
        }
    }
}

module.exports = EventSubHandler;
