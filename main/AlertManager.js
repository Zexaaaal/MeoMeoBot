const log = require('./logger').tagged('Alerts');

class AlertManager {
    constructor(bot) {
        this.bot = bot;
    }

    getDefaultText(type) {
        switch (type) {
            case 'follow': return '{username} suit la chaîne !';
            case 'sub': return '{username} s\'est abonné !';
            case 'resub': return '{username} s\'est réabonné pour {months} mois !';
            case 'subgift': return '{username} a offert {amount} sub{s} !';
            case 'raid': return 'Raid de {username} !';
            case 'donation': return '{username} a donné {amount}€';
            case 'cheer': return '{username} a envoyé {amount} bits !';
            case 'hypetrain': return 'Hype Train Niveau {amount} !';
            default: return 'Nouvelle alerte';
        }
    }

    trigger(type, data) {
        log.info(`[BOT] Triggering Alert: ${type}`, data);

        const allConfig = this.bot.getWidgetConfig('alerts');
        const typeConfig = allConfig ? allConfig[type] : null;

        if (typeConfig && typeConfig.enabled === false) return;

        const alertPayload = {
            type,
            username: data.username || 'Inconnu',
            amount: data.amount,
            message: data.message || '',
            text: typeConfig?.textTemplate || this.getDefaultText(type),
            image: typeConfig?.image,
            audio: typeConfig?.audio,
            volume: typeConfig?.volume,
            duration: typeConfig?.duration,
            layout: typeConfig?.layout
        };

        if (['sub', 'resub', 'subgift'].includes(type)) {
            alertPayload.message = '';
        }

        let displayAmount = alertPayload.amount || '';

        alertPayload.text = alertPayload.text
            .replace('{username}', `<span class="alert-username">${alertPayload.username}</span>`)
            .replace('{amount}', `<span class="alert-amount">${displayAmount}</span>`)
            .replace('{months}', `<span class="alert-months">${data.months || ''}</span>`)
            .replace('{s}', (alertPayload.amount && alertPayload.amount > 1) ? 's' : '');

        this.bot.emit('alert', alertPayload);
    }
}

module.exports = AlertManager;
