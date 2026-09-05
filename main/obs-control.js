const WebSocket = require('ws');
const crypto = require('crypto');
const log = require('./logger').tagged('OBS');

// Minimal obs-websocket v5 client, spoken directly over `ws` so the app does
// not pull in another dependency.
//
// Why this exists: an OBS browser source that loads before our HTTP server is
// listening caches Chromium's "connection refused" page forever. There is no
// script on that page, so the widget's own reconnect loop never runs and the
// streamer has to right-click > Refresh by hand. Pressing the source's refresh
// button remotely once we are actually up removes that manual step.

const OP = { HELLO: 0, IDENTIFY: 1, IDENTIFIED: 2, REQUEST: 6, REQUEST_RESPONSE: 7 };

const DEFAULT_URL = 'ws://127.0.0.1:4455';
const RECONNECT_DELAY_MS = 10000;
const REQUEST_TIMEOUT_MS = 8000;
const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

class ObsControl {
    constructor(bot, getPortForWidget) {
        this.bot = bot;
        // (widgetName) => port, supplied by main.js from the live servers.
        this.getPortForWidget = getPortForWidget;

        this.ws = null;
        this.identified = false;
        this.reconnectTimer = null;
        this.stopped = true;
        this.nextRequestId = 1;
        this.pending = new Map();
    }

    // --- config -----------------------------------------------------------

    getSettings() {
        const cfg = (this.bot && this.bot.getConfig) ? this.bot.getConfig() : {};
        return {
            enabled: cfg.obsWebsocketEnabled !== false,
            url: cfg.obsWebsocketUrl || DEFAULT_URL,
            password: cfg.obsWebsocketPassword || ''
        };
    }

    // --- lifecycle --------------------------------------------------------

    start() {
        this.stopped = false;
        const { enabled } = this.getSettings();
        if (!enabled) {
            log.info('OBS_DISABLED');
            return;
        }
        this.connect();
    }

    stop() {
        this.stopped = true;
        this.clearReconnect();
        this.failAllPending('stopped');
        this.teardownSocket();
    }

    restart() {
        this.stop();
        this.start();
    }

    clearReconnect() {
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }

    scheduleReconnect() {
        if (this.stopped) return;
        this.clearReconnect();
        // OBS is very often started after the app, so this loop is the normal
        // path rather than an error path. Keep it quiet.
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, RECONNECT_DELAY_MS);
    }

    teardownSocket() {
        this.identified = false;
        if (!this.ws) return;
        const ws = this.ws;
        this.ws = null;
        ws.removeAllListeners();
        ws.on('error', () => { });
        try {
            if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
                ws.terminate();
            }
        } catch (e) { /* already gone */ }
    }

    connect() {
        if (this.stopped) return;
        const { enabled, url } = this.getSettings();
        if (!enabled) return;

        this.teardownSocket();

        let ws;
        try {
            ws = new WebSocket(url, 'obswebsocket.json');
        } catch (e) {
            this.scheduleReconnect();
            return;
        }
        this.ws = ws;

        ws.on('message', (data) => {
            let msg;
            try {
                msg = JSON.parse(data);
            } catch (e) {
                return;
            }
            this.handleMessage(msg, ws);
        });

        ws.on('close', () => {
            if (ws !== this.ws) return;
            const wasIdentified = this.identified;
            this.identified = false;
            this.ws = null;
            this.failAllPending('socket closed');
            if (wasIdentified) log.info('OBS_DISCONNECTED');
            this.scheduleReconnect();
        });

        // OBS not running yet is the expected case, so errors are not logged
        // at error level - they would spam the console on every retry.
        ws.on('error', () => { });
    }

    // --- protocol ---------------------------------------------------------

    handleMessage(msg, ws) {
        if (ws !== this.ws) return;

        switch (msg.op) {
            case OP.HELLO:
                this.sendIdentify(msg.d || {});
                break;

            case OP.IDENTIFIED:
                this.identified = true;
                log.info('OBS_CONNECTED');
                this.refreshWidgetSources().catch(e =>
                    log.warn('OBS_REFRESH_ERR', { error: e.message || e }));
                break;

            case OP.REQUEST_RESPONSE: {
                const d = msg.d || {};
                const entry = this.pending.get(d.requestId);
                if (!entry) return;
                this.pending.delete(d.requestId);
                clearTimeout(entry.timer);
                const status = d.requestStatus || {};
                if (status.result) {
                    entry.resolve(d.responseData || {});
                } else {
                    entry.reject(new Error(status.comment || `OBS request failed (${status.code})`));
                }
                break;
            }
        }
    }

    sendIdentify(hello) {
        const { password } = this.getSettings();
        const payload = { rpcVersion: 1, eventSubscriptions: 0 };

        if (hello.authentication) {
            if (!password) {
                log.error('OBS_AUTH_REQUIRED');
                this.stopped = true; // pointless to retry without a password
                this.teardownSocket();
                return;
            }
            const { challenge, salt } = hello.authentication;
            const secret = crypto.createHash('sha256')
                .update(password + salt).digest('base64');
            payload.authentication = crypto.createHash('sha256')
                .update(secret + challenge).digest('base64');
        }

        this.send({ op: OP.IDENTIFY, d: payload });
    }

    send(obj) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
        this.ws.send(JSON.stringify(obj));
        return true;
    }

    request(requestType, requestData = {}) {
        return new Promise((resolve, reject) => {
            if (!this.identified) return reject(new Error('OBS not connected'));

            const requestId = String(this.nextRequestId++);
            const timer = setTimeout(() => {
                this.pending.delete(requestId);
                reject(new Error(`OBS request timed out: ${requestType}`));
            }, REQUEST_TIMEOUT_MS);

            this.pending.set(requestId, { resolve, reject, timer });

            if (!this.send({ op: OP.REQUEST, d: { requestType, requestId, requestData } })) {
                this.pending.delete(requestId);
                clearTimeout(timer);
                reject(new Error('OBS socket not open'));
            }
        });
    }

    failAllPending(reason) {
        for (const [, entry] of this.pending) {
            clearTimeout(entry.timer);
            entry.reject(new Error(reason));
        }
        this.pending.clear();
    }

    // --- widget source handling -------------------------------------------

    isConnected() {
        return this.identified;
    }

    // Recognises a source pointing at one of our widget servers and works out
    // which widget it is, so we can both refresh it and repair a stale port.
    parseWidgetUrl(rawUrl) {
        if (!rawUrl || typeof rawUrl !== 'string') return null;
        let parsed;
        try {
            parsed = new URL(rawUrl);
        } catch (e) {
            return null;
        }
        if (!LOOPBACK_HOSTS.has(parsed.hostname)) return null;

        const match = parsed.pathname.match(/^\/(?:widget|go)\/([a-z0-9-]+)$/i);
        if (!match) return null;

        return {
            url: parsed,
            widget: match[1].toLowerCase(),
            port: parseInt(parsed.port, 10) || 80
        };
    }

    async refreshWidgetSources() {
        if (!this.identified) return { refreshed: 0, repaired: 0 };

        const { inputs = [] } = await this.request('GetInputList', { inputKind: 'browser_source' });
        let refreshed = 0;
        let repaired = 0;

        for (const input of inputs) {
            const name = input.inputName;
            let settings;
            try {
                const res = await this.request('GetInputSettings', { inputName: name });
                settings = res.inputSettings || {};
            } catch (e) {
                continue;
            }

            const info = this.parseWidgetUrl(settings.url);
            if (!info) continue;

            // If the widget moved port since this source was configured, fix
            // the URL in place rather than making the streamer hunt for it.
            const expectedPort = this.getPortForWidget ? this.getPortForWidget(info.widget) : null;
            if (expectedPort && expectedPort !== info.port) {
                info.url.port = String(expectedPort);
                try {
                    await this.request('SetInputSettings', {
                        inputName: name,
                        inputSettings: { url: info.url.toString() }
                    });
                    repaired++;
                    log.info('OBS_SOURCE_REPAIRED', { name, port: expectedPort });
                } catch (e) {
                    log.warn('OBS_REPAIR_ERR', { name, error: e.message || e });
                }
            }

            try {
                await this.request('PressInputPropertiesButton', {
                    inputName: name,
                    propertyName: 'refreshnocache'
                });
                refreshed++;
            } catch (e) {
                log.warn('OBS_REFRESH_SOURCE_ERR', { name, error: e.message || e });
            }
        }

        log.info('OBS_SOURCES_REFRESHED', { refreshed, repaired });
        return { refreshed, repaired };
    }
}

module.exports = ObsControl;
