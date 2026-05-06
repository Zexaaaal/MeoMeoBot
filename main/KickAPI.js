const log = require('./logger').tagged('KickAPI');

const KICK_API_BASE = 'https://api.kick.com';
const KICK_AUTH_BASE = 'https://id.kick.com';

class KickAPI {
    constructor(bot) {
        this.bot = bot;
        this.appAccessToken = null;
        this.userAccessToken = null;
        this.tokenExpiry = null;
        this.broadcasterId = null;
    }

    getConfig() {
        return this.bot.getConfig ? this.bot.getConfig() : {};
    }

    async ensureAppToken() {
        if (this.appAccessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return this.appAccessToken;
        }

        const config = this.getConfig();
        if (!config.kickClientId || !config.kickClientSecret) {
            return null;
        }

        try {
            const params = new URLSearchParams({
                grant_type: 'client_credentials',
                client_id: config.kickClientId,
                client_secret: config.kickClientSecret
            });

            const response = await fetch(`${KICK_AUTH_BASE}/oauth/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString()
            });

            if (!response.ok) {
                log.error('KICK_APP_TOKEN_ERR', { status: response.status });
                return null;
            }

            const data = await response.json();
            this.appAccessToken = data.access_token;
            this.tokenExpiry = Date.now() + (data.expires_in * 1000) - 60000;

            if (this.bot.updateConfig) {
                this.bot.updateConfig({ kickAppToken: this.appAccessToken });
            }

            log.info('KICK_APP_TOKEN_OK');
            return this.appAccessToken;
        } catch (err) {
            log.error('KICK_APP_TOKEN_FETCH_ERR', { error: err.message });
            return null;
        }
    }

    async apiRequest(endpoint, method = 'GET', body = null, useUserToken = false) {
        const token = useUserToken
            ? (this.getConfig().kickToken || this.userAccessToken)
            : await this.ensureAppToken();

        if (!token) {
            log.error('KICK_API_NO_TOKEN', { endpoint });
            return null;
        }

        const config = this.getConfig();
        const headers = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
        };

        if (config.kickClientId) {
            headers['X-Kick-Client-ID'] = config.kickClientId;
        }

        const options = { method, headers };
        if (body) options.body = JSON.stringify(body);

        try {
            const response = await fetch(`${KICK_API_BASE}${endpoint}`, options);

            if (!response.ok) {
                const text = await response.text();
                log.error('KICK_API_ERR', { endpoint, status: response.status, body: text });
                return null;
            }

            const contentType = response.headers.get('content-type');
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }
            return { ok: true };
        } catch (err) {
            log.error('KICK_API_REQ_ERR', { endpoint, error: err.message });
            return null;
        }
    }

    async getChannel(slug) {
        const lowerSlug = slug.toLowerCase();
        const data = await this.apiRequest(`/public/v1/channels?slug=${encodeURIComponent(lowerSlug)}`);
        if (data && data.data && data.data.length > 0) {
            this.broadcasterId = data.data[0].broadcaster_user_id;
            return data.data[0];
        }
        log.warn('KICK_CHANNEL_EMPTY_RESPONSE', { slug: lowerSlug, response: JSON.stringify(data) });
        return null;
    }

    async sendChatMessage(content) {
        if (!this.broadcasterId) {
            const config = this.getConfig();
            if (config.kickChannel) {
                await this.getChannel(config.kickChannel);
            }
        }

        if (!this.broadcasterId) {
            log.error('KICK_SEND_NO_BROADCASTER');
            return null;
        }

        return await this.apiRequest('/public/v1/chat', 'POST', {
            broadcaster_user_id: parseInt(this.broadcasterId, 10),
            content,
            type: 'user'
        }, true);
    }

    async deleteMessage(messageId) {
        return await this.apiRequest(`/public/v1/chat/${messageId}`, 'DELETE', null, true);
    }

    async subscribeToEvents(webhookUrl, events) {
        if (!webhookUrl) {
            log.warn('KICK_NO_WEBHOOK_URL');
            return null;
        }

        if (!this.broadcasterId) {
            const config = this.getConfig();
            if (config.kickChannel) {
                await this.getChannel(config.kickChannel);
            }
        }

        const results = [];
        for (const event of events) {
            const result = await this.apiRequest('/public/v1/events/subscriptions', 'POST', {
                event,
                broadcaster_user_id: this.broadcasterId,
                method: 'webhook',
                callback_url: webhookUrl,
                version: 1
            });
            results.push({ event, result });
        }

        return results;
    }

    async getEventSubscriptions() {
        return await this.apiRequest('/public/v1/events/subscriptions');
    }
}

module.exports = KickAPI;
