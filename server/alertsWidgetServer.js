const BaseWidgetServer = require('./BaseWidgetServer');
const log = require('../main/logger').tagged('Alerts');

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
                box-sizing: border-box;
                padding: 15px;
                overflow: hidden;
            }
            .alert-image {
                margin-bottom: 10px;
                display: flex;
                justify-content: center;
                flex-shrink: 1;
                overflow: hidden;
            }
            .alert-image img {
                max-width: 80%;
                max-height: 45vh;
                object-fit: contain;
                display: block;
            }
            .alert-text {
                font-size: 24px;
                font-weight: 900;
                color: white;
                line-height: 1.2;
                word-wrap: break-word;
                overflow-wrap: break-word;
                max-width: 100%;
            }
            .alert-message {
                font-size: 32px;
                font-weight: 700;
                color: #eee;
                text-shadow: 0 4px 8px rgba(0, 0, 0, 0.8);
                margin-top: 15px;
                word-wrap: break-word;
                overflow-wrap: break-word;
                max-width: 100%;
            }
            .alert-username {
                padding-right: 8px;
                letter-spacing: 6px;
                font-size: 22px;
                font-family: 'Road Rage', cursive !important;
                color: yellow;
                text-shadow: 4px 4px #000000;
            }
        `;
    }

    onConnection(ws) {
        // log.info('ALERTS_CLIENT_CONN');
        this.isPlaying = false;
        this.processQueue();

        ws.on('message', (message) => {
            try {
                const msgStr = message.toString();
                const data = JSON.parse(msgStr);
                if (data.type === 'alert-finished') {
                    log.info('ALERTS_FINISHED');
                    this.isPlaying = false;
                    this.processQueue();
                }
            } catch (e) { log.warn('ALERTS_PARSE_ERR', e); }
        });
    }

    addToQueue(alertData) {
        log.info('ALERTS_ADDED_QUEUE', { type: alertData.type });
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
                log.info('ALERTS_SAFETY_TIMEOUT');
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
