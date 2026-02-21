export const API = {
    app: {
        isDev: () => window.api.invoke('is-dev')
    },

    getConfig: () => window.api.invoke('get-config'),
    saveConfig: (config) => window.api.invoke('save-config', config),
    openFileDialog: (filters) => window.api.invoke('open-file-dialog', filters),


    connectBot: () => window.api.invoke('connect-bot'),
    disconnectBot: () => window.api.invoke('disconnect-bot'),
    getBotStatus: () => window.api.invoke('get-bot-status'),


    moderation: {
        getBannedWords: () => window.api.invoke('get-banned-words'),
        addBannedWord: (word) => window.api.invoke('add-banned-word', word),
        removeBannedWord: (word) => window.api.invoke('remove-banned-word', word),
        clearBannedWords: () => window.api.invoke('clear-banned-words')
    },

    alerts: {
        triggerTest: (data) => window.api.invoke('trigger-alert-test', data)
    },


    giveaway: {
        getParticipants: () => window.api.invoke('get-participants'),
        isActive: () => window.api.invoke('is-giveaway-active'),
        start: () => window.api.invoke('start-giveaway'),
        stop: () => window.api.invoke('stop-giveaway'),
        drawWinner: () => window.api.invoke('draw-winner'),
        clearParticipants: () => window.api.invoke('clear-participants')
    },


    commands: {
        getAll: () => window.api.invoke('get-commands'),
        add: (command, response) => window.api.invoke('add-command', command, response),
        remove: (command) => window.api.invoke('remove-command', command)
    },


    widgets: {
        getConfig: (widgetName) => window.api.invoke('get-widget-config', widgetName),
        saveConfig: (widgetName, config) => window.api.invoke('save-widget-config', widgetName, config),
        resetConfig: (widgetName) => window.api.invoke('reset-widget-config', widgetName),
        getUrls: () => window.api.invoke('get-widget-urls'),
        openCssEditor: (widgetName) => window.api.invoke('open-css-editor', widgetName),
        resizeCssEditor: (delta) => window.api.invoke('resize-css-editor', delta),
        openSubgoalsConfig: () => window.api.invoke('open-subgoals-config'),
        openRouletteConfig: () => window.api.invoke('open-roulette-config'),
        triggerRouletteSpin: () => window.api.invoke('trigger-roulette-spin'),


        getThemes: (widget) => window.api.invoke('get-themes', widget),
        getThemeConfig: () => window.api.invoke('get-theme-config'),
        saveThemeConfig: (config) => window.api.invoke('save-theme-config', config),
        createTheme: (widget, name, css) => window.api.invoke('create-theme', widget, name, css),
        importTheme: (widget) => window.api.invoke('import-theme', widget),
        deleteTheme: (widget, theme) => window.api.invoke('delete-theme', widget, theme),
        getThemeContent: (theme) => window.api.invoke('get-theme-content', theme)
    },

    points: {
        getRewards: () => window.api.invoke('get-channel-rewards'),
        createReward: (data) => window.api.invoke('create-channel-reward', data),
        updateReward: (id, data) => window.api.invoke('update-channel-reward', id, data),
        deleteReward: (id) => window.api.invoke('delete-channel-reward', id),
        triggerMockRedemption: (id) => window.api.invoke('trigger-mock-redemption', id)
    },

    cast: {
        selectFolder: () => window.api.invoke('select-folder'),
        getVideos: (folder) => window.api.invoke('get-videos', folder),
        discoverDevices: () => window.api.invoke('discover-devices'),
        playOnDevice: (data) => window.api.invoke('play-on-device', data),
        stopCasting: () => window.api.invoke('stop-casting')
    },


    updates: {
        startDownload: () => window.api.send('start-download'),
        quitAndInstall: () => window.api.send('quit-and-install')
    },


    startSpotifyAuth: () => window.api.invoke('start-spotify-auth'),


    getBadgePrefs: () => window.api.invoke('get-badge-prefs'),
    saveBadgePrefs: (prefs) => window.api.invoke('save-badge-prefs', prefs),


    windowControl: (action) => window.api.send('window-control', action),


    createWidgetHelper: (widgetName) => {
        return {

            loadConfig: () => window.api.invoke('get-widget-config', widgetName),


            saveConfig: (config) => window.api.invoke('save-widget-config', widgetName, config),


            getUrl: () => window.api.invoke('get-widget-url', widgetName),



            onRefresh: async (callback) => {

                try {
                    const config = await window.api.invoke('get-widget-config', widgetName);



                    const appConfig = await window.api.invoke('get-config');
                    callback(config, appConfig);
                } catch (e) { console.error(e); }


                window.api.on('refresh-widget-urls', async () => {
                    try {
                        const config = await window.api.invoke('get-widget-config', widgetName);
                        const appConfig = await window.api.invoke('get-config');
                        callback(config, appConfig);
                    } catch (e) { console.error(e); }
                });
            }
        };
    }
};
