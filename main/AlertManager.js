const log = require('./logger').tagged('Alerts');

class AlertManager {
    constructor(bot) {
        this.bot = bot;
    }

    getDefaultText(type) {
        const defaults = {
            'follow': '{username} suit la chaîne !',
            'sub': '{username} s\'est abonné !',
            'resub': '{username} s\'est réabonné pour {months} mois !',
            'subgift': '{username} a offert {amount} sub{s} !',
            'raid': 'Raid de {username} !',
            'donation': '{username} a donné {amount}€',
            'cheer': '{username} a envoyé {amount} bits !',
            'hypetrain': 'Hype Train Niveau {amount} !',
            'kick-follow': '{username} suit la chaîne !',
            'kick-sub': '{username} s\'est abonné !',
            'kick-resub': '{username} s\'est réabonné ({months} mois) !',
            'kick-subgift': '{username} a offert {amount} sub{s} !',
            'kick-gift': '{username} a envoyé {amount} Kicks !'
        };
        return defaults[type] || 'Nouvelle alerte';
    }

    normalizeKickEventType(kickEventType) {
        const mapping = {
            'channel.followed': 'follow',
            'channel.subscription.new': 'sub',
            'channel.subscription.renewal': 'resub',
            'channel.subscription.gifts': 'subgift',
            'kicks.gifted': 'donation'
        };
        return mapping[kickEventType] || kickEventType;
    }

    triggerFromKickWebhook(eventType, payload) {
        const alertType = this.normalizeKickEventType(eventType);

        let data = {};
        switch (eventType) {
            case 'channel.followed':
                data = {
                    username: payload.follower?.username || 'Inconnu',
                    platform: 'kick'
                };
                break;
            case 'channel.subscription.new':
                data = {
                    username: payload.subscriber?.username || 'Inconnu',
                    duration: payload.duration || 1,
                    platform: 'kick'
                };
                break;
            case 'channel.subscription.renewal':
                data = {
                    username: payload.subscriber?.username || 'Inconnu',
                    months: payload.duration || 1,
                    platform: 'kick'
                };
                break;
            case 'channel.subscription.gifts':
                data = {
                    username: payload.gifter?.is_anonymous ? 'Anonyme' : (payload.gifter?.username || 'Inconnu'),
                    amount: payload.giftees?.length || 1,
                    platform: 'kick'
                };
                break;
            case 'kicks.gifted':
                data = {
                    username: payload.sender?.username || 'Inconnu',
                    amount: payload.gift?.amount || 0,
                    message: payload.gift?.message || '',
                    platform: 'kick'
                };
                break;
        }

        this.trigger(alertType, data);
    }

    trigger(type, data) {
        const platform = data.platform || 'twitch';

        if (platform === 'youtube') return;

        if (platform === 'kick') {
            const chatConfig = this.bot.getWidgetConfig('chat') || {};
            if (!chatConfig.platformKick) return;
        }

        log.info('ALERT_TRIGGER', { type, username: data.username, platform });

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
            layout: typeConfig?.layout,
            isVod: !!typeConfig?.isVod,
            platform: data.platform || 'twitch'
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
