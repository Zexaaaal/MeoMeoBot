const BaseWidgetServer = require('./BaseWidgetServer');
const path = require('path');
const fs = require('fs');

class SubgoalsWidgetServer extends BaseWidgetServer {
    constructor(bot, defaultPort) {
        super(bot, defaultPort, 'subgoals');
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
        return false;
    }

    serveSubgoalsList(req, res) {
        this.serveHtmlFile(res, 'subgoals_list_widget.html', (data) => {
            const config = this.bot.getWidgetConfig('subgoals-list') || {};
            const customCSS = config.customCSS || '';
            let content = data.replace('/* __CUSTOM_CSS__ */', `<style id="custom-css">${customCSS}</style>`);

            const clientScript = this.getCommonClientScript();
            content = content.replace('</head>', `${clientScript}</head>`);
            return content;
        });
    }

    serveDailySubs(req, res) {
        this.serveHtmlFile(res, 'daily_subs_widget.html', (data) => {
            const config = this.bot.getWidgetConfig('subgoals') || {};
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
    }

    broadcastSubUpdate(count) {
        this.broadcast({ type: 'sub-update', count });
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
