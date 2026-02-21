const BaseWidgetServer = require('./BaseWidgetServer');
const log = require('../main/logger').tagged('Subgoals');

class SubgoalsWidgetServer extends BaseWidgetServer {
    constructor(bot, defaultPort) {
        super(bot, defaultPort, 'subgoals');
        if (this.bot) {
            this.bot.on('last-sub', (data) => this.broadcastLastEvent('last-sub', data));
            this.bot.on('last-follow', (data) => this.broadcastLastEvent('last-follow', data));
            this.bot.on('last-donation', (data) => this.broadcastLastEvent('last-donation', data));
        }
    }

    handleCustomRoutes(req, res) {
        const pathname = req.url.split('?')[0];

        if (pathname === '/widget/subgoals-list') {
            this.serveSubgoalsList(req, res);
            return true;
        }
        if (pathname === '/widget/daily-subs') {
            this.serveDailySubs(req, res);
            return true;
        }
        if (pathname === '/widget/last-sub') {
            this.serveLastSub(req, res);
            return true;
        }
        if (pathname === '/widget/last-follow') {
            this.serveLastFollow(req, res);
            return true;
        }
        if (pathname === '/widget/last-donation') {
            this.serveLastDonation(req, res);
            return true;
        }
        return false;
    }

    serveSubgoalsList(req, res) {
        this.serveWidgetWithConfig(res, 'subgoals_list_widget.html', 'subgoals-list');
    }

    serveDailySubs(req, res) {
        this.serveWidgetWithConfig(res, 'daily_subs_widget.html', 'subgoals');
    }

    serveLastSub(req, res) {
        this.serveWidgetWithConfig(res, 'last_sub_widget.html', 'subgoals');
    }

    serveLastFollow(req, res) {
        this.serveWidgetWithConfig(res, 'last_follow_widget.html', 'subgoals');
    }

    serveLastDonation(req, res) {
        this.serveWidgetWithConfig(res, 'last_donation_widget.html', 'subgoals');
    }

    serveWidgetWithConfig(res, filename, configKey) {
        this.serveHtmlFile(res, filename, (data) => {
            const config = this.bot.getWidgetConfig(configKey) || {};
            const customCSS = config.customCSS || '';
            let content = data.replace('/* __CUSTOM_CSS__ */', `<style id="custom-css">${customCSS}</style>`);
            const clientScript = this.getCommonClientScript();
            content = content.replace('</head>', `${clientScript}</head>`);
            return content;
        });
    }

    onConnection(ws) {
        const subgoalsListConfig = this.bot.getWidgetConfig('subgoals-list');
        if (subgoalsListConfig) {
            ws.send(JSON.stringify({
                type: 'config-update',
                widget: 'subgoals-list',
                config: subgoalsListConfig
            }));
        }

        const subgoalsConfig = this.bot.getWidgetConfig('subgoals');
        if (subgoalsConfig) {
            ws.send(JSON.stringify({
                type: 'config-update',
                widget: 'daily-subs',
                config: subgoalsConfig
            }));
        }

        if (this.bot.lastSub) ws.send(JSON.stringify({ type: 'last-sub', data: this.bot.lastSub }));
        if (this.bot.lastFollow) ws.send(JSON.stringify({ type: 'last-follow', data: this.bot.lastFollow }));
        if (this.bot.lastDonation) ws.send(JSON.stringify({ type: 'last-donation', data: this.bot.lastDonation }));
    }

    broadcastSubUpdate(count) {
        this.broadcast({ type: 'sub-update', count });
    }

    broadcastLastEvent(type, data) {
        this.broadcast({ type, data });
    }

    broadcastConfig(config, widgetType = 'subgoals') {
        this.broadcast({ type: 'config-update', widget: widgetType, config });

        if (widgetType === 'subgoals') {
            this.broadcast({ type: 'config-update', widget: 'daily-subs', config });
        }
    }
}

function createSubgoalsWidgetServer(bot, defaultPort = 8091) {
    return new SubgoalsWidgetServer(bot, defaultPort);
}

module.exports = { createSubgoalsWidgetServer };
