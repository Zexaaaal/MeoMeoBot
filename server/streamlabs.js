const io = require('socket.io-client');
const log = require('../main/logger').tagged('Streamlabs');

class StreamlabsClient {
    constructor(bot) {
        this.bot = bot;
        this.socket = null;
        this.token = null;
    }

    start(token) {
        if (!token) {
            log.info('STREAMLABS_NO_TOKEN');
            return;
        }

        log.info('STREAMLABS_STARTING', { tokenEnd: token.slice(-5) });

        this.token = token;
        try {
            this.socket = io(`https://sockets.streamlabs.com?token=${token}`, {
                transports: ['websocket']
            });

            this.socket.on('connect', () => {
                log.info('STREAMLABS_CONNECTED');
            });

            this.socket.on('event', (eventData) => {
                log.info('STREAMLABS_EVENT', eventData);
                if (eventData.type === 'donation') {
                    const messages = Array.isArray(eventData.message) ? eventData.message : [];
                    messages.forEach((msg) => {
                        this.handleDonation(msg);
                    });
                }
            });

            this.socket.on('disconnect', (reason) => {
                log.info('STREAMLABS_DISCONNECTED', { reason });
            });

            this.socket.on('connect_error', (err) => {
                log.error('STREAMLABS_CONN_ERROR', err.message);
                if (err.message.includes('websocket error')) {
                    log.error('STREAMLABS_CHECK_TOKEN');
                }
            });

        } catch (error) {
            log.error('STREAMLABS_INIT_ERROR', error);
        }
    }

    handleDonation(msg) {
        log.info('STREAMLABS_DONATION', { name: msg.name, amount: msg.formatted_amount });
        this.bot.updateLastDonation(msg.name, msg.amount);
        const alertData = {
            type: 'donation',
            username: msg.name,
            amount: msg.formatted_amount,
            message: msg.message || '',
            currency: msg.currency
        };

        this.bot.triggerAlert('donation', alertData);
    }

    stop() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }

    updateToken(newToken) {
        if (this.socket) {
            this.stop();
        }
        if (newToken) {
            this.start(newToken);
        }
    }
}

module.exports = StreamlabsClient;
