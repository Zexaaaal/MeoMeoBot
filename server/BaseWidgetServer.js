const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const log = require('../main/logger').tagged('Server');

const MIME_TYPES = {
    '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
    '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
    '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
    '.webm': 'video/webm', '.mp4': 'video/mp4', '.avi': 'video/x-msvideo',
    '.mov': 'video/quicktime', '.mkv': 'video/x-matroska'
};

const ALLOWED_LOCAL_EXTENSIONS = new Set([
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
    '.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac',
    '.webm', '.mp4', '.avi', '.mov', '.mkv'
]);

const VIDEO_EXTENSIONS = new Set(['.webm', '.mp4', '.avi', '.mov', '.mkv']);

class BaseWidgetServer {
    constructor(bot, defaultPort, widgetName) {
        this.bot = bot;
        this.defaultPort = defaultPort;
        this.widgetName = widgetName;
        this.server = null;
        this.wss = null;
        this.port = 0;
        this.connections = new Set();
        this.configKey = `${widgetName}WidgetPort`;
        this.runId = Date.now().toString();
    }

    start() {
        return new Promise((resolve) => {
            if (this.server) {
                return resolve(this.port);
            }

            this.port = this.resolvePort();
            this.server = http.createServer(this.handleRequest.bind(this));

            this.server.on('listening', () => {
                const address = this.server.address();
                this.port = typeof address === 'string' ? 0 : address.port;

                log.info('SERVER_START', { port: this.port });

                if (this.bot && this.bot.updateConfig) {
                    this.bot.updateConfig({ [this.configKey]: this.port });
                }

                this.initWebSocket();
                resolve(this.port);
            });

            this.server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    log.error('SERVER_PORT_IN_USE', { port: this.port });
                    this.port = 0;
                    this.server.listen(0, '127.0.0.1');
                } else {
                    log.error('SERVER_ERROR', err);
                    resolve(0);
                }
            });
            this.server.listen(this.port, '0.0.0.0');
        });
    }

    resolvePort() {
        return this.defaultPort;
    }

    getPort() {
        return this.port;
    }

    handleRequest(req, res) {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
        res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
        res.setHeader('Pragma', 'no-cache');
        res.setHeader('Expires', '0');
        res.setHeader('Surrogate-Control', 'no-store');

        res.setHeader('Content-Security-Policy', "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; img-src * 'self' data: blob: https: http:; media-src * 'self' data: blob: https: http:; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline';");

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const urlPath = req.url.split('?')[0];
        // log.info('SERVER_REQUEST', { method: req.method, url: req.url });

        if (req.url.startsWith('/widget/assets/')) {
            return this.serveAsset(req, res);
        }

        if (urlPath === '/tts') {
            return this.serveTTS(req, res);
        }

        if (req.url === '/widget/base.css') {
            const cssPath = path.join(__dirname, '..', 'widgets', 'base.css');
            fs.readFile(cssPath, (err, data) => {
                if (err) {
                    res.statusCode = 404;
                    return res.end('Not Found');
                }
                res.writeHead(200, { 'Content-Type': 'text/css' });
                res.end(data);
            });
            return;
        }

        if (urlPath === `/widget/${this.widgetName}`) {
            return this.serveWidgetHtml(req, res);
        }

        if (req.url.startsWith('/local-file')) {
            return this.serveLocalFile(req, res);
        }

        if (req.url.startsWith('/widget/themes/')) {
            return this.serveTheme(req, res);
        }

        if (this.handleCustomRoutes(req, res)) return;

        res.statusCode = 404;
        res.end('Not Found');
    }

    serveTheme(req, res) {
        const cleanUrl = req.url.split('?')[0];
        const themeFile = cleanUrl.replace('/widget/themes/', '');
        const safeName = path.normalize(themeFile).replace(/^(\.\.[\/\\])+/, '');
        const themePath = path.join(__dirname, '..', 'widgets', 'themes', safeName);

        fs.readFile(themePath, (err, data) => {
            if (err) {
                res.statusCode = 404;
                return res.end('Theme File Not Found');
            }

            const ext = path.extname(themePath).toLowerCase();
            res.statusCode = 200;
            res.setHeader('Content-Type', MIME_TYPES[ext] || 'text/plain');
            res.end(data);
        });
    }

    serveAsset(req, res) {
        const cleanUrl = req.url.split('?')[0];
        const assetName = cleanUrl.replace('/widget/assets/', '');
        const safeName = path.normalize(assetName).replace(/^(\.\.[\/\\])+/, '');
        const assetPath = path.join(__dirname, '..', 'widgets', 'assets', safeName);

        fs.readFile(assetPath, (err, data) => {
            if (err) {
                res.statusCode = 404;
                return res.end('Asset Not Found');
            }

            const ext = path.extname(assetPath).toLowerCase();
            res.statusCode = 200;
            res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
            res.end(data);
        });
    }

    serveTTS(req, res) {
        const url = new URL(req.url, `http://127.0.0.1:${this.port}`);
        const text = url.searchParams.get('text');

        if (!text) {
            res.statusCode = 400;
            return res.end('Missing text parameter');
        }

        const ttsUrl = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=fr&q=${encodeURIComponent(text)}`;

        log.info('SERVER_TTS_PROXY', { text });

        https.get(ttsUrl, (externalRes) => {
            if (externalRes.statusCode !== 200) {
                log.error('SERVER_TTS_FAILED', { status: externalRes.statusCode });
                res.statusCode = 502;
                return res.end('TTS Upstream Error');
            }

            res.writeHead(200, {
                'Content-Type': 'audio/mpeg',
                'Cache-Control': 'no-cache'
            });

            externalRes.pipe(res);
        }).on('error', (e) => {
            log.error('SERVER_TTS_REQ_ERR', e);
            res.statusCode = 500;
            res.end('Internal Server Error');
        });
    }

    serveLocalFile(req, res) {
        const url = new URL(req.url, `http://127.0.0.1:${this.port}`);
        const filePath = url.searchParams.get('path');

        if (!filePath) {
            res.statusCode = 400;
            return res.end('No path specified');
        }

        const normalizedPath = path.resolve(filePath);
        const ext = path.extname(normalizedPath).toLowerCase();

        if (!ALLOWED_LOCAL_EXTENSIONS.has(ext)) {
            log.error('SERVER_BLOCKED_FILE', { path: normalizedPath });
            res.statusCode = 403;
            return res.end('Forbidden File Type');
        }

        fs.stat(normalizedPath, (err, stats) => {
            if (err || !stats.isFile()) {
                log.error('SERVER_FILE_NOT_FOUND', { path: normalizedPath }, err || '');
                res.statusCode = 404;
                return res.end('File not found');
            }

            const contentType = MIME_TYPES[ext] || 'application/octet-stream';

            if (VIDEO_EXTENSIONS.has(ext)) {
                const fileSize = stats.size;
                const range = req.headers.range;

                if (range) {
                    const parts = range.replace(/bytes=/, '').split('-');
                    const start = parseInt(parts[0], 10);
                    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
                    const chunkSize = (end - start) + 1;

                    res.writeHead(206, {
                        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                        'Accept-Ranges': 'bytes',
                        'Content-Length': chunkSize,
                        'Content-Type': contentType,
                        'Access-Control-Allow-Origin': '*'
                    });
                    fs.createReadStream(normalizedPath, { start, end }).pipe(res);
                } else {
                    res.writeHead(200, {
                        'Content-Length': fileSize,
                        'Content-Type': contentType,
                        'Accept-Ranges': 'bytes',
                        'Access-Control-Allow-Origin': '*'
                    });
                    fs.createReadStream(normalizedPath).pipe(res);
                }
            } else {
                fs.readFile(normalizedPath, (readErr, data) => {
                    if (readErr) {
                        res.statusCode = 500;
                        return res.end('Error reading file');
                    }
                    res.statusCode = 200;
                    res.setHeader('Content-Type', contentType);
                    res.setHeader('Access-Control-Allow-Origin', '*');
                    res.end(data);
                });
            }
        });
    }

    serveWidgetHtml(req, res) {
        const fileName = `${this.widgetName.replace('-', '_')}_widget.html`;
        this.serveHtmlFile(res, fileName, (content) => this.transformHtml(content));
    }

    serveHtmlFile(res, filename, processContent) {
        const filePath = path.join(__dirname, '..', 'widgets', filename);
        fs.readFile(filePath, 'utf8', (err, data) => {
            if (err) {
                log.error('SERVER_LOAD_ERR', { path: filePath }, err);
                res.statusCode = 500;
                return res.end('Error loading widget file');
            }
            let content = data;
            if (processContent) {
                content = processContent(content);
            }
            res.statusCode = 200;
            res.setHeader('Content-Type', 'text/html');
            res.end(content);
        });
    }

    transformHtml(html) {
        const clientScript = this.getCommonClientScript();
        let content = html.replace('</head>', `<link rel="stylesheet" href="/widget/base.css">\n${clientScript}</head>`);

        const config = this.bot.getWidgetConfig(this.widgetName) || {};
        const customCSS = config.customCSS || (this.defaultCSS || '');
        content = content.replace('/* __CUSTOM_CSS__ */', customCSS);

        return content;
    }

    getCommonClientScript() {
        return `
        <script>
            function connectWidget(onMessage, customUrl) {
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const host = window.location.host;
                let ws;

                function connect() {
                    const wsUrl = customUrl || \`\${protocol}//\${host}\`; ws = new WebSocket(wsUrl);
                    
                    ws.onopen = () => {};

                    ws.onmessage = (event) => {
                        try {
                            const data = JSON.parse(event.data);
                            
                            if (data.type === 'handshake') {
                                const lastRunId = sessionStorage.getItem('widget_run_id');
                                if (lastRunId && lastRunId !== data.runId) {
                                    sessionStorage.setItem('widget_run_id', data.runId);
                                    const url = new URL(window.location.href);
                                    url.searchParams.set('t', Date.now());
                                    window.location.href = url.toString();
                                    return;
                                }
                                sessionStorage.setItem('widget_run_id', data.runId);
                                ws.send(JSON.stringify({ type: 'get-config' }));
                            }

                            if (data.type === 'reload') {
                                const url = new URL(window.location.href);
                                url.searchParams.set('t', Date.now());
                                window.location.href = url.toString();
                                return;
                            }
                             if (data.config && typeof data.config.customCSS === 'string') {
                                let style = document.getElementById('dynamic-custom-css');
                                if (!style) {
                                    style = document.createElement('style');
                                    style.id = 'dynamic-custom-css';
                                    document.head.appendChild(style);
                                }
                                style.textContent = data.config.customCSS;
                            }
                            if (data.type === 'visibility') {
                                document.body.style.display = data.visible ? '' : 'none';
                            }
                            if (onMessage) onMessage(data);
                        } catch (e) {
                            console.error('[Widget] WS Error:', e);
                        }
                    };

                    ws.onclose = () => {
                        setTimeout(connect, 3000);
                    };

                    ws.onerror = (err) => {
                        console.error('[Widget] WS Error:', err);
                        ws.close();
                    };
                    
                }

                connect();

                return {
                    send: (data) => {
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(data);
                        } else {
                            console.warn('[Widget] Cannot send, socket not open');
                        }
                    }
                };
            }
        </script>
        `;
    }

    handleCustomRoutes(req, res) {
        return false;
    }

    initWebSocket() {
        this.wss = new WebSocket.Server({ server: this.server });
        this.wss.on('connection', (ws) => {
            this.connections.add(ws);

            ws.send(JSON.stringify({ type: 'handshake', runId: this.runId }));

            const config = this.bot.getWidgetConfig(this.widgetName);
            if (config) {
                ws.send(JSON.stringify({
                    type: 'config-update',
                    widget: this.widgetName,
                    config: config
                }));
            }

            this.onConnection(ws);

            ws.on('close', () => {
                this.connections.delete(ws);
            });
        });
    }

    onConnection(ws) {
    }

    broadcast(data) {
        if (!this.wss) return;
        let count = 0;
        this.connections.forEach(client => {
            if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify(data));
                count++;
            }
        });
        if (count > 0 || data.type === 'reload') {
            if (data.type !== 'config-update' && data.type !== 'sub-update' && data.type !== 'alert' && data.type !== 'chat') {
                log.info('SERVER_WS_BROADCAST', { data: JSON.stringify(data), count });
            }
        }
    }

    hasActiveClients() {
        for (const client of this.connections) {
            if (client.readyState === WebSocket.OPEN) return true;
        }
        return false;
    }

    stop() {
        if (this.wss) {
            this.wss.close();
            this.wss = null;
        }
        if (this.server) {
            // log.info('SERVER_STOPPING');
            this.server.close((err) => {
                if (err) log.error('SERVER_CLOSE_ERR', err);
            });
            if (this.server.closeAllConnections) {
                this.server.closeAllConnections();
            }
            this.server = null;
        }
    }

    getUrl(localIp, widgetType) {
        const name = widgetType || this.widgetName;
        return `http://${localIp}:${this.port}/widget/${name}`;
    }
}

module.exports = BaseWidgetServer;
