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
                padding: 20px;
                overflow: hidden;
                width: 100%;
                height: 100%;
            }
            .alert-image {
                width: 100%;
                height: 70%;
                max-height: 70%;
                display: flex;
                align-items: center;
                justify-content: center;
                overflow: hidden;
                flex-shrink: 0;
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
                height: 30%;
                max-height: 30%;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                text-align: center;
                overflow: hidden;
                flex-shrink: 0;
            }
            .alert-image:empty ~ #alert-text-wrapper {
                height: 100%;
                max-height: 100%;
            }
            .alert-text {
                font-size: 28px;
                font-weight: 900;
                color: white;
                line-height: 1.2;
                word-wrap: break-word;
                overflow-wrap: break-word;
                max-width: 100%;
                text-align: center;
            }
            .alert-message {
                font-size: 22px;
                font-weight: 700;
                color: #eee;
                text-shadow: 0 4px 8px rgba(0, 0, 0, 0.8);
                margin-top: 6px;
                word-wrap: break-word;
                overflow-wrap: break-word;
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
            }
            .alert-amount,
            .alert-months {
                font-weight: 800;
                color: #40c4ff;
            }
        `;
    }

    onConnection(ws) {
        // Only kick the queue. Resetting isPlaying here used to cut the running
        // alert short whenever a second source (vod-audio) connected.
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
