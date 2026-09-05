const WebSocket = require('ws');
const log = require('./logger').tagged('EventSub');

const DEFAULT_URL = 'wss://eventsub.wss.twitch.tv/ws';
const KEEPALIVE_GRACE_MS = 5000;
const DEFAULT_KEEPALIVE_MS = 15000;
const MAX_RECONNECT_DELAY_MS = 60000;

// `scope` is only used to tell the user which permission is missing when a
// subscription gets refused.
const EVENT_TYPES = [
    { type: 'channel.channel_points_custom_reward_redemption.add', version: '1', scope: 'channel:read:redemptions', condition: (id) => ({ broadcaster_user_id: id }) },
    { type: 'channel.channel_points_automatic_reward_redemption.add', version: '2', scope: 'channel:read:redemptions', condition: (id) => ({ broadcaster_user_id: id }) },
    { type: 'channel.subscribe', version: '1', scope: 'channel:read:subscriptions', condition: (id) => ({ broadcaster_user_id: id }) },
    { type: 'channel.subscription.gift', version: '1', scope: 'channel:read:subscriptions', condition: (id) => ({ broadcaster_user_id: id }) },
    { type: 'channel.subscription.message', version: '1', scope: 'channel:read:subscriptions', condition: (id) => ({ broadcaster_user_id: id }) },
    { type: 'channel.cheer', version: '1', scope: 'bits:read', condition: (id) => ({ broadcaster_user_id: id }) },
    { type: 'channel.bits.use', version: '1', scope: 'bits:read', condition: (id) => ({ broadcaster_user_id: id }) },
    { type: 'channel.raid', version: '1', scope: null, condition: (id) => ({ to_broadcaster_user_id: id }) },
    { type: 'channel.hype_train.begin', version: '2', scope: 'channel:read:hype_train', condition: (id) => ({ broadcaster_user_id: id }) },
    { type: 'channel.hype_train.progress', version: '2', scope: 'channel:read:hype_train', condition: (id) => ({ broadcaster_user_id: id }) },
    { type: 'channel.hype_train.end', version: '2', scope: 'channel:read:hype_train', condition: (id) => ({ broadcaster_user_id: id }) },
    { type: 'channel.follow', version: '2', scope: 'moderator:read:followers', condition: (id) => ({ broadcaster_user_id: id, moderator_user_id: id }) },
    { type: 'stream.online', version: '1', scope: null, condition: (id) => ({ broadcaster_user_id: id }) },
    { type: 'stream.offline', version: '1', scope: null, condition: (id) => ({ broadcaster_user_id: id }) },

    // Chat, replacing the IRC connection. user_id is the account reading chat,
    // which for this app is the same account as the broadcaster.
    { type: 'channel.chat.message', version: '1', scope: 'user:read:chat', condition: (id) => ({ broadcaster_user_id: id, user_id: id }) },
    { type: 'channel.chat.clear', version: '1', scope: 'user:read:chat', condition: (id) => ({ broadcaster_user_id: id, user_id: id }) },
    { type: 'channel.chat.clear_user_messages', version: '1', scope: 'user:read:chat', condition: (id) => ({ broadcaster_user_id: id, user_id: id }) },
    { type: 'channel.chat.message_delete', version: '1', scope: 'user:read:chat', condition: (id) => ({ broadcaster_user_id: id, user_id: id }) },
    { type: 'channel.chat.notification', version: '1', scope: 'user:read:chat', condition: (id) => ({ broadcaster_user_id: id, user_id: id }) }
];

// Losing this one means chat is dead, so it drives the connection indicator.
const CHAT_SUBSCRIPTION = 'channel.chat.message';

class EventSubHandler {
    constructor(bot) {
        this.bot = bot;
        this.ws = null;
        // Socket opened in response to a session_reconnect. It only replaces
        // `this.ws` once it has delivered its own welcome message.
        this.pendingWs = null;
        this.sessionId = null;
        this.lastHypeTrainLevel = 0;
        this.pendingSubAlerts = new Map();

        this.keepaliveTimer = null;
        this.keepaliveMs = DEFAULT_KEEPALIVE_MS;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.closing = false;
        this.subscriptionStatus = [];
    }

    connect(url) {
        this.closing = false;
        this.clearReconnectTimer();
        this.clearKeepalive();
        this.destroySocket(this.ws);
        this.ws = null;
        this.destroySocket(this.pendingWs);
        this.pendingWs = null;
        this.sessionId = null;

        this.openSocket(url || DEFAULT_URL, false);
    }

    openSocket(url, isReplacement) {
        log.info('EVENTSUB_CONNECTING', { url });

        let ws;
        try {
            ws = new WebSocket(url);
        } catch (e) {
            log.error('EVENTSUB_WS_ERR', { error: e.message || e });
            this.scheduleReconnect();
            return;
        }

        if (isReplacement) {
            this.pendingWs = ws;
        } else {
            this.ws = ws;
        }

        ws.on('message', (data) => {
            let message;
            try {
                message = JSON.parse(data);
            } catch (e) {
                log.error('EVENTSUB_PARSE_ERR', { error: e.message || e });
                return;
            }
            this.handleMessage(message, ws);
        });

        ws.on('close', (code) => {
            if (ws === this.pendingWs) {
                // The replacement died before taking over; keep the old socket.
                log.warn('EVENTSUB_PENDING_CLOSED', { code });
                this.pendingWs = null;
                return;
            }
            if (ws !== this.ws) return; // stale socket we already replaced
            this.ws = null;
            this.sessionId = null;
            this.clearKeepalive();
            if (this.bot.setChatConnected) this.bot.setChatConnected(false);
            log.warn('EVENTSUB_DISCONNECTED', { code });
            this.scheduleReconnect();
        });

        ws.on('error', (err) => {
            log.error('EVENTSUB_WS_ERR', { error: err.message || err });
        });
    }

    destroySocket(ws) {
        if (!ws) return;
        // Shutdown must never throw: a socket can be half-constructed if the
        // connection failed before the handshake completed.
        try {
            ws.removeAllListeners();
            ws.on('error', () => { });
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.terminate();
            }
        } catch (e) {
            log.warn('EVENTSUB_CLOSE_ERR', { error: e.message || e });
        }
    }

    scheduleReconnect() {
        if (this.closing) return;
        this.clearReconnectTimer();

        const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), MAX_RECONNECT_DELAY_MS);
        this.reconnectAttempts++;
        log.info('EVENTSUB_RECONNECT_SCHEDULED', { delay });

        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, delay);
    }

    clearReconnectTimer() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    // --- keepalive watchdog -----------------------------------------------

    armKeepalive() {
        this.clearKeepalive();
        this.keepaliveTimer = setTimeout(() => {
            log.warn('EVENTSUB_KEEPALIVE_LOST', { ms: this.keepaliveMs + KEEPALIVE_GRACE_MS });
            this.forceReconnect();
        }, this.keepaliveMs + KEEPALIVE_GRACE_MS);
    }

    clearKeepalive() {
        if (this.keepaliveTimer) {
            clearTimeout(this.keepaliveTimer);
            this.keepaliveTimer = null;
        }
    }

    forceReconnect() {
        this.clearKeepalive();
        this.destroySocket(this.ws);
        this.ws = null;
        this.destroySocket(this.pendingWs);
        this.pendingWs = null;
        this.sessionId = null;
        this.scheduleReconnect();
    }

    // --- protocol ---------------------------------------------------------

    handleMessage(message, ws) {
        const { metadata, payload } = message;
        if (!metadata) return;

        // Any inbound frame proves the socket is alive.
        if (ws === this.ws) this.armKeepalive();

        switch (metadata.message_type) {
            case 'session_welcome':
                this.handleWelcome(payload, ws);
                break;

            case 'session_keepalive':
                break;

            case 'notification':
                this.handleNotification(payload);
                break;

            case 'session_reconnect': {
                const url = payload.session && payload.session.reconnect_url;
                if (!url) return;
                log.info('EVENTSUB_RECONNECT_REQUESTED', { url });
                // Spec: open the new socket and keep the old one delivering
                // events until the replacement sends its welcome message.
                this.destroySocket(this.pendingWs);
                this.pendingWs = null;
                this.openSocket(url, true);
                break;
            }

            case 'revocation':
                log.warn('EVENTSUB_REVOKED', {
                    type: payload.subscription.type,
                    status: payload.subscription.status
                });
                this.markRevoked(payload.subscription.type, payload.subscription.status);
                break;
        }
    }

    handleWelcome(payload, ws) {
        const session = payload.session || {};
        if (session.keepalive_timeout_seconds) {
            this.keepaliveMs = session.keepalive_timeout_seconds * 1000;
        }

        if (ws === this.pendingWs) {
            // Promote the replacement, then drop the old socket. Twitch carries
            // the existing subscriptions over, so we must not re-subscribe.
            const previous = this.ws;
            this.ws = ws;
            this.pendingWs = null;
            this.sessionId = session.id;
            this.reconnectAttempts = 0;
            this.destroySocket(previous);
            this.armKeepalive();
            log.info('EVENTSUB_RECONNECT_PROMOTED', { sessionId: session.id });
            return;
        }

        this.ws = ws;
        this.sessionId = session.id;
        this.reconnectAttempts = 0;
        this.armKeepalive();
        log.info('EVENTSUB_SESSION_WELCOME', { sessionId: session.id });
        this.subscribeToAllEvents();
    }

    // --- subscriptions ----------------------------------------------------

    async subscribeToAllEvents() {
        if (!this.sessionId) return;

        if (!this.bot.userId) {
            log.warn('EVENTSUB_NO_USER');
            return;
        }

        const config = this.bot.getConfig();
        if (!config.token) {
            log.error('EVENTSUB_NO_TOKEN');
            this.subscriptionStatus = [];
            this.bot.emit('eventsub-status', this.subscriptionStatus);
            return;
        }

        const results = [];
        for (const event of EVENT_TYPES) {
            const entry = { type: event.type, scope: event.scope, ok: false, error: null };
            try {
                await this.subscribeToEvent(event.type, event.version, event.condition(this.bot.userId));
                entry.ok = true;
            } catch (e) {
                entry.error = e.message || String(e);
                log.error('EVENTSUB_SUB_FAILED', { type: event.type, error: entry.error });
            }
            results.push(entry);
        }

        this.subscriptionStatus = results;
        const failed = results.filter(r => !r.ok);
        log.info('EVENTSUB_SUBSCRIBED', { ok: results.length - failed.length, failed: failed.length });

        // Chat replaced the IRC socket, so "connected" now means the chat
        // subscription is live.
        const chat = results.find(r => r.type === CHAT_SUBSCRIPTION);
        if (this.bot.setChatConnected) this.bot.setChatConnected(!!(chat && chat.ok));

        // Surfaced in the UI so a missing scope is visible instead of silent.
        this.bot.emit('eventsub-status', results);
    }

    async subscribeToEvent(type, version, condition) {
        const config = this.bot.getConfig();
        const rawToken = config.token || '';
        if (!rawToken) throw new Error('Token Twitch manquant');
        if (!this.bot.clientId) throw new Error('Client ID Twitch manquant');

        const token = rawToken.replace('oauth:', '');

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
                transport: { method: 'websocket', session_id: this.sessionId }
            })
        });

        // 409 means this session already holds the subscription - not a failure.
        if (response.status === 409) return;

        if (!response.ok) {
            const body = await response.text();
            let detail = body;
            try {
                const parsed = JSON.parse(body);
                detail = parsed.message || body;
            } catch (e) { /* keep the raw body */ }
            throw new Error(`${response.status} ${detail}`);
        }
    }

    markRevoked(type, status) {
        const entry = this.subscriptionStatus.find(s => s.type === type);
        if (entry) {
            entry.ok = false;
            entry.error = status || 'revoked';
            this.bot.emit('eventsub-status', this.subscriptionStatus);
        }
    }

    getSubscriptionStatus() {
        return this.subscriptionStatus;
    }

    // --- events -----------------------------------------------------------

    handleNotification(payload) {
        const { subscription, event } = payload;
        const type = subscription.type;

        switch (type) {
            case 'channel.chat.message':
                this.bot.handleChatMessage(event).catch(e =>
                    log.error('EVENTSUB_CHAT_ERR', { error: e.message || e }));
                break;

            case 'channel.chat.notification':
                this.bot.handleChatNotification(event).catch(e =>
                    log.error('EVENTSUB_CHAT_ERR', { error: e.message || e }));
                break;

            case 'channel.chat.clear':
                log.info('BOT_CHAT_CLEARED');
                this.bot.emit('clear-chat');
                break;

            case 'channel.chat.clear_user_messages':
                log.info('BOT_USER_CLEARED', { username: event.target_user_login });
                this.bot.emit('clear-user', event.target_user_login);
                break;

            case 'channel.chat.message_delete':
                log.info('BOT_MESSAGE_DELETED', { id: event.message_id });
                this.bot.emit('message-deleted', event.message_id);
                break;

            case 'channel.channel_points_custom_reward_redemption.add':
                this.bot.handleRedemption(event.reward.id, {
                    'display-name': event.user_name,
                    username: event.user_login
                }, event.user_input || '');
                break;

            case 'channel.channel_points_automatic_reward_redemption.add':
                // Built-in Twitch rewards (gigantify an emote, highlight my
                // message...). They have no custom reward id, so they are keyed
                // by their type to stay bindable from the same config maps.
                this.bot.handleRedemption(`auto:${event.reward && event.reward.type}`, {
                    'display-name': event.user_name,
                    username: event.user_login
                }, (event.message && event.message.text) || '');
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

            case 'channel.subscription.gift': {
                this.bot.incrementSubCount(event.total || 1);
                const subgoalsConfigGift = this.bot.getWidgetConfig('subgoals') || {};
                if (subgoalsConfigGift.countSubGifts === true) {
                    this.bot.incrementDailySubCount(event.total || 1);
                }
                this.bot.triggerAlert('subgift', {
                    username: event.is_anonymous ? 'Anonyme' : event.user_name,
                    amount: event.total || 1
                });
                break;
            }

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
                    message: (event.message && event.message.text) || ''
                });
                break;
            }

            case 'channel.cheer':
                this.bot.triggerAlert('cheer', {
                    username: event.is_anonymous ? 'Anonyme' : event.user_name,
                    amount: event.bits
                });
                break;

            case 'channel.bits.use':
                // Plain cheers already arrive via channel.cheer; only surface
                // the other bits usages (power-ups) so alerts never double-fire.
                if (event.type && event.type !== 'cheer') {
                    this.bot.triggerAlert('cheer', {
                        username: event.user_name,
                        amount: event.bits
                    });
                }
                break;

            case 'channel.raid':
                this.bot.triggerAlert('raid', {
                    username: event.from_broadcaster_user_name,
                    viewers: event.viewers
                });
                break;

            case 'channel.hype_train.begin':
                this.lastHypeTrainLevel = event.level || 1;
                this.bot.triggerAlert('hypetrain', {
                    username: 'Twitch',
                    amount: event.level || 1
                });
                break;

            case 'channel.hype_train.progress':
                // Fire on every level-up, not only at the start of the train.
                if (event.level > (this.lastHypeTrainLevel || 0)) {
                    this.lastHypeTrainLevel = event.level;
                    this.bot.triggerAlert('hypetrain', {
                        username: 'Twitch',
                        amount: event.level
                    });
                }
                break;

            case 'channel.hype_train.end':
                this.lastHypeTrainLevel = 0;
                break;

            case 'channel.follow':
                this.bot.updateLastFollow(event.user_name);
                this.bot.triggerAlert('follow', { username: event.user_name });
                this.bot.emit('new-follow');
                break;

            case 'stream.online':
                // Take a fresh baseline snapshot and reset the daily counter.
                this.bot.syncDailySubCountFromBaseline(event.started_at).catch(e =>
                    log.error('EVENTSUB_BASELINE_ERR', { error: e.message || e })
                );
                if (event.started_at) {
                    this.bot.saveWidgetConfig('subgoals', { lastStreamStart: event.started_at });
                }
                break;

            case 'stream.offline':
                log.info('EVENTSUB_STREAM_OFFLINE');
                this.bot.resetDailySubCount();
                this.bot.saveWidgetConfig('subgoals', { lastStreamStart: null, streamStartSubTotal: null });
                break;
        }
    }

    close() {
        this.closing = true;
        this.clearReconnectTimer();
        this.clearKeepalive();

        for (const timeoutId of this.pendingSubAlerts.values()) {
            clearTimeout(timeoutId);
        }
        this.pendingSubAlerts.clear();

        this.destroySocket(this.ws);
        this.ws = null;
        this.destroySocket(this.pendingWs);
        this.pendingWs = null;
        this.sessionId = null;
        if (this.bot.setChatConnected) this.bot.setChatConnected(false);
    }
}

module.exports = EventSubHandler;
