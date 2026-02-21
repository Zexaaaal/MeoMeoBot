const BaseWidgetServer = require('./BaseWidgetServer');
const log = require('../main/logger').tagged('Chat');

class ChatWidgetServer extends BaseWidgetServer {
    constructor(bot, defaultPort) {

        super(bot, defaultPort, 'chat');
    }

    transformHtml(html) {
        const htmlWithScript = super.transformHtml(html);
        return this.processChatHtml(htmlWithScript);
    }

    processChatHtml(html) {
        const chatConfig = this.bot.getWidgetConfig('chat') || {};
        const maxMessages = chatConfig.maxMessages || 10;
        const badgePrefs = chatConfig.badgePrefs || {
            moderator: true, vip: true, subscriber: true,
            founder: true, partner: true, staff: true, premium: true
        };

        const cfg = this.bot.getConfig ? this.bot.getConfig() : {};
        const clientId = process.env.TWITCH_CLIENT_ID || cfg.twitchClientId || '';
        const appToken = process.env.TWITCH_APP_TOKEN || cfg.twitchAppToken || '';

        let content = html;
        content = content.replace('const MAX_MESSAGES = 10;', `const MAX_MESSAGES = ${maxMessages};`);
        content = content.replace('const BADGE_PREFS = {};', `const BADGE_PREFS = ${JSON.stringify(badgePrefs)};`);
        content = content.replace('__TWITCH_CLIENT_ID__', clientId);
        content = content.replace('__TWITCH_APP_TOKEN__', appToken);
        return content;
    }

    handleCustomRoutes(req, res) {
        if (req.url === '/widget/emote-wall') {
            this.serveEmoteWall(req, res);
            return true;
        }
        return false;
    }

    serveEmoteWall(req, res) {
        this.serveHtmlFile(res, 'emote_wall_widget.html', (html) => this.processEmoteWallHtml(html));
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
        const appToken = process.env.TWITCH_APP_TOKEN || cfg.twitchAppToken || '';

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

    broadcastConfig(config, widgetType = 'chat') {
        this.broadcast({ type: 'config-update', widget: widgetType, config });
    }
}

function createChatWidgetServer(bot, defaultPort = 8087) {
    return new ChatWidgetServer(bot, defaultPort);
}

module.exports = { createChatWidgetServer };
