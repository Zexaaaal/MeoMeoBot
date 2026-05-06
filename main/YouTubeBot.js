const { LiveChat } = require('youtube-chat');
const EventEmitter = require('events');
const log = require('./logger').tagged('YouTube');

class YouTubeBot extends EventEmitter {
    constructor() {
        super();
        this.liveChat = null;
        this.isConnected = false;
    }

    async connect(channelId) {
        this.disconnect();
        if (!channelId) return;

        log.info('Connecting to YouTube channel/video: ' + channelId);
        const options = channelId.startsWith('UC') 
            ? { channelId: channelId } 
            : { liveId: channelId };
            
        this.liveChat = new LiveChat(options);
        
        this.liveChat.on('start', (liveId) => {
            this.isConnected = true;
            this.emit('connected');
            log.info('YouTube connected: ' + liveId);
        });
        
        this.liveChat.on('chat', (chatItem) => {
            let text = '';
            if (chatItem.message && Array.isArray(chatItem.message)) {
                text = chatItem.message.map(m => m.text || m.emojiText || '').join('');
            }
            
            const msg = {
                id: chatItem.id,
                username: chatItem.author.name,
                displayName: chatItem.author.name,
                text: text,
                color: '#ff0000',
                platform: 'youtube'
            };
            this.emit('chat-message', msg);
        });
        
        this.liveChat.on('error', (err) => {
            log.error('YouTube error: ' + err.message);
        });

        try {
            await this.liveChat.start();
        } catch(e) {
            log.error('YouTube start error: ' + e.message);
        }
    }

    disconnect() {
        if (this.liveChat) {
            this.liveChat.stop();
            this.liveChat = null;
        }
        this.isConnected = false;
        this.emit('disconnected');
    }
}
module.exports = YouTubeBot;
