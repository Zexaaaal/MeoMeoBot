const logger = require('./logger');

class TwitchAPI {
    constructor(bot) {
        this.bot = bot;
    }

    async validateToken(token) {
        try {
            const cleanToken = token.replace('oauth:', '');
            const response = await fetch('https://id.twitch.tv/oauth2/validate', {
                headers: { 'Authorization': `OAuth ${cleanToken}` }
            });

            if (!response.ok) {
                throw new Error(`Token validation failed: ${response.statusText}`);
            }

            const data = await response.json();
            return {
                clientId: data.client_id,
                userId: data.user_id
            };
        } catch (error) {
            logger.error('[AUTH] Erreur validation token:', error);
            return null;
        }
    }

    async helixRequest(endpoint, method = 'GET', body = null) {
        const config = this.bot.getConfig();
        const token = config.token ? config.token.replace('oauth:', '') : '';

        if (!token || !this.bot.clientId || !this.bot.userId) {
            throw new Error('Missing credentials (token, clientId or userId)');
        }

        const url = `https://api.twitch.tv/helix/${endpoint}`;
        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Client-Id': this.bot.clientId,
                'Content-Type': 'application/json'
            }
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const fullUrl = url + (url.includes('?') ? '&' : '?') + `broadcaster_id=${this.bot.userId}`;
        const response = await fetch(fullUrl, options);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || response.statusText);
        }

        if (response.status === 204) return null;
        return await response.json();
    }

    async banUser(broadcasterId, userId, duration, reason) {
        const config = this.bot.getConfig();
        const token = config.token.replace('oauth:', '');

        try {
            const response = await fetch(
                `https://api.twitch.tv/helix/moderation/bans?broadcaster_id=${broadcasterId}&moderator_id=${this.bot.userId}`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Client-Id': this.bot.clientId,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        data: { user_id: userId, duration, reason }
                    })
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API Error: ${errorData.message || response.statusText}`);
            }

            logger.log('[MOD] Helix Ban/Timeout success');
            return true;
        } catch (error) {
            logger.error('[MOD] Erreur Ban/Timeout:', error);
            return false;
        }
    }

    async deleteMessage(broadcasterId, messageId) {
        const config = this.bot.getConfig();
        const token = config.token.replace('oauth:', '');

        try {
            const response = await fetch(
                `https://api.twitch.tv/helix/moderation/chat?broadcaster_id=${broadcasterId}&moderator_id=${this.bot.userId}&message_id=${messageId}`,
                {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Client-Id': this.bot.clientId
                    }
                }
            );

            if (!response.ok) {
                throw new Error(`API Error: ${response.status} ${response.statusText}`);
            }

            logger.log('[MOD] Helix Delete success');
            return true;
        } catch (error) {
            logger.error('[MOD] Helix Delete error:', error);
            return false;
        }
    }

    async createClip(broadcasterId) {
        const config = this.bot.getConfig();
        const token = config.token.replace('oauth:', '');

        try {
            const response = await fetch(
                `https://api.twitch.tv/helix/clips?broadcaster_id=${broadcasterId}`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Client-Id': this.bot.clientId
                    }
                }
            );

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`API Error: ${response.status} ${errorData.message || response.statusText}`);
            }

            const data = await response.json();
            if (data.data && data.data.length > 0) {
                logger.log('[CLIP] Clip created:', data.data[0]);
                return data.data[0];
            }
            return null;
        } catch (error) {
            logger.error('[CLIP] Error creating clip:', error);
            throw error;
        }
    }

    async fetchSubCount() {
        if (!this.bot.userId || !this.bot.clientId) return 0;

        try {
            const config = this.bot.getConfig();
            const token = config.token.replace('oauth:', '');
            const response = await fetch(
                `https://api.twitch.tv/helix/subscriptions?broadcaster_id=${this.bot.userId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Client-Id': this.bot.clientId
                    }
                }
            );

            if (response.ok) {
                const data = await response.json();
                return data.total;
            }
        } catch (e) {
            logger.error('[BOT] Error fetching sub count:', e);
        }
        return 0;
    }

    async fetchChannelEmotes(retryCount = 0) {
        try {
            if (!this.bot.userId) {
                logger.error('[BOT] fetchChannelEmotes failed: userId is null');
                return [];
            }

            if (process.argv.includes('--dev')) {
                logger.log('[BOT] (DEV) Returning mock emotes');
                return [
                    'https://static-cdn.jtvnw.net/emoticons/v2/25/default/dark/3.0',
                    'https://static-cdn.jtvnw.net/emoticons/v2/81274/default/dark/3.0',
                    'https://static-cdn.jtvnw.net/emoticons/v2/30259/default/dark/3.0'
                ];
            }

            await this.bot.ensureAppAccessToken();

            const config = this.bot.getConfig();
            const userToken = config.token ? config.token.replace('oauth:', '') : null;
            const usingAppToken = !!this.bot.appAccessToken;
            const tokenToUse = this.bot.appAccessToken || userToken;

            if (!tokenToUse) {
                logger.error('[BOT] fetchChannelEmotes failed: No valid token (App or User) available');
                return [];
            }

            const response = await fetch(
                `https://api.twitch.tv/helix/chat/emotes?broadcaster_id=${this.bot.userId}`,
                {
                    headers: {
                        'Client-Id': this.bot.appClientId || this.bot.clientId,
                        'Authorization': `Bearer ${tokenToUse}`
                    }
                }
            );

            if (response.status === 401) {
                if (retryCount < 1 && usingAppToken) {
                    logger.warn('[BOT] fetchChannelEmotes received 401. Invalidating App Token and retrying...');
                    this.bot.appAccessToken = null;
                    this.bot.appClientId = null;
                    this.bot.updateConfig({ twitchAppToken: null, twitchClientId: null });
                    return this.fetchChannelEmotes(retryCount + 1);
                }
            }

            if (!response.ok) {
                throw new Error(`Failed to fetch emotes: ${response.statusText}`);
            }

            const data = await response.json();
            const emotes = data.data || [];

            if (emotes.length === 0) {
                logger.log('[BOT] No channel emotes found, fetching global emotes...');
                const globalResp = await fetch('https://api.twitch.tv/helix/chat/emotes/global', {
                    headers: {
                        'Client-Id': this.bot.appClientId || this.bot.clientId,
                        'Authorization': `Bearer ${this.bot.appAccessToken || userToken}`
                    }
                });
                if (globalResp.ok) {
                    const globalData = await globalResp.json();
                    return (globalData.data || [])
                        .slice(0, 50)
                        .map(e => `https://static-cdn.jtvnw.net/emoticons/v2/${e.id}/default/dark/3.0`);
                }
                return [];
            }

            let filtered = emotes.filter(e => e.format && e.format.includes('animated'));
            if (filtered.length === 0) filtered = emotes;

            return filtered.map(e => `https://static-cdn.jtvnw.net/emoticons/v2/${e.id}/default/dark/3.0`);
        } catch (err) {
            logger.error('[BOT] Error fetching channel emotes:', err);
            return [];
        }
    }

    async searchCategories(query) {
        if (!query) return [];
        try {
            const data = await this.helixRequest(`search/categories?query=${encodeURIComponent(query)}`);
            return data.data;
        } catch (e) {
            logger.error('[TWITCH] Error searching categories:', e);
            throw e;
        }
    }

    async getSteamGridDbImage(gameName) {
        const config = this.bot.getConfig();
        const apiKey = config.steamGridDbApiKey;
        if (!apiKey) return null;

        try {
            const searchResp = await fetch(
                `https://www.steamgriddb.com/api/v2/search/autocomplete/${encodeURIComponent(gameName)}`,
                { headers: { 'Authorization': `Bearer ${apiKey}` } }
            );
            if (!searchResp.ok) return null;
            const searchData = await searchResp.json();

            if (!searchData.data || searchData.data.length === 0) return null;

            const gameId = searchData.data[0].id;
            const gridsResp = await fetch(
                `https://www.steamgriddb.com/api/v2/grids/game/${gameId}?styles=alternate,material,white_logo,blur`,
                { headers: { 'Authorization': `Bearer ${apiKey}` } }
            );

            if (!gridsResp.ok) return null;
            const gridsData = await gridsResp.json();

            if (gridsData.data && gridsData.data.length > 0) {
                gridsData.data.sort((a, b) => (b.width * b.height) - (a.width * a.height));
                return gridsData.data[0].url;
            }
        } catch (e) {
            logger.error('[SGDB] Error:', e);
        }
        return null;
    }

    async getSchedule() {
        if (!this.bot.userId || !this.bot.clientId) return null;
        try {
            const data = await this.helixRequest('schedule');
            return data ? data.data : null;
        } catch (e) {
            if (e.message && e.message.includes('segments were not found')) {
                return { segments: [] };
            }
            logger.error('[TWITCH] Error fetching schedule:', e);
            return null;
        }
    }

    async createScheduleSegment(segment) {
        try {
            await this.helixRequest('schedule/segment', 'POST', segment);
            return true;
        } catch (e) {
            logger.error('[TWITCH] Error creating segment:', e);
            throw e;
        }
    }

    async updateScheduleSegment(id, segment) {
        try {
            await this.helixRequest(`schedule/segment?id=${id}`, 'PATCH', segment);
            return true;
        } catch (e) {
            logger.error('[TWITCH] Error updating segment:', e);
            throw e;
        }
    }

    async deleteScheduleSegment(id) {
        try {
            await this.helixRequest(`schedule/segment?id=${id}`, 'DELETE');
            return true;
        } catch (e) {
            logger.error('[TWITCH] Error deleting segment:', e);
            throw e;
        }
    }
}

module.exports = TwitchAPI;
