const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

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

    start(onPortChanged) {
        if (this.server) return;

        this.port = this.resolvePort();
        this.server = http.createServer(this.handleRequest.bind(this));

        this.server.listen(this.port, () => {
            console.log(`[${this.widgetName.toUpperCase()}] Widget Server running on port ${this.port}`);

            if (this.bot && this.bot.updateConfig) {
                this.bot.updateConfig({ [this.configKey]: this.port });
            }

            this.initWebSocket();
            if (onPortChanged) onPortChanged();
        });

        this.server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                console.error(`[${this.widgetName.toUpperCase()}] Port ${this.port} in use, trying random...`);
                this.port = 0;
                this.server.listen(0);
            } else {
                console.error(`[${this.widgetName.toUpperCase()}] Server error: `, err);
            }
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

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        const urlPath = req.url.split('?')[0];

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
            res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
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

        fs.stat(filePath, (err, stats) => {
            if (err || !stats.isFile()) {
                console.error(`[BaseWidgetServer] Local file not found: ${filePath}`, err || '');
                res.statusCode = 404;
                return res.end('File not found');
            }

            fs.readFile(filePath, (err, data) => {
                if (err) {
                    res.statusCode = 500;
                    return res.end('Error reading file');
                }
                const ext = path.extname(filePath).toLowerCase();
                const mimeTypes = {
                    '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif', '.svg': 'image/svg+xml', '.webm': 'video/webm',
                    '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg'
                };
                res.writeHead(200, {
                    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
                    'Access-Control-Allow-Origin': '*'
                });
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
                res.statusCode = 500;
                return res.end('Error loading widget file');
            }
            let content = data;
            if (processContent) {
                content = processContent(content);
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
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
                console.log(`[${this.widgetName.toUpperCase()}] Broadcasting: ${JSON.stringify(data)} to ${count} clients`);
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
