const BaseWidgetServer = require('./BaseWidgetServer');

class RouletteWidgetServer extends BaseWidgetServer {
    constructor(bot, defaultPort) {
        super(bot, defaultPort, 'roulette');
    }

    transformHtml(html) {
        const htmlWithScript = super.transformHtml(html);
        const config = this.bot.getWidgetConfig('roulette') || {};
        const choices = JSON.stringify(config.choices || []);
        return htmlWithScript.replace('const INITIAL_CHOICES = [];', `const INITIAL_CHOICES = ${choices};`);
    }

    broadcastConfig(config) {
        this.broadcast({ type: 'config-update', widget: 'roulette', config });
    }

    broadcastSpin(winnerIndex, angle) {
        this.broadcast({ type: 'spin', winnerIndex, angle });
    }
}

function createRouletteWidgetServer(bot, defaultPort = 8092) {
    return new RouletteWidgetServer(bot, defaultPort);
}

module.exports = { createRouletteWidgetServer };
