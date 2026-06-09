const BaseWidgetServer = require('./BaseWidgetServer');
const log = require('../main/logger').tagged('Chat');

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
