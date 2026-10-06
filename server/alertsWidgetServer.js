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
                padding: clamp(10px, 2.5vh, 24px);
                gap: clamp(8px, 2vh, 18px);
                overflow: hidden;
                width: 100%;
                height: 100%;
            }
            .alert-image {
                width: 100%;
                flex: 1 1 0%;
                max-height: 70%;
                min-height: 0;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
            }
            .alert-image img {
                max-width: 100%;
                max-height: 100%;
                width: auto;
                height: auto;
                object-fit: contain;
                display: block;
            }
            .alert-image:empty {
                display: none;
            }
            #alert-text-wrapper {
                width: 100%;
                flex: 0 0 auto;
                max-height: 100%;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                text-align: center;
                gap: clamp(4px, 1vh, 10px);
                overflow: visible;
            }
            .alert-image:empty ~ #alert-text-wrapper {
                flex: 0 1 auto;
                max-height: 100%;
            }
            .alert-text {
                font-size: clamp(20px, 4.5vh, 28px);
                font-weight: 900;
                color: white;
                line-height: 1.25;
                word-wrap: break-word;
                overflow-wrap: break-word;
                word-break: break-word;
                max-width: 100%;
                text-align: center;
            }
            .alert-message {
                font-size: clamp(15px, 3vh, 22px);
                font-weight: 700;
                color: #eee;
                text-shadow: 0 4px 8px rgba(0, 0, 0, 0.8);
                line-height: 1.25;
                word-wrap: break-word;
                overflow-wrap: break-word;
                word-break: break-word;
                max-width: 100%;
                text-align: center;
            }
            .alert-message:empty {
                display: none;
            }
            .alert-username {
                padding-right: 6px;
                letter-spacing: 2px;
                font-weight: 900;
                color: #ffeb3b;
                text-shadow: 2px 2px #000000;
                display: inline-block;
                line-height: inherit;
            }
            .alert-amount,
            .alert-months {
                font-weight: 800;
                color: #40c4ff;
            }
        `;
    }

    hasWidgetClients() {
        for (const client of this.connections) {
            if (client.readyState === 1 && !client.isPreview) return true;
        }
        return false;
    }

    onConnection(ws) {
        this.processQueue();

        ws.on('message', (message) => {
            try {
                const msgStr = message.toString();
                const data = JSON.parse(msgStr);
                if (data.type === 'register-preview') {
                    ws.isPreview = true;
                    return;
                }
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

        const duration = parseInt(nextAlert.duration) || 5000;
        if (this.safetyTimer) clearTimeout(this.safetyTimer);

        if (!this.hasWidgetClients()) {
            this.safetyTimer = setTimeout(() => {
                if (this.isPlaying) {
                    log.info('ALERTS_FINISHED');
                    this.isPlaying = false;
                    this.processQueue();
                }
            }, duration);
        } else {
            this.safetyTimer = setTimeout(() => {
                if (this.isPlaying) {
                    log.info('ALERTS_SAFETY_TIMEOUT');
                    this.isPlaying = false;
                    this.processQueue();
                }
            }, duration + 2000);
        }
    }

    skipCurrent() {
        if (this.safetyTimer) clearTimeout(this.safetyTimer);
        this.broadcast({ type: 'skip' });
        this.isPlaying = false;
        this.processQueue();
    }


    broadcastConfig(config) {
        this.broadcast({ type: 'config-update', widget: 'alerts', config });
    }

    refresh() {
        this.broadcast({ type: 'reload' });
    }
}

function createAlertsWidgetServer(bot, defaultPort = 8097) {
    return new AlertsWidgetServer(bot, defaultPort);
}

module.exports = { createAlertsWidgetServer };
