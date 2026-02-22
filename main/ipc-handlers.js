const { ipcMain, BrowserWindow, dialog, shell, app } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('./logger').tagged('IPC');

function registerHandlers(deps) {
    const {
        bot,
        getServers,
        getLocalIp,
        mediaServer
    } = deps;

    ipcMain.handle('get-app-version', () => app.getVersion());

    ipcMain.handle('connect-bot', async () => {
        try { await bot.connect(); return { success: true }; }
        catch (error) { return { success: false, error: error.message }; }
    });

    ipcMain.handle('disconnect-bot', async () => {
        bot.disconnect();
        return { success: true };
    });

    ipcMain.handle('get-config', () => {
        // log.info('IPC_GET_CONFIG_CALLED');
        const config = bot.getConfig();
        // log.info('IPC_RETURNING_CONFIG_KEYS', { keys: Object.keys(config || {}).join(', ') });
        return config;
    });
    ipcMain.handle('get-bot-status', () => ({
        connected: bot.isConnected,
        channel: bot.getConfig().channel
    }));

    ipcMain.handle('save-config', (event, config) => {
        if (!config || typeof config !== 'object') throw new Error('Invalid configuration object');
        bot.updateConfig(config);
        if (config.clipCooldown !== undefined) bot.setClipCooldown(config.clipCooldown);
        if (deps.streamlabsClient && config.streamlabsSocketToken !== undefined) {
            deps.streamlabsClient.updateToken(config.streamlabsSocketToken);
        }
        const servers = getServers();
        if (servers.spotifyServer && (config.spotifyClientId || config.spotifyClientSecret)) {
            servers.spotifyServer.stopPolling();
            servers.spotifyServer.startPolling();
        }

        if (config.channel || config.username || config.token) setTimeout(() => bot.connect(), 500);
        return { success: true };
    });

    ipcMain.handle('is-dev', () => !app.isPackaged || process.argv.includes('--dev'));

    ipcMain.handle('get-commands', () => ({ commands: bot.getCommands() }));

    ipcMain.handle('add-command', (event, command, response) => {
        if (typeof command !== 'string' || typeof response !== 'string') throw new Error('Invalid arguments');
        bot.addCommand(command, response);
        return { success: true };
    });

    ipcMain.handle('remove-command', (event, command) => {
        if (typeof command !== 'string') throw new Error('Invalid arguments');
        bot.removeCommand(command);
        return { success: true };
    });

    ipcMain.handle('start-giveaway', () => { bot.startGiveaway(); return { success: true }; });
    ipcMain.handle('stop-giveaway', () => { bot.stopGiveaway(); return { success: true }; });
    ipcMain.handle('draw-winner', () => ({ success: true, winner: bot.drawWinner() }));
    ipcMain.handle('clear-participants', () => { bot.clearParticipants(); return { success: true }; });
    ipcMain.handle('get-participants', () => bot.getParticipants());
    ipcMain.handle('is-giveaway-active', () => bot.isGiveawayActive());

    ipcMain.handle('get-banned-words', () => ({ bannedWords: bot.getBannedWords() }));

    ipcMain.handle('add-banned-word', (event, word) => {
        if (typeof word !== 'string') throw new Error('Invalid arguments');
        return { success: true, bannedWords: bot.addBannedWord(word) };
    });

    ipcMain.handle('remove-banned-word', (event, word) => {
        if (typeof word !== 'string') throw new Error('Invalid arguments');
        return { success: true, bannedWords: bot.removeBannedWord(word) };
    });

    ipcMain.handle('clear-banned-words', async () => {
        if (bot) { bot.clearBannedWords(); return { success: true }; }
        return { success: false };
    });

    ipcMain.handle('get-widget-config', (event, widgetName) => bot.getWidgetConfig(widgetName));

    ipcMain.handle('save-widget-config', (event, widgetName, config) => {
        bot.saveWidgetConfig(widgetName, config);
        const servers = getServers();

        if (widgetName === 'spotify' && servers.spotifyServer) {
            servers.spotifyServer.broadcastConfig(config);
        } else if (widgetName === 'subgoals' && servers.subgoalsServer) {
            servers.subgoalsServer.broadcastConfig(config, 'subgoals');
        } else if (widgetName === 'subgoals-list' && servers.subgoalsServer) {
            servers.subgoalsServer.broadcastConfig(config, 'subgoals-list');
        } else if (widgetName === 'roulette' && servers.rouletteServer) {
            servers.rouletteServer.broadcastConfig(config);
        } else if (widgetName === 'chat' && servers.chatServer) {
            servers.chatServer.broadcastConfig(config);
        } else if (servers.chatServer && widgetName === 'emote-wall') {
            servers.chatServer.broadcastConfig(config, widgetName);
        } else if (widgetName === 'alerts' && servers.alertsWidgetServer) {
            servers.alertsWidgetServer.refresh();
        }
        return { success: true };
    });

    ipcMain.handle('reset-widget-config', async (event, widgetName) => {
        const config = bot.getWidgetConfig(widgetName) || {};
        const userThemesDir = path.join(app.getPath('userData'), 'themes');

        if (config.currentTheme) {
            const themePath = path.join(userThemesDir, config.currentTheme);
            try {
                if (fs.existsSync(themePath)) {
                    await fs.promises.unlink(themePath);
                    log.info(`[RESET] Deleted stale theme file: ${themePath}`);
                }
            } catch (e) {
                log.error(`[RESET] Error deleting theme file: ${e.message}`);
            }
        }

        delete config.customCSS;
        delete config.currentTheme;
        bot.saveWidgetConfig(widgetName, config);

        const servers = getServers();
        const configToSend = { ...config, customCSS: '' };
        if (widgetName === 'chat' && servers.chatServer) servers.chatServer.broadcastConfig(configToSend);
        else if (widgetName === 'spotify' && servers.spotifyServer) servers.spotifyServer.broadcastConfig(configToSend);
        else if (widgetName === 'subgoals' && servers.subgoalsServer) servers.subgoalsServer.broadcastConfig(configToSend);
        else if (widgetName === 'roulette' && servers.rouletteServer) servers.rouletteServer.broadcastConfig(configToSend);

        return { success: true };
    });

    ipcMain.handle('get-widget-url', async (event, widgetName = 'chat') => {
        const localIp = getLocalIp();
        const servers = getServers();
        if (widgetName === 'spotify' && servers.spotifyServer) return servers.spotifyServer.getUrl(localIp);
        if (widgetName === 'subgoals' && servers.subgoalsServer) return servers.subgoalsServer.getUrl(localIp);
        if (widgetName === 'roulette' && servers.rouletteServer) return servers.rouletteServer.getUrl(localIp);
        return servers.chatServer ? servers.chatServer.getUrl(localIp, widgetName) : '';
    });

    ipcMain.handle('get-widget-urls', async () => {
        const localIp = getLocalIp();
        const servers = getServers();
        return {
            chat: servers.chatServer ? servers.chatServer.getUrl(localIp, 'chat') : '',
            spotify: servers.spotifyServer ? servers.spotifyServer.getUrl(localIp) : '',
            emoteWall: servers.chatServer ? servers.chatServer.getUrl(localIp, 'emote-wall') : '',
            subgoals: servers.subgoalsServer ? servers.subgoalsServer.getUrl(localIp) : '',
            subgoalsList: servers.subgoalsServer ? servers.subgoalsServer.getUrl(localIp, 'subgoals-list') : '',
            dailySubs: servers.subgoalsServer ? servers.subgoalsServer.getUrl(localIp, 'daily-subs') : '',
            lastSub: servers.subgoalsServer ? servers.subgoalsServer.getUrl(localIp, 'last-sub') : '',
            lastFollow: servers.subgoalsServer ? servers.subgoalsServer.getUrl(localIp, 'last-follow') : '',
            lastDonation: servers.subgoalsServer ? servers.subgoalsServer.getUrl(localIp, 'last-donation') : '',
            roulette: servers.rouletteServer ? servers.rouletteServer.getUrl(localIp) : ''
        };
    });

    ipcMain.handle('get-badge-prefs', () => {
        const config = bot.getWidgetConfig('chat') || {};
        return config.badgePrefs || {};
    });

    ipcMain.handle('save-badge-prefs', (event, prefs) => {
        if (!prefs || typeof prefs !== 'object') throw new Error('Invalid arguments');
        bot.saveWidgetConfig('chat', { badgePrefs: prefs });
        const servers = getServers();
        if (servers.chatServer) servers.chatServer.broadcastConfig({ badgePrefs: prefs });
        return { success: true };
    });

    ipcMain.handle('get-channel-rewards', async () => await bot.getCustomRewards());
    ipcMain.handle('get-mock-rewards', () => bot.mockRewards);
    ipcMain.handle('create-channel-reward', async (event, data) => await bot.createCustomReward(data));
    ipcMain.handle('update-channel-reward', async (event, id, data) => await bot.updateCustomReward(id, data));
    ipcMain.handle('delete-channel-reward', async (event, id) => await bot.deleteCustomReward(id));

    ipcMain.handle('get-reward-sounds', () => {
        const config = bot.getConfig();
        return config.rewardSounds || {};
    });

    ipcMain.handle('get-reward-functions', () => {
        const config = bot.getConfig();
        return config.rewardFunctions || {};
    });

    ipcMain.handle('save-reward-functions', (event, functionsMap) => {
        if (!functionsMap || typeof functionsMap !== 'object') throw new Error('Invalid arguments');
        bot.updateConfig({ rewardFunctions: functionsMap });
        return { success: true };
    });

    ipcMain.handle('get-reward-folders', () => {
        const config = bot.getConfig();
        return config.rewardFolders || [];
    });

    ipcMain.handle('save-reward-folders', (event, folders) => {
        if (!Array.isArray(folders)) throw new Error('Invalid arguments: folders must be an array');
        bot.updateConfig({ rewardFolders: folders });
        return { success: true };
    });

    ipcMain.handle('get-points-global-volume', () => {
        const config = bot.getConfig();
        return config.pointsGlobalVolume !== undefined ? config.pointsGlobalVolume : 0.5;
    });

    ipcMain.handle('save-points-global-volume', (event, volume) => {
        bot.updateConfig({ pointsGlobalVolume: volume });
        return { success: true };
    });

    ipcMain.handle('get-reward-images', () => {
        const config = bot.getConfig();
        return config.rewardImages || {};
    });

    ipcMain.handle('save-reward-sounds', (event, soundsMap) => {
        if (!soundsMap || typeof soundsMap !== 'object') throw new Error('Invalid arguments');
        bot.updateConfig({ rewardSounds: soundsMap });
        return { success: true };
    });

    ipcMain.handle('save-reward-images', (event, imagesMap) => {
        if (!imagesMap || typeof imagesMap !== 'object') throw new Error('Invalid arguments');
        bot.updateConfig({ rewardImages: imagesMap });
        return { success: true };
    });

    ipcMain.handle('trigger-mock-redemption', (event, rewardId) => {
        if (bot) {
            bot.handleRedemption(rewardId, {
                'display-name': 'DevTest',
                username: 'dev_test'
            }, 'Ceci est un test manuel');
        }
        return { success: true };
    });

    ipcMain.handle('twitch-search-categories', async (event, query) => await bot.searchCategories(query));
    ipcMain.handle('twitch-get-steamgriddb-image', async (event, gameName) => await bot.getSteamGridDbImage(gameName));
    ipcMain.handle('twitch-get-schedule', async () => await bot.getSchedule());
    ipcMain.handle('twitch-create-schedule-segment', async (event, segment) => await bot.createScheduleSegment(segment));
    ipcMain.handle('twitch-update-schedule-segment', async (event, id, segment) => await bot.updateScheduleSegment(id, segment));
    ipcMain.handle('twitch-delete-schedule-segment', async (event, id) => await bot.deleteScheduleSegment(id));

    ipcMain.handle('start-spotify-auth', async () => {
        const servers = getServers();
        if (!servers.spotifyServer) {
            log.error('[IPC] start-spotify-auth failed: No Spotify server found');
            return { success: false, error: 'Server not running' };
        }
        try {
            const url = servers.spotifyServer.getLoginUrl();
            log.info(`[IPC] Opening Spotify auth URL: ${url}`);
            if (!url || url.includes('undefined')) {
                log.error('[IPC] Invalid Spotify URL generated. Check Client ID.');
                return { success: false, error: 'Invalid URL' };
            }
            await shell.openExternal(url);
            return { url };
        } catch (e) {
            log.error('[IPC] Error opening Spotify URL:', e);
            throw e;
        }
    });

    ipcMain.handle('trigger-alert-test', (event, data = {}) => {
        const alertType = data.type || 'follow';
        const testPayload = {
            follow: { username: 'TestUser' },
            sub: { username: 'TestSubscriber' },
            resub: { username: 'TestResubber', months: 12 },
            subgift: { username: 'TestGifter', amount: 5 },
            raid: { username: 'TestRaider', viewers: 150 },
            cheer: { username: 'TestCheerer', amount: 500 },
            hypetrain: { username: 'Twitch', amount: 2 },
        };

        const alertData = { ...testPayload[alertType], ...data };
        bot.triggerAlert(alertType, alertData);
        return { success: true };
    });

    ipcMain.handle('simulate-sub', () => {
        bot.incrementSubCount();
        return { success: true };
    });

    ipcMain.handle('open-file-dialog', async (event, filters = []) => {
        const result = await dialog.showOpenDialog({ properties: ['openFile'], filters });
        if (result.canceled) return null;
        return result.filePaths[0];
    });

    ipcMain.handle('select-folder', async () => {
        const result = await dialog.showOpenDialog({ properties: ['openDirectory'] });
        if (result.canceled) return null;
        return result.filePaths[0];
    });

    ipcMain.handle('save-planning-base64', async (event, dataURL) => {
        const win = BrowserWindow.fromWebContents(event.sender);
        if (!win) return { success: false, error: 'Window not found' };

        try {
            const { canceled, filePath } = await dialog.showSaveDialog(win, {
                title: 'Sauvegarder le planning',
                defaultPath: 'planning.png',
                filters: [{ name: 'Images', extensions: ['png'] }]
            });

            if (canceled || !filePath) return { success: false, cancelled: true };

            const base64Data = dataURL.replace(/^data:image\/png;base64,/, "");
            await fs.promises.writeFile(filePath, base64Data, 'base64');
            return { success: true, filePath };
        } catch (e) {
            log.error('Error saving planning image:', e);
            return { success: false, error: e.message };
        }
    });
}

module.exports = { registerHandlers };
