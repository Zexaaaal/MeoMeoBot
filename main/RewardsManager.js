const log = require('./logger').tagged('Rewards');

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
        if (process.argv.includes('--dev')) {
            log.info('REWARDS_MOCK_RET');
            return this.bot.mockRewards || [];
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
            return data.data || [];
        } catch (error) {
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
            log.error('REWARDS_DEL_ERR', error);
            throw error;
        }
    }

    handleRedemption(rewardId, tags, message) {
        log.info('REWARDS_REDEMPTION', { id: rewardId, user: tags['display-name'] || tags.username });

        const config = this.bot.getConfig();
        const rewardFunctions = config.rewardFunctions || {};

        const boundFunction = rewardFunctions[rewardId];
        log.info('REWARDS_BINDINGS', { bindings: JSON.stringify(rewardFunctions) });
        log.info('REWARDS_FUNC', { func: boundFunction || 'NONE' });

        if (!boundFunction) return;

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
            this.bot.emit('alert', alertPayload);
        }

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
