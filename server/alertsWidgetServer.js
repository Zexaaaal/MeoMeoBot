const BaseWidgetServer = require('./BaseWidgetServer');

class AlertsWidgetServer extends BaseWidgetServer {
    constructor(bot, defaultPort) {
        super(bot, defaultPort, 'alerts');
        this.alertQueue = [];
        this.isPlaying = false;
        this.defaultCSS = `
            .alert-box {
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                text-align: center;
            }
            .alert-image {
                max-width: 300px;
                padding: 50px 50px 0px 50px;
                margin-bottom: 20px;
            }
            .alert-image img {
                width: 100%;
                display: block;
                filter: drop-shadow(0 5px 15px rgba(0, 0, 0, 0.5));
            }
            .alert-text {
                font-size: 24px;
                font-weight: 900;
                color: white;
                line-height: 1.2;
            }
            .alert-message {
                font-size: 32px;
                font-weight: 700;
                color: #eee;
                text-shadow: 0 4px 8px rgba(0, 0, 0, 0.8);
                margin-top: 15px;
            }
            .alert-username {
                font-size: 22px;
                font-family: 'Road Rage', cursive !important;
                letter-spacing: 4px;
                color: yellow;
                text-shadow: 4px 4px #000000;
            }
        `;
    }

    onConnection(ws) {
        console.log('[ALERTS] Client connected');
        this.isPlaying = false;
        this.processQueue();

        ws.on('message', (message) => {
            try {
                const msgStr = message.toString();
                const data = JSON.parse(msgStr);
                if (data.type === 'alert-finished') {
                    console.log('[ALERTS] Alert finished');
                    this.isPlaying = false;
                    this.processQueue();
                }
            } catch (e) { console.error('[ALERTS] Error parsing message:', e); }
        });
    }

    addToQueue(alertData) {
        console.log(`[ALERTS] Added to queue: ${alertData.type}`);
        this.alertQueue.push(alertData);
        this.processQueue();
    }

    processQueue() {
        if (this.isPlaying || this.alertQueue.length === 0) return;
        if (!this.hasActiveClients()) {
            return;
        }

        const nextAlert = this.alertQueue.shift();
        this.isPlaying = true;
        this.broadcast({ type: 'alert', alert: nextAlert });

        const duration = (parseInt(nextAlert.duration) || 5000) + 2000;
        if (this.safetyTimer) clearTimeout(this.safetyTimer);
        this.safetyTimer = setTimeout(() => {
            if (this.isPlaying) {
                console.log('[ALERTS] Safety timeout triggered - forcing next alert');
                this.isPlaying = false;
                this.processQueue();
            }
        }, duration);
    }

    skipCurrent() {
        this.broadcast({ type: 'skip' });
        this.isPlaying = false;
        this.processQueue();
    }


    refresh() {
        this.broadcast({ type: 'reload' });
    }
}

function createAlertsWidgetServer(bot, defaultPort = 8097) {
    return new AlertsWidgetServer(bot, defaultPort);
}

module.exports = { createAlertsWidgetServer };
