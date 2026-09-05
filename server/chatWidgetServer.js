const BaseWidgetServer = require('./BaseWidgetServer');
const log = require('../main/logger').tagged('Chat');

// Maps a widget path to the config key its server publishes its live port to.
const GO_ROUTES = {
    'chat': 'chatWidgetPort',
    'dock': 'chatWidgetPort',
    'emote-wall': 'chatWidgetPort',
    'spotify': 'spotifyWidgetPort',
    'subgoals': 'subgoalsWidgetPort',
    'subgoals-list': 'subgoalsWidgetPort',
    'daily-subs': 'subgoalsWidgetPort',
    'last-sub': 'subgoalsWidgetPort',
    'last-follow': 'subgoalsWidgetPort',
    'last-donation': 'subgoalsWidgetPort',
    'roulette': 'rouletteWidgetPort',
    'goals': 'goalsWidgetPort',
    'alerts': 'alertsWidgetPort'
};

const TWITCH_CALLBACK_PAGE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>MeoMeoBot</title></head>
<body style="background:#0a0a0c;color:#e5e7eb;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column">
<h2 id="msg">Connexion en cours...</h2>
<p id="sub" style="color:#9ca3af"></p>
<script>
(function () {
    var params = new URLSearchParams(location.hash.replace(/^#/, ''));
    var token = params.get('access_token');
    var msg = document.getElementById('msg');
    var sub = document.getElementById('sub');

    if (!token) {
        msg.textContent = 'Echec de la connexion';
        msg.style.color = '#ef4444';
        sub.textContent = params.get('error_description') || 'Aucun token recu.';
        return;
    }

    fetch('/twitch/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ access_token: token })
    }).then(function () {
        msg.textContent = 'Connexion Twitch reussie !';
        msg.style.color = '#10b981';
        sub.textContent = 'Cette fenetre se fermera automatiquement.';
        history.replaceState(null, '', location.pathname);
        setTimeout(function () { window.close(); }, 2500);
    }).catch(function (e) {
        msg.textContent = 'Erreur';
        msg.style.color = '#ef4444';
        sub.textContent = String(e);
    });
})();
</script>
</body></html>`;

class ChatWidgetServer extends BaseWidgetServer {
    constructor(bot, defaultPort, kickBot) {
        super(bot, defaultPort, 'chat');
        this.kickBot = kickBot;
    }

    transformHtml(html) {
        const htmlWithScript = super.transformHtml(html);
        return this.processChatHtml(htmlWithScript, false);
    }

    transformDockHtml(html) {
        const clientScript = this.getCommonClientScript();
        let content = html.replace('</head>', `${clientScript}</head>`);
        return this.processChatHtml(content, true);
    }

    processChatHtml(html, isDock = false) {
        const chatConfig = this.bot.getWidgetConfig('chat') || {};
        const maxMessages = chatConfig.maxMessages || 10;
        const badgePrefs = chatConfig.badgePrefs || {
            moderator: true, vip: true, subscriber: true,
            founder: true, partner: true, staff: true, premium: true
        };

        const platformConfig = {
            kick: !!chatConfig.platformKick,
            youtube: !!chatConfig.platformYoutube
        };

        const cfg = this.bot.getConfig ? this.bot.getConfig() : {};
        const clientId = process.env.TWITCH_CLIENT_ID || cfg.twitchClientId || '';
        const appToken = this.bot.appAccessToken || process.env.TWITCH_APP_TOKEN || cfg.twitchAppToken || '';

        let content = html;
        content = content.replace('const MAX_MESSAGES = 10;', `const MAX_MESSAGES = ${maxMessages};`);
        content = content.replace('const BADGE_PREFS = {};', `const BADGE_PREFS = ${JSON.stringify(badgePrefs)};`);
        content = content.replace('const PLATFORM_CONFIG = {};', `const PLATFORM_CONFIG = ${JSON.stringify(platformConfig)};`);
        content = content.replace('const IS_DOCK = false;', `const IS_DOCK = ${isDock};`);
        content = content.replace('__TWITCH_CLIENT_ID__', clientId);
        content = content.replace('__TWITCH_APP_TOKEN__', appToken);
        return content;
    }

    handleCustomRoutes(req, res) {
        const url = new URL(req.url, `http://127.0.0.1:${this.port}`);

        // Gateway routes: /go/{widget} redirects to the correct port
        const goMatch = url.pathname.match(/^\/go\/(.+)$/);
        if (goMatch) {
            return this._handleGoRedirect(req, res, goMatch[1]);
        }

        if (url.pathname === '/widget/emote-wall') {
            this.serveEmoteWall(req, res);
            return true;
        }
        if (url.pathname === '/widget/dock') {
            this.serveDock(req, res);
            return true;
        }
        // Twitch hands the token back in the URL fragment, which never
        // reaches the server, so the callback page posts it back to us.
        if (url.pathname === '/twitch/callback') {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            res.end(TWITCH_CALLBACK_PAGE);
            return true;
        }

        if (url.pathname === '/twitch/token' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => {
                body += chunk;
                if (body.length > 8192) req.destroy();
            });
            req.on('end', () => {
                let token = null;
                try {
                    token = JSON.parse(body).access_token;
                } catch (e) { /* malformed, handled below */ }

                if (token) {
                    this.bot.emit('twitch-oauth-token', token);
                    res.writeHead(200, { 'Content-Type': 'application/json' });
                    res.end('{"ok":true}');
                } else {
                    res.writeHead(400, { 'Content-Type': 'application/json' });
                    res.end('{"ok":false}');
                }
            });
            return true;
        }

        if (url.pathname === '/kick/callback') {
            const code = url.searchParams.get('code');
            const error = url.searchParams.get('error');
            if (error) {
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`<html><body style="background:#0a0a0c;color:#ef4444;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0"><h2>Erreur OAuth Kick: ${error}</h2></body></html>`);
                return true;
            }
            if (code) {
                this.bot.emit('kick-oauth-code', code);
                res.writeHead(200, { 'Content-Type': 'text/html' });
                res.end(`<html><body style="background:#0a0a0c;color:#10b981;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;flex-direction:column"><h2>✅ Autorisation Kick reçue</h2><p style="color:#9ca3af">Vous pouvez fermer cette page et retourner dans MeoMeoBot.</p></body></html>`);
                return true;
            }
        }
        return false;
    }

    // Stable gateway: /go/{widget} looks the widget's live port up in config
    // and redirects, so a URL kept in OBS survives a port change.
    _handleGoRedirect(req, res, widgetName) {
        const name = decodeURIComponent(widgetName).replace(/\/+$/, '');
        const portKey = GO_ROUTES[name];

        if (!portKey) {
            res.statusCode = 404;
            res.end('Unknown widget');
            return true;
        }

        const cfg = this.bot.getConfig ? this.bot.getConfig() : {};
        const port = cfg[portKey];

        if (!port) {
            res.statusCode = 503;
            res.end('Widget server not ready');
            return true;
        }

        const search = req.url.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
        res.writeHead(302, { Location: `http://127.0.0.1:${port}/widget/${name}${search}` });
        res.end();
        return true;
    }

    serveEmoteWall(req, res) {
        this.serveHtmlFile(res, 'emote_wall_widget.html', (html) => this.processEmoteWallHtml(html));
    }

    serveDock(req, res) {
        this.serveHtmlFile(res, 'dock_widget.html', (html) => this.transformDockHtml(html));
    }

    processEmoteWallHtml(html) {
        const emoteWallConfig = this.bot.getWidgetConfig('emote-wall') || {};
        const animationDuration = emoteWallConfig.animationDuration || 5000;
        const spawnInterval = emoteWallConfig.spawnInterval || 100;
        const minSize = emoteWallConfig.minSize || 32;
        const maxSize = emoteWallConfig.maxSize || 96;
        const customCSS = emoteWallConfig.customCSS || '';

        const cfg = this.bot.getConfig ? this.bot.getConfig() : {};
        const clientId = process.env.TWITCH_CLIENT_ID || cfg.twitchClientId || '';
        const appToken = this.bot.appAccessToken || process.env.TWITCH_APP_TOKEN || cfg.twitchAppToken || '';

        let content = html.replace('__TWITCH_CLIENT_ID__', clientId);
        content = content.replace('__TWITCH_APP_TOKEN__', appToken);
        content = content.replace('const ANIMATION_DURATION = 5000;', `const ANIMATION_DURATION = ${animationDuration};`);
        content = content.replace('const SPAWN_INTERVAL = 100;', `const SPAWN_INTERVAL = ${spawnInterval};`);
        content = content.replace('const MIN_SIZE = 32;', `const MIN_SIZE = ${minSize};`);
        content = content.replace('const MAX_SIZE = 96;', `const MAX_SIZE = ${maxSize};`);
        content = content.replace('/* __CUSTOM_CSS__ */', customCSS);
        return content;
    }

    broadcastChat(messageData) {
        this.broadcast(messageData);
    }

    broadcastDockMessage(messageData) {
        messageData.dockOnly = true;
        this.broadcast(messageData);
    }

    broadcastConfig(config, widgetType = 'chat') {
        this.broadcast({ type: 'config-update', widget: widgetType, config });
    }

    handleMessage(ws, data) {
        if (data.type === 'send-chat') {
            const { text } = data;
            if (!text) return;

            if (this.bot && this.bot.say) {
                this.bot.say(text);
            }

            if (this.kickBot && this.kickBot.say) {
                this.kickBot.say(text);
            }
        }
    }
}

function createChatWidgetServer(bot, defaultPort = 8087, kickBot) {
    return new ChatWidgetServer(bot, defaultPort, kickBot);
}

module.exports = { createChatWidgetServer };
