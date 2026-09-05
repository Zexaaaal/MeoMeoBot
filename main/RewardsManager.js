const log = require('./logger').tagged('Rewards');

const REWARDS_URL = 'https://api.twitch.tv/helix/channel_points/custom_rewards';

class RewardsManager {
    constructor(bot) {
        this.bot = bot;
    }

    isDevMockEnabled() {
        if (process.argv.includes('--dev')) {
            try {
                const fs = require('fs');
                const path = require('path');
                const devOptionsPath = path.join(__dirname, '../dev_options.js');
                if (fs.existsSync(devOptionsPath)) {
                    const devOptions = require('../dev_options.js');
                    return !!devOptions.mockAffiliate;
                }
            } catch (e) {
                return false;
            }
        }
        return false;
    }

    getMockRewards() {
        return [
            {
                id: 'mock-reward-1',
                title: 'BOIS',
                cost: 50,
                background_color: '#b665f8ff',
                is_enabled: true,
                global_cooldown_setting: { is_enabled: true, global_cooldown_seconds: 60 },
                should_redemptions_skip_request_queue: false,
                is_manageable: true
            },
            {
                id: 'mock-reward-2',
                title: 'VIP',
                cost: 1000,
                background_color: '#1aa5aaff',
                is_enabled: true,
                global_cooldown_setting: { is_enabled: false, global_cooldown_seconds: 0 },
                should_redemptions_skip_request_queue: false,
                is_manageable: true
            },
            {
                id: 'mock-reward-emote-rain',
                title: "Pluie d'emotes",
                cost: 10,
                background_color: '#FF00FF',
                is_enabled: true,
                global_cooldown_setting: { is_enabled: false, global_cooldown_seconds: 0 },
                should_redemptions_skip_request_queue: false,
                is_manageable: true
            }
        ];
    }

    // Single entry point for every channel points call: the four methods below
    // used to repeat this token/client-id/fetch/error block verbatim.
    async request(method, { query = {}, body = null } = {}) {
        if (!this.bot.userId || !this.bot.clientId) {
            throw new Error('Bot non connecté (userId ou clientId manquant)');
        }

        const config = this.bot.getConfig();
        const token = (config.token || '').replace('oauth:', '');
        if (!token) throw new Error('Token Twitch manquant');

        const params = new URLSearchParams({ broadcaster_id: this.bot.userId, ...query });
        const options = {
            method,
            headers: {
                'Authorization': `Bearer ${token}`,
                'Client-Id': this.bot.clientId
            }
        };
        if (body) {
            options.headers['Content-Type'] = 'application/json';
            options.body = JSON.stringify(body);
        }

        const response = await fetch(`${REWARDS_URL}?${params}`, options);

        if (!response.ok) {
            const text = await response.text();
            let detail = text;
            try {
                const parsed = JSON.parse(text);
                detail = parsed.message || text;
            } catch (e) { /* keep the raw body */ }
            throw new Error(`API Error: ${response.status} ${detail}`);
        }

        if (response.status === 204) return null;
        return response.json();
    }

    /**
     * Twitch only lets an app edit or delete the rewards it created itself:
     * anything made in the Twitch dashboard or by another bot answers 403 on
     * PATCH/DELETE. We therefore fetch the full list (so everything is still
     * visible and bindable to a sound) plus the manageable subset, and tag each
     * reward so the UI can show the rest as read-only instead of failing later.
     */
    async getCustomRewards() {
        if (process.argv.includes('--dev')) {
            log.info('REWARDS_MOCK_RET');
            return this.bot.mockRewards || [];
        }

        if (!this.bot.userId || !this.bot.clientId) return [];

        try {
            const all = await this.request('GET');
            const rewards = (all && all.data) || [];

            let manageableIds = new Set();
            try {
                const manageable = await this.request('GET', {
                    query: { only_manageable_rewards: 'true' }
                });
                manageableIds = new Set(((manageable && manageable.data) || []).map(r => r.id));
            } catch (e) {
                log.warn('REWARDS_MANAGEABLE_ERR', { error: e.message });
                // Fall back to assuming everything is editable rather than
                // locking the whole UI on a secondary call failing.
                manageableIds = new Set(rewards.map(r => r.id));
            }

            const tagged = rewards.map(r => ({ ...r, is_manageable: manageableIds.has(r.id) }));
            const external = tagged.filter(r => !r.is_manageable).length;
            if (external > 0) log.info('REWARDS_EXTERNAL_COUNT', { count: external });

            return tagged;
        } catch (error) {
            if (error.message.includes('403')) {
                log.warn('REWARDS_FETCH_FORBIDDEN', { reason: 'Broadcaster does not have partner or affiliate status.' });
                return [];
            }
            log.error('REWARDS_FETCH_ERR', error);
            throw error;
        }
    }

    async createReward(data) {
        if (process.argv.includes('--dev')) {
            log.info('REWARDS_MOCK_CRE', data);
            const id = 'mock-reward-' + Date.now();
            const newReward = {
                id: id,
                ...data,
                is_enabled: true,
                is_paused: false,
                is_in_stock: true,
                is_manageable: true,
                should_redemptions_skip_request_queue: false,
                redemptions_redeemed_current_stream: null,
                cooldown_expires_at: null,
                global_cooldown_setting: {
                    is_enabled: data.is_global_cooldown_enabled || false,
                    global_cooldown_seconds: data.global_cooldown_seconds || 0
                }
            };
            this.bot.mockRewards.push(newReward);
            return newReward;
        }

        try {
            const resData = await this.request('POST', { body: data });
            const created = resData.data[0];
            return { ...created, is_manageable: true };
        } catch (error) {
            log.error('REWARDS_CRE_ERR', error);
            throw error;
        }
    }

    async updateReward(id, data) {
        if (process.argv.includes('--dev')) {
            log.info('REWARDS_MOCK_UPD', id, data);
            const rewards = this.bot.mockRewards || [];
            const r = rewards.find(r => r.id === id);
            if (r) {
                const updatedReward = { ...r, ...data };
                if (data.is_global_cooldown_enabled !== undefined || data.global_cooldown_seconds !== undefined) {
                    updatedReward.global_cooldown_setting = {
                        is_enabled: data.is_global_cooldown_enabled !== undefined ? data.is_global_cooldown_enabled : (updatedReward.global_cooldown_setting?.is_enabled || false),
                        global_cooldown_seconds: data.global_cooldown_seconds !== undefined ? data.global_cooldown_seconds : (updatedReward.global_cooldown_setting?.global_cooldown_seconds || 0)
                    };
                }
                const idx = this.bot.mockRewards.findIndex(r => r.id === id);
                if (idx !== -1) this.bot.mockRewards[idx] = updatedReward;
                return updatedReward;
            }
            throw new Error('Reward not found in mock store');
        }

        try {
            const resData = await this.request('PATCH', { query: { id }, body: data });
            return { ...resData.data[0], is_manageable: true };
        } catch (error) {
            log.error('REWARDS_UPD_ERR', error);
            throw error;
        }
    }

    async deleteReward(id) {
        if (process.argv.includes('--dev')) {
            log.info('REWARDS_MOCK_DEL', id);
            this.bot.mockRewards = (this.bot.mockRewards || []).filter(r => r.id !== id);
            return true;
        }

        try {
            await this.request('DELETE', { query: { id } });
            return true;
        } catch (error) {
            log.error('REWARDS_DEL_ERR', error);
            throw error;
        }
    }

    handleRedemption(rewardId, tags, message) {
        log.info('REWARDS_REDEMPTION', { id: rewardId, user: tags['display-name'] || tags.username });

        const config = this.bot.getConfig();
        const rewardFunctions = config.rewardFunctions || {};

        const boundFunction = rewardFunctions[rewardId];

        const sound = config.rewardSounds ? config.rewardSounds[rewardId] : null;
        let volume = config.pointsGlobalVolume !== undefined ? config.pointsGlobalVolume : 0.5;

        const rewardVodFlags = config.rewardVodFlags || {};

        if (sound) {
            const alertPayload = {
                type: 'reward-redemption',
                username: tags['display-name'] || tags.username,
                text: null,
                image: null,
                audio: sound,
                volume: volume,
                isVod: !!rewardVodFlags[rewardId]
            };
            this.bot.emit('alert', alertPayload);
        }

        if (!boundFunction) return;

        if (boundFunction === 'emote_rain') {
            this.triggerEmoteRain(rewardId);
        }
    }

    triggerEmoteRain(rewardId) {
        log.info('REWARDS_RAIN', { id: rewardId });
        this.bot.twitchAPI.fetchChannelEmotes().then(emotes => {
            log.info('REWARDS_RAIN_EMOTES', { count: emotes.length });
            this.bot.emit('emote-rain', emotes);
        }).catch(err => log.error('REWARDS_RAIN_ERR', err));
    }
}

module.exports = RewardsManager;
