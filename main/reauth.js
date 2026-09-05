const { dialog, shell } = require('electron');
const log = require('./logger').tagged('Auth');
const twitchAuth = require('./twitch-auth');

// An expired token used to fail silently: Twitch calls started returning 401
// and Spotify quietly fell back to scraping the window title, with nothing
// telling the streamer why their overlay had gone stale. This asks them to
// re-authorise, once per service per session so it never turns into nagging.

const SERVICES = {
    twitch: {
        label: 'Twitch',
        detail: 'Le token Twitch a expiré ou a été révoqué. Les alertes, les points de chaîne et le tchat ne fonctionneront plus tant que tu ne t\'es pas reconnecté.'
    },
    spotify: {
        label: 'Spotify',
        detail: 'L\'autorisation Spotify a expiré ou a été révoquée. Le widget affichera le titre lu depuis la fenêtre Spotify en attendant.'
    }
};

class ReauthPrompter {
    constructor({ bot, getMainWindow, getServers }) {
        this.bot = bot;
        this.getMainWindow = getMainWindow;
        this.getServers = getServers;
        // Services already asked about during this session.
        this.asked = new Set();
    }

    clear(service) {
        this.asked.delete(service);
    }

    async request(service, reason) {
        const meta = SERVICES[service];
        if (!meta) return;
        if (this.asked.has(service)) return;
        this.asked.add(service);

        log.warn('AUTH_REAUTH_NEEDED', { service: meta.label, reason: reason || '' });

        const win = this.getMainWindow();
        if (!win || win.isDestroyed()) return;

        const { response } = await dialog.showMessageBox(win, {
            type: 'warning',
            buttons: ['Se reconnecter', 'Plus tard'],
            defaultId: 0,
            cancelId: 1,
            noLink: true,
            title: `Reconnexion ${meta.label} requise`,
            message: `Autorisation ${meta.label} expirée`,
            detail: meta.detail
        });

        if (response !== 0) return;

        try {
            await this.startAuth(service);
        } catch (e) {
            log.error('AUTH_REAUTH_ERR', { service: meta.label, error: e.message || e });
            this.notify(`Impossible de lancer la reconnexion ${meta.label} : ${e.message}`, 'error');
        }
    }

    async startAuth(service) {
        const servers = this.getServers();

        if (service === 'twitch') {
            const port = servers.chatServer ? servers.chatServer.getPort() : 0;
            const built = twitchAuth.buildAuthUrl(this.bot, port);
            if (built.error) {
                this.notify(built.error, 'error');
                return;
            }
            await shell.openExternal(built.url);
            this.notify('Autorise MeoMeoBot dans le navigateur qui vient de s\'ouvrir.', 'success');
            return;
        }

        if (service === 'spotify') {
            if (!servers.spotifyServer) {
                this.notify('Serveur Spotify non démarré.', 'error');
                return;
            }
            await shell.openExternal(servers.spotifyServer.getLoginUrl());
            this.notify('Autorise MeoMeoBot dans le navigateur qui vient de s\'ouvrir.', 'success');
        }
    }

    notify(message, type) {
        const win = this.getMainWindow();
        if (win && !win.isDestroyed()) {
            win.webContents.send('notification', message, type);
        }
    }
}

module.exports = ReauthPrompter;
