const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');
const logger = require('../main/logger');

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

                console.error(`[${this.widgetName.toUpperCase()}] DEBUG: Widget Server running on port ${this.port}`);
                logger.log(`[${this.widgetName.toUpperCase()}] Widget Server running on port ${this.port} (Localhost Only)`);

                if (this.bot && this.bot.updateConfig) {
                    this.bot.updateConfig({ [this.configKey]: this.port });
                }

                this.initWebSocket();
                resolve(this.port);
            });

            this.server.on('error', (err) => {
                if (err.code === 'EADDRINUSE') {
                    logger.error(`[${this.widgetName.toUpperCase()}] Port ${this.port} in use, trying random...`);
                    this.port = 0;
                    this.server.listen(0, '127.0.0.1');
                } else {
                    logger.error(`[${this.widgetName.toUpperCase()}] Server error: `, err);
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
        // Explicitly allow data/blob for img-src to fix ERR_INVALID_URL
        res.setHeader('Content-Security-Policy', "default-src * 'unsafe-inline' 'unsafe-eval' data: blob:; img-src * 'self' data: blob: https: http:; media-src * 'self' data: blob: https: http:; script-src * 'unsafe-inline' 'unsafe-eval'; style-src * 'unsafe-inline';");

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const urlPath = req.url.split('?')[0];
        console.error(`[${this.widgetName.toUpperCase()}] Request: ${req.method} ${req.url}`);

        if (req.url.startsWith('/widget/assets/')) {
            return this.serveAsset(req, res);
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

        if (this.handleCustomRoutes(req, res)) return;

        res.statusCode = 404;
        res.end('Not Found');
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
            const mimeTypes = {
                '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp3': 'audio/mpeg',
                '.wav': 'audio/wav', '.ogg': 'audio/ogg'
            };
            res.statusCode = 200;
            res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
            res.end(data);
        });
    }

    serveLocalFile(req, res) {
        const url = new URL(req.url, `http://127.0.0.1:${this.port}`);
        const filePath = url.searchParams.get('path');

        if (!filePath) {
            res.statusCode = 400;
            return res.end('No path specified');
        }

        const ext = path.extname(filePath).toLowerCase();
        const allowedTypes = {
            '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
            '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webp': 'image/webp',
            '.webm': 'video/webm', '.mp4': 'video/mp4', '.avi': 'video/x-msvideo',
            '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
            '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
            '.flac': 'audio/flac', '.m4a': 'audio/mp4', '.aac': 'audio/aac'
        };

        if (!allowedTypes[ext]) {
            logger.error(`[BaseWidgetServer] Blocked access to restricted file type: ${filePath}`);
            res.statusCode = 403;
            return res.end('Forbidden File Type');
        }

        fs.stat(filePath, (err, stats) => {
            if (err || !stats.isFile()) {
                logger.error(`[BaseWidgetServer] Local file not found: ${filePath}`, err || '');
                res.statusCode = 404;
                return res.end('File not found');
            }

            fs.readFile(filePath, (err, data) => {
                if (err) {
                    res.statusCode = 500;
                    return res.end('Error reading file');
                }

                res.statusCode = 200;
                res.setHeader('Content-Type', allowedTypes[ext]);
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.end(data);
            });
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
                console.error(`[BaseWidgetServer] Error loading file: ${filePath}`, err);
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
            function connectWidget(onMessage) {
                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const host = window.location.host;
                let ws;

                function connect() {
                    ws = new WebSocket(\`\${protocol}//\${host}\`);
                    
                    ws.onopen = () => {
                        console.log('[Widget] Connected to server');
                    };

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
                        console.log('[Widget] Disconnected. Retrying in 3s...');
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
                logger.log(`[${this.widgetName.toUpperCase()}] Broadcasting: ${JSON.stringify(data)} to ${count} clients`);
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
            this.server.close();
            this.server = null;
        }
    }

    getUrl(localIp, widgetType) {


        const name = widgetType || this.widgetName;
        return `http://${localIp}:${this.port}/widget/${name}`;
    }
}

module.exports = BaseWidgetServer;
