const io = require('socket.io-client');

class StreamlabsClient {
    constructor(bot) {
        this.bot = bot;
        this.socket = null;
        this.token = null;
    }

    start(token) {
        if (!token) {
            console.log('[Streamlabs] Pas de token configuré.');
            return;
        }

        this.token = token;
        try {
            this.socket = io(`https://sockets.streamlabs.com?token=${token}`, {
                transports: ['websocket']
            });

            this.socket.on('connect', () => {
                console.log('[Streamlabs] Connecté au socket API.');
            });

            this.socket.on('event', (eventData) => {
                if (eventData.type === 'donation') {
                    eventData.message.forEach((msg) => {
                        this.handleDonation(msg);
                    });
                }
            });

            this.socket.on('disconnect', () => {
                console.log('[Streamlabs] Déconnecté.');
            });

            this.socket.on('connect_error', (err) => {
                console.error('[Streamlabs] Erreur de connexion:', err.message);
            });

        } catch (error) {
            console.error('[Streamlabs] Erreur d\'initialisation:', error);
        }
    }

    handleDonation(msg) {
        console.log(`[Streamlabs] Donation reçue de ${msg.name}: ${msg.formatted_amount}`);
        const alertData = {
            type: 'donation',
            username: msg.name,
            amount: msg.formatted_amount,
            message: msg.message || '',
            currency: msg.currency
        };

        if (this.bot.onAlert) {
            this.bot.onAlert(alertData);
        }
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
