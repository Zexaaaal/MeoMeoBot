const EventEmitter = require('events');
const { Pusher } = require('pusher-js');
const log = require('./logger').tagged('Kick');

class KickBot extends EventEmitter {
    constructor() {
        super();
        this.channelSlug = null;
        this.chatroomId = null;
        this.pusher = null;
        this.isConnected = false;
        this.reconnectTimer = null;
        this.api = null;
    }

    setApi(api) {
        this.api = api;
    }

    async connect(channelSlug) {
        if (!channelSlug) return;
        this.channelSlug = channelSlug;

        if (this.pusher) {
            this.disconnect();
        }

        try {
            const channelData = await this.fetchChannelInfo(channelSlug);
            if (!channelData || !channelData.chatroomId) {
                log.error('KICK_NO_CHATROOM', { channel: channelSlug });
                this.scheduleReconnect();
                return;
            }

            this.chatroomId = channelData.chatroomId;
            log.info('KICK_CHANNEL_FOUND', { channel: channelSlug, chatroomId: this.chatroomId });

            this.initPusher();
        } catch (err) {
            log.error('KICK_CONNECT_ERR', { error: err.message });
            this.scheduleReconnect();
        }
    }

    async fetchChannelInfo(slug) {
        if (this.api) {
            try {
                await this.api.getChannel(slug);
            } catch (e) {
                log.warn('KICK_OFFICIAL_API_FALLBACK', { error: e.message });
            }
        }

        try {
            const { net } = require('electron');
            const response = await net.fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            if (response.ok) {
                const data = await response.json();
                const chatroomId = data?.chatroom?.id;
                if (chatroomId) {
                    return { chatroomId };
                }
            }
        } catch (e) {
            log.warn('KICK_V2_CHATROOM_FALLBACK', { error: e.message });
        }

        log.warn('KICK_NO_CHATROOM_ID', { slug });
        return null;
    }

    initPusher() {
        const WebSocket = require('ws');

        this.pusher = new Pusher('32cbd69e4b950bf97679', {
            cluster: 'us2',
            wsHost: 'ws-us2.pusher.com',
            forceTLS: true,
            disableStats: true,
            enabledTransports: ['ws', 'wss'],
            wsPort: 443,
            wssPort: 443,
            WebSocket
        });

        this.pusher.connection.bind('connected', () => {
            this.isConnected = true;
            log.info('KICK_PUSHER_CONNECTED');
            this.subscribeToChat();
        });

        this.pusher.connection.bind('disconnected', () => {
            this.isConnected = false;
            log.info('KICK_PUSHER_DISCONNECTED');
        });

        this.pusher.connection.bind('error', (err) => {
            log.error('KICK_PUSHER_ERROR', { error: err?.error?.data?.message || 'Unknown' });
        });
    }

    subscribeToChat() {
        if (!this.pusher || !this.chatroomId) return;

        const channel = this.pusher.subscribe(`chatrooms.${this.chatroomId}.v2`);

        channel.bind('pusher:subscription_succeeded', () => {
            log.info('KICK_SUBSCRIBED_CHAT', { chatroomId: this.chatroomId });
        });

        channel.bind('pusher:subscription_error', (err) => {
            log.error('KICK_SUBSCRIBE_ERR', { error: JSON.stringify(err) });
        });

        channel.bind('App\\Events\\ChatMessageEvent', (data) => {
            this.handleChatMessage(data);
        });

        channel.bind('App\\Events\\MessageDeletedEvent', (data) => {
            if (typeof data === 'string') {
                try { data = JSON.parse(data); } catch(e) {}
            }
            if (data?.id) {
                this.emit('message-deleted', data.id);
            }
        });

        channel.bind('App\\Events\\ChatroomClearEvent', () => {
            this.emit('clear-chat');
        });

        log.info('KICK_SUBSCRIBING', { channel: `chatrooms.${this.chatroomId}.v2` });
    }

    handleChatMessage(data) {
        if (!data) return;
        
        if (typeof data === 'string') {
            try {
                data = JSON.parse(data);
            } catch (e) {
                log.error('KICK_PARSE_ERR', { error: e.message });
                return;
            }
        }

        const username = data.sender?.username || 'Inconnu';
        const displayName = data.sender?.username || username;
        const content = data.content || '';
        const color = data.sender?.identity?.color || '#53fc18';
        const messageId = data.id || `kick-${Date.now()}`;

        const badges = {};
        if (data.sender?.identity?.badges) {
            data.sender.identity.badges.forEach(b => {
                if (b.type) badges[b.type] = '1';
            });
        }

        const msg = {
            id: messageId,
            username,
            displayName,
            text: content,
            color,
            badges,
            emotes: {},
            platform: 'kick'
        };

        this.emit('chat-message', msg);
    }

    async say(message) {
        if (this.api && this.channelSlug) {
            try {
                await this.api.sendChatMessage(message);
            } catch (err) {
                log.error('KICK_SAY_ERR', { error: err.message });
            }
        }
    }

    disconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }

        if (this.pusher) {
            try {
                this.pusher.disconnect();
            } catch (e) {
                log.error('KICK_DISCONNECT_ERR', { error: e.message });
            }
            this.pusher = null;
        }

        this.isConnected = false;
        this.chatroomId = null;
        log.info('KICK_DISCONNECTED');
    }

    scheduleReconnect() {
        if (this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            if (this.channelSlug) {
                log.info('KICK_RECONNECTING');
                this.connect(this.channelSlug);
            }
        }, 15000);
    }
}

module.exports = KickBot;
