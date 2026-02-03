const logger = require('./logger');

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
                should_redemptions_skip_request_queue: false
            },
            {
                id: 'mock-reward-2',
                title: 'VIP',
                cost: 1000,
                background_color: '#1aa5aaff',
                is_enabled: true,
                global_cooldown_setting: { is_enabled: false, global_cooldown_seconds: 0 },
                should_redemptions_skip_request_queue: false
            },
            {
                id: 'mock-reward-emote-rain',
                title: "Pluie d'emotes",
                cost: 10,
                background_color: '#FF00FF',
                is_enabled: true,
                global_cooldown_setting: { is_enabled: false, global_cooldown_seconds: 0 },
                should_redemptions_skip_request_queue: false
            }
        ];
    }

    async getCustomRewards() {
        if (this.isDevMockEnabled()) {
            logger.log('[DEV] Returning mocked Custom Rewards (Stateful)');
            return this.bot.mockRewards;
        }

        if (!this.bot.userId || !this.bot.clientId) return [];
        const config = this.bot.getConfig();
        const token = config.token.replace('oauth:', '');

        try {
            const response = await fetch(
                `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${this.bot.userId}`,
                {
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Client-Id': this.bot.clientId
                    }
                }
            );

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`API Error: ${response.status} ${text}`);
            }

            const data = await response.json();
            return data.data;
        } catch (error) {
            logger.error('[POINTS] Error fetching rewards:', error);
            throw error;
        }
    }

    async createCustomReward(data) {
        if (this.isDevMockEnabled()) {
            logger.log('[DEV] Mock create reward:', data);
            const newReward = {
                id: 'mock-reward-' + Date.now(),
                ...data,
                is_enabled: true,
                is_paused: false,
                is_in_stock: true,
                should_redemptions_skip_request_queue: false,
                redemptions_redeemed_current_stream: null,
                cooldown_expires_at: null
            };
            this.bot.mockRewards.push(newReward);
            return newReward;
        }

        if (!this.bot.userId || !this.bot.clientId) {
            throw new Error('Bot not connected or user ID missing');
        }

        const config = this.bot.getConfig();
        const token = config.token.replace('oauth:', '');

        try {
            const response = await fetch(
                `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${this.bot.userId}`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Client-Id': this.bot.clientId,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                }
            );

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`API Error: ${response.status} ${text}`);
            }

            const resData = await response.json();
            return resData.data[0];
        } catch (error) {
            logger.error('[POINTS] Error creating reward:', error);
            throw error;
        }
    }

    async updateCustomReward(id, data) {
        if (this.isDevMockEnabled()) {
            logger.log('[DEV] Mock update reward:', id, data);
            const index = this.bot.mockRewards.findIndex(r => r.id === id);
            if (index !== -1) {
                this.bot.mockRewards[index] = { ...this.bot.mockRewards[index], ...data };
                return this.bot.mockRewards[index];
            }
            throw new Error('Reward not found in mock store');
        }

        if (!this.bot.userId || !this.bot.clientId) {
            throw new Error('Bot not connected');
        }

        const config = this.bot.getConfig();
        const token = config.token.replace('oauth:', '');

        try {
            const response = await fetch(
                `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${this.bot.userId}&id=${id}`,
                {
                    method: 'PATCH',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Client-Id': this.bot.clientId,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify(data)
                }
            );

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`API Error: ${response.status} ${text}`);
            }

            const resData = await response.json();
            return resData.data[0];
        } catch (error) {
            logger.error('[POINTS] Error updating reward:', error);
            throw error;
        }
    }

    async deleteCustomReward(id) {
        if (this.isDevMockEnabled()) {
            logger.log('[DEV] Mock delete reward:', id);
            this.bot.mockRewards = this.bot.mockRewards.filter(r => r.id !== id);
            return true;
        }

        if (!this.bot.userId || !this.bot.clientId) {
            throw new Error('Bot not connected');
        }

        const config = this.bot.getConfig();
        const token = config.token.replace('oauth:', '');

        try {
            const response = await fetch(
                `https://api.twitch.tv/helix/channel_points/custom_rewards?broadcaster_id=${this.bot.userId}&id=${id}`,
                {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Client-Id': this.bot.clientId
                    }
                }
            );

            if (!response.ok) {
                const text = await response.text();
                throw new Error(`API Error: ${response.status} ${text}`);
            }

            return true;
        } catch (error) {
            logger.error('[POINTS] Error deleting reward:', error);
            throw error;
        }
    }

    handleRedemption(rewardId, tags, message) {
        logger.log(`[POINTS] Redemption received! ID: ${rewardId}, User: ${tags['display-name'] || tags.username}`);
        const config = this.bot.getConfig();
        const rewardFunctions = config.rewardFunctions || {};
        const boundFunction = rewardFunctions[rewardId];

        logger.log(`[POINTS] Mapping for reward ${rewardId}: ${boundFunction || 'NONE'}`);

        const sound = config.rewardSounds ? config.rewardSounds[rewardId] : null;
        let volume = config.pointsGlobalVolume !== undefined ? config.pointsGlobalVolume : 0.5;

        if (sound) {
            const alertPayload = {
                type: 'reward-redemption',
                username: tags['display-name'] || tags.username,
                text: null,
                image: null,
                audio: sound,
                volume: volume
            };
            if (this.bot.onAlert) this.bot.onAlert(alertPayload);
        }

        if (rewardId === 'mock-reward-emote-rain') {
            logger.log(`[DEV] Mock triggering Emote Rain`);
            this.bot.twitchAPI.fetchChannelEmotes().then(emotes => {
                if (emotes && emotes.length > 0 && this.bot.onEmoteRain) {
                    this.bot.onEmoteRain(emotes);
                }
            }).catch(err => logger.error('[BOT] Error triggering mock emote rain:', err));
            return;
        }

        if (boundFunction === 'emote_rain') {
            logger.log(`[POINTS] Triggering Emote Rain for reward: ${rewardId}`);
            this.bot.twitchAPI.fetchChannelEmotes().then(emotes => {
                logger.log(`[BOT] Fetched ${emotes.length} emotes for rain`);
                if (emotes && emotes.length > 0) {
                    if (this.bot.onEmoteRain) {
                        this.bot.onEmoteRain(emotes);
                    } else {
                        logger.warn('[BOT] onEmoteRain callback not set!');
                    }
                }
            }).catch(err => logger.error('[BOT] Error triggering emote rain:', err));
        }
    }
}

module.exports = RewardsManager;
