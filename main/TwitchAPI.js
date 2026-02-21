const log = require('./logger').tagged('Twitch');

class TwitchAPI {
    constructor(bot) {
        this.bot = bot;
    }

    getToken() {
        const config = this.bot.getConfig();
        return config.token ? config.token.replace('oauth:', '') : '';
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
            log.error('TWITCH_AUTH_ERR', error);
            return null;
        }
    }

    async helixRequest(endpoint, method = 'GET', body = null, { addBroadcasterId = true } = {}) {
        const token = this.getToken();

        if (!token || !this.bot.clientId || !this.bot.userId) {
            throw new Error('Missing credentials (token, clientId or userId)');
        }

        let url = `https://api.twitch.tv/helix/${endpoint}`;
        if (addBroadcasterId) {
            url += (url.includes('?') ? '&' : '?') + `broadcaster_id=${this.bot.userId}`;
        }

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

        const response = await fetch(url, options);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || response.statusText);
        }

        if (response.status === 204) return null;
        return await response.json();
    }

    async banUser(broadcasterId, userId, duration, reason) {
        try {
            await this.helixRequest(
                `moderation/bans?broadcaster_id=${broadcasterId}&moderator_id=${this.bot.userId}`,
                'POST',
                { data: { user_id: userId, duration, reason } },
                { addBroadcasterId: false }
            );
            log.info('TWITCH_MOD_BAN_SUCCESS');
            return true;
        } catch (error) {
            log.error('TWITCH_MOD_BAN_ERR', error);
            return false;
        }
    }

    async deleteMessage(broadcasterId, messageId) {
        try {
            await this.helixRequest(
                `moderation/chat?broadcaster_id=${broadcasterId}&moderator_id=${this.bot.userId}&message_id=${messageId}`,
                'DELETE',
                null,
                { addBroadcasterId: false }
            );
            log.info('TWITCH_MOD_DEL_SUCCESS');
            return true;
        } catch (error) {
            log.error('TWITCH_MOD_DEL_ERR', error);
            return false;
        }
    }

    async createClip(broadcasterId) {
        try {
            const data = await this.helixRequest(
                `clips?broadcaster_id=${broadcasterId}`,
                'POST',
                null,
                { addBroadcasterId: false }
            );
            if (data && data.data && data.data.length > 0) {
                log.info('TWITCH_CLIP_SUCCESS', data.data[0]);
                return data.data[0];
            }
            return null;
        } catch (error) {
            log.error('TWITCH_CLIP_ERR', error);
            throw error;
        }
    }

    async fetchSubCount() {
        if (!this.bot.userId || !this.bot.clientId) return 0;
        try {
            const data = await this.helixRequest('subscriptions');
            return data ? data.total : 0;
        } catch (e) {
            log.error('TWITCH_SUB_COUNT_ERR', e);
        }
        return 0;
    }

    async fetchChannelEmotes(retryCount = 0) {
        try {
            if (!this.bot.userId) {
                log.error('TWITCH_EMOTES_NO_USER');
                return [];
            }

            if (process.argv.includes('--dev')) {
                log.info('TWITCH_EMOTES_MOCK');
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
                log.error('TWITCH_EMOTES_NO_TOKEN');
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
                    log.warn('TWITCH_EMOTES_401');
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
                log.info('TWITCH_EMOTES_FETCHING_GLOBAL');
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
            log.error('TWITCH_EMOTES_ERR', err);
            return [];
        }
    }

    async searchCategories(query) {
        if (!query) return [];
        try {
            const data = await this.helixRequest(
                `search/categories?query=${encodeURIComponent(query)}`,
                'GET', null, { addBroadcasterId: false }
            );
            return data.data;
        } catch (e) {
            log.error('TWITCH_SEARCH_CAT_ERR', e);
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
            log.error('TWITCH_SGDB_ERR', e);
        }
        return null;
    }

    async getStreamInfo(userId) {
        if (!userId) return null;
        try {
            const data = await this.helixRequest(`streams?user_id=${userId}`);
            return data && data.data && data.data.length > 0 ? data.data[0] : null;
        } catch (e) {
            log.error('TWITCH_STREAM_INFO_ERR', e);
            return null;
        }
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
            log.error('TWITCH_SCHEDULE_ERR', e);
            return null;
        }
    }

    async createScheduleSegment(segment) {
        try {
            await this.helixRequest('schedule/segment', 'POST', segment);
            return true;
        } catch (e) {
            log.error('TWITCH_SEGMENT_CRE_ERR', e);
            throw e;
        }
    }

    async updateScheduleSegment(id, segment) {
        try {
            await this.helixRequest(`schedule/segment?id=${id}`, 'PATCH', segment);
            return true;
        } catch (e) {
            log.error('TWITCH_SEGMENT_UPD_ERR', e);
            throw e;
        }
    }

    async deleteScheduleSegment(id) {
        try {
            await this.helixRequest(`schedule/segment?id=${id}`, 'DELETE');
            return true;
        } catch (e) {
            log.error('TWITCH_SEGMENT_DEL_ERR', e);
            throw e;
        }
    }
}

module.exports = TwitchAPI;
