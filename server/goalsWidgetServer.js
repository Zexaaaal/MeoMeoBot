const BaseWidgetServer = require('./BaseWidgetServer');
const log = require('../main/logger').tagged('Goals');

class GoalsWidgetServer extends BaseWidgetServer {
    constructor(bot, defaultPort) {
        super(bot, defaultPort, 'goals');
        this._pollInterval = null;
    }

    serveWidgetHtml(req, res) {
        const urlObj = new URL(req.url, `http://127.0.0.1:${this.port}`);
        const goalId = urlObj.searchParams.get('id');
        this.serveGoalWidget(req, res, goalId);
    }

    serveGoalWidget(req, res, goalId) {
        this.serveHtmlFile(res, 'goals_widget.html', (data) => {
            const goalsConfig = this.bot.getWidgetConfig('goals') || {};
            const goals = goalsConfig.goals || [];
            const goal = goals.find(g => g.id === goalId) || goals[0] || {};
            const customCSS = goal.customCSS || '';
            let content = data.replace('/* __CUSTOM_CSS__ */', `<style id="custom-css">${customCSS}</style>`);
            const clientScript = this.getCommonClientScript();
            content = content.replace('</head>', `${clientScript}</head>`);
            content = content.replace('__GOAL_ID__', goalId || '');
            return content;
        });
    }

    onConnection(ws) {
        const goalsConfig = this.bot.getWidgetConfig('goals') || {};
        ws.send(JSON.stringify({
            type: 'config-update',
            widget: 'goals',
            config: goalsConfig
        }));

        // Send current counts immediately
        this.sendCurrentCounts(ws);
    }

    async sendCurrentCounts(ws) {
        try {
            const subCount = this.bot.getSubCount();
            const followerCount = await this.bot.fetchFollowerCount();

            const data = {
                type: 'goals-count-update',
                counts: {
                    subs: subCount,
                    followers: followerCount
                }
            };

            if (ws && ws.readyState === 1) {
                ws.send(JSON.stringify(data));
            }
        } catch (e) {
            log.error('GOALS_COUNT_FETCH_ERR', { error: e.message || e });
        }
    }

    async broadcastCurrentCounts() {
        try {
            const subCount = this.bot.getSubCount();
            const followerCount = await this.bot.fetchFollowerCount();

            this.broadcast({
                type: 'goals-count-update',
                counts: {
                    subs: subCount,
                    followers: followerCount
                }
            });
        } catch (e) {
            log.error('GOALS_BROADCAST_COUNT_ERR', { error: e.message || e });
        }
    }

    broadcastConfig(config) {
        this.broadcast({ type: 'config-update', widget: 'goals', config });
    }

    startPolling() {
        if (this._pollInterval) return;
        this._pollInterval = setInterval(() => {
            if (this.hasActiveClients()) {
                this.broadcastCurrentCounts();
            }
        }, 60000);
    }

    stopPolling() {
        if (this._pollInterval) {
            clearInterval(this._pollInterval);
            this._pollInterval = null;
        }
    }

    getGoalUrl(localIp, goalId) {
        if (!goalId) {
            const config = this.bot.getWidgetConfig('goals') || {};
            const goals = config.goals || [];
            goalId = goals.length > 0 ? goals[0].id : '1';
        }
        return `http://${localIp}:${this.port}/widget/goals?id=${goalId}`;
    }

    stop() {
        this.stopPolling();
        super.stop();
    }
}

function createGoalsWidgetServer(bot, defaultPort = 8093) {
    return new GoalsWidgetServer(bot, defaultPort);
}

module.exports = { createGoalsWidgetServer };
