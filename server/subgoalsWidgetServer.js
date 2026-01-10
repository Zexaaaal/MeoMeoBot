const BaseWidgetServer = require('./BaseWidgetServer');
const path = require('path');
const fs = require('fs');

class SubgoalsWidgetServer extends BaseWidgetServer {
    constructor(bot, defaultPort) {
        super(bot, defaultPort, 'subgoals');
    }

    handleCustomRoutes(req, res) {
        if (req.url === '/widget/subgoals-list') {
            this.serveSubgoalsList(req, res);
            return true;
        }
        return false;
    }

    serveSubgoalsList(req, res) {
        this.serveHtmlFile(res, 'subgoals_list_widget.html', (data) => {
            const config = this.bot.getWidgetConfig('subgoals-list') || {};
            const customCSS = config.customCSS || '';
            let content = data.replace('/* __CUSTOM_CSS__ */', customCSS);

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
    }

    broadcastSubUpdate(count) {
        this.broadcast({ type: 'sub-update', count });
    }

    broadcastConfig(config, widgetType = 'subgoals') {
        this.broadcast({ type: 'config-update', widget: widgetType, config });
    }
}

function createSubgoalsWidgetServer(bot, defaultPort = 8091) {
    return new SubgoalsWidgetServer(bot, defaultPort);
}

module.exports = { createSubgoalsWidgetServer };
