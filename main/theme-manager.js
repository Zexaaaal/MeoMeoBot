const { ipcMain, app, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('./logger').tagged('Themes');

const DEFAULT_THEME_NAMES = {
    'chat_christmas.css': 'Noël',
    'chat_halloween.css': 'Halloween',
    'chat_horror.css': 'Horreur',
    'chat_retro_terminal.css': 'Matrix',
    'chat_bubble_pop.css': 'meoMessage',
    'chat_neon_cyberpunk.css': 'Cyberpunk',
    'chat_soso_base.css': 'Soso Défaut',
    'spotify_soso_base.css': 'Défaut',
    'sub_candycane.css': 'Candy Cane',
    'subgoals_candycane.css': 'Candy Cane',
    'subgoals_halloween.css': 'Halloween',
    'subgoals_horror.css': 'Horreur',
    'subgoals-list_halloween.css': 'Halloween',
    'subgoals-list_horror.css': 'Horreur',
    'goals_christmas.css': 'Noël',
    'goals_halloween.css': 'Halloween',
    'goals_horror.css': 'Horreur',
    'roulette_base.css': 'Roue',
    'roulette_list.css': 'Liste',
    'roulette_halloween.css': 'Halloween',
    'roulette_horror.css': 'Horreur',
    'alerts_christmas.css': 'Noël',
    'alerts_halloween.css': 'Halloween',
    'alerts_horror.css': 'Horreur',
    'emote-wall_halloween.css': 'Halloween',
    'emote-wall_horror.css': 'Horreur'
};

function getUserThemesDir() {
    if (!app || !app.getPath) return path.join(__dirname, '../widgets/themes');
    return path.join(app.getPath('userData'), 'themes');
}

function getBuiltInThemesDir() {
    return app && app.isPackaged
        ? path.join(app.getAppPath(), 'widgets/themes')
        : path.join(__dirname, '../widgets/themes');
}

const CASCADE_THEMES = {
    'chat_christmas.css': {
        'chat': 'chat_christmas.css',
        'subgoals': 'subgoals_candycane.css',
        'alerts': 'alerts_christmas.css',
        'goals': 'goals_christmas.css'
    },
    'chat_halloween.css': {
        'chat': 'chat_halloween.css',
        'subgoals': 'subgoals_halloween.css',
        'subgoals-list': 'subgoals-list_halloween.css',
        'goals': 'goals_halloween.css',
        'roulette': 'roulette_halloween.css',
        'alerts': 'alerts_halloween.css',
        'emote-wall': 'emote-wall_halloween.css'
    },
    'chat_horror.css': {
        'chat': 'chat_horror.css',
        'subgoals': 'subgoals_horror.css',
        'subgoals-list': 'subgoals-list_horror.css',
        'goals': 'goals_horror.css',
        'roulette': 'roulette_horror.css',
        'alerts': 'alerts_horror.css',
        'emote-wall': 'emote-wall_horror.css'
    }
};

function getCascadeKey(theme) {
    if (!theme || typeof theme !== 'string') return null;
    const lower = theme.trim().toLowerCase();
    if (lower.includes('halloween')) {
        return 'chat_halloween.css';
    }
    if (lower.includes('horror') || lower.includes('horreur')) {
        return 'chat_horror.css';
    }
    if (lower.includes('christmas') || lower.includes('noël') || lower.includes('noel') || lower.includes('candycane')) {
        return 'chat_christmas.css';
    }
    return null;
}

async function getThemeFileContent(filename) {
    const userThemesDir = getUserThemesDir();
    const builtInThemesDir = getBuiltInThemesDir();
    const userPath = path.join(userThemesDir, filename);
    const builtInPath = path.join(builtInThemesDir, filename);
    if (fs.existsSync(userPath)) {
        return await fs.promises.readFile(userPath, 'utf8');
    }
    if (fs.existsSync(builtInPath)) {
        return await fs.promises.readFile(builtInPath, 'utf8');
    }
    return '';
}

function refreshAllWidgets(servers, obsControl) {
    if (servers) {
        Object.values(servers).forEach(server => {
            if (server && typeof server.refresh === 'function') {
                server.refresh();
            } else if (server && typeof server.broadcast === 'function') {
                server.broadcast({ type: 'reload' });
            }
        });
    }
    if (obsControl && typeof obsControl.isConnected === 'function' && obsControl.isConnected()) {
        obsControl.refreshWidgetSources().catch(err => {
            log.warn('OBS_REFRESH_ERR', err);
        });
    }
}

async function applySeasonalTheme(theme, bot, servers, obsControl, originWidget = null, originConfig = null) {
    const key = getCascadeKey(theme);
    const ALL_SEASONAL_WIDGETS = ['chat', 'subgoals', 'subgoals-list', 'goals', 'roulette', 'alerts', 'emote-wall'];

    if (!theme || theme === 'default' || theme === 'defaut' || theme === 'none') {
        for (const targetWidget of ALL_SEASONAL_WIDGETS) {
            const targetConfig = (bot && bot.getWidgetConfig ? bot.getWidgetConfig(targetWidget) : {}) || {};
            targetConfig.currentTheme = '';
            targetConfig.customCSS = '';
            if (targetWidget === 'goals' && Array.isArray(targetConfig.goals)) {
                targetConfig.goals = targetConfig.goals.map(g => ({
                    ...g,
                    customCSS: '',
                    currentTheme: ''
                }));
            }
            if (bot && bot.saveWidgetConfig) {
                bot.saveWidgetConfig(targetWidget, targetConfig);
            }
            if (servers) {
                if (targetWidget === 'subgoals' && servers.subgoalsServer) {
                    servers.subgoalsServer.broadcastConfig(targetConfig, 'subgoals');
                } else if (targetWidget === 'subgoals-list' && servers.subgoalsServer) {
                    servers.subgoalsServer.broadcastConfig(targetConfig, 'subgoals-list');
                } else if (targetWidget === 'roulette' && servers.rouletteServer) {
                    servers.rouletteServer.broadcastConfig(targetConfig);
                } else if (servers.chatServer && targetWidget === 'emote-wall') {
                    servers.chatServer.broadcastConfig(targetConfig, targetWidget);
                } else if (servers.chatServer && targetWidget === 'chat') {
                    servers.chatServer.broadcastConfig(targetConfig, 'chat');
                } else if (targetWidget === 'alerts' && servers.alertsWidgetServer) {
                    if (typeof servers.alertsWidgetServer.broadcastConfig === 'function') {
                        servers.alertsWidgetServer.broadcastConfig(targetConfig);
                    } else if (typeof servers.alertsWidgetServer.broadcast === 'function') {
                        servers.alertsWidgetServer.broadcast({ type: 'config-update', widget: 'alerts', config: targetConfig });
                    }
                } else if (targetWidget === 'goals' && servers.goalsServer) {
                    servers.goalsServer.broadcastConfig(targetConfig);
                    servers.goalsServer.broadcastCurrentCounts();
                }
            }
            try {
                const electron = require('electron');
                if (electron && electron.BrowserWindow && typeof electron.BrowserWindow.getAllWindows === 'function') {
                    electron.BrowserWindow.getAllWindows().forEach(win => {
                        if (!win.isDestroyed()) {
                            win.webContents.send('widget-config-updated', { widgetName: targetWidget, config: targetConfig });
                        }
                    });
                }
            } catch (e) { }
        }
        return { success: true, theme: 'default' };
    }

    if (!key || !CASCADE_THEMES[key]) {
        if (servers && servers.chatServer && typeof servers.chatServer.refresh === 'function') {
            servers.chatServer.refresh();
        }
        return { success: true, theme: theme };
    }

    const targets = CASCADE_THEMES[key];
        for (const targetWidget of ALL_SEASONAL_WIDGETS) {
            const targetThemeFile = targets[targetWidget];
            let targetConfig = (bot && bot.getWidgetConfig ? bot.getWidgetConfig(targetWidget) : {}) || {};

            if (originWidget && originWidget === targetWidget && originConfig) {
                targetConfig = { ...targetConfig, ...originConfig };
                targetConfig.currentTheme = targetThemeFile || targetConfig.currentTheme || '';
                if (targetWidget === 'goals' && Array.isArray(targetConfig.goals)) {
                    targetConfig.goals = targetConfig.goals.map(g => ({
                        ...g,
                        customCSS: targetConfig.customCSS || '',
                        currentTheme: targetConfig.currentTheme
                    }));
                }
            } else if (targetThemeFile) {
                const content = await getThemeFileContent(targetThemeFile);
                targetConfig.currentTheme = targetThemeFile;
                targetConfig.customCSS = content || '';
                if (targetWidget === 'goals' && Array.isArray(targetConfig.goals)) {
                    targetConfig.goals = targetConfig.goals.map(g => ({
                        ...g,
                        customCSS: content || '',
                        currentTheme: targetThemeFile
                    }));
                }
            } else {
                targetConfig.currentTheme = '';
                targetConfig.customCSS = '';
                if (targetWidget === 'goals' && Array.isArray(targetConfig.goals)) {
                    targetConfig.goals = targetConfig.goals.map(g => ({
                        ...g,
                        customCSS: '',
                        currentTheme: ''
                    }));
                }
            }

            if (bot && bot.saveWidgetConfig) {
                bot.saveWidgetConfig(targetWidget, targetConfig);
            }

            if (servers) {
                if (targetWidget === 'subgoals' && servers.subgoalsServer) {
                    servers.subgoalsServer.broadcastConfig(targetConfig, 'subgoals');
                } else if (targetWidget === 'subgoals-list' && servers.subgoalsServer) {
                    servers.subgoalsServer.broadcastConfig(targetConfig, 'subgoals-list');
                } else if (targetWidget === 'roulette' && servers.rouletteServer) {
                    servers.rouletteServer.broadcastConfig(targetConfig);
                } else if (servers.chatServer && targetWidget === 'emote-wall') {
                    servers.chatServer.broadcastConfig(targetConfig, targetWidget);
                } else if (servers.chatServer && targetWidget === 'chat') {
                    servers.chatServer.broadcastConfig(targetConfig, 'chat');
                } else if (targetWidget === 'alerts' && servers.alertsWidgetServer) {
                    if (typeof servers.alertsWidgetServer.broadcastConfig === 'function') {
                        servers.alertsWidgetServer.broadcastConfig(targetConfig);
                    } else if (typeof servers.alertsWidgetServer.broadcast === 'function') {
                        servers.alertsWidgetServer.broadcast({ type: 'config-update', widget: 'alerts', config: targetConfig });
                    }
                } else if (targetWidget === 'goals' && servers.goalsServer) {
                    servers.goalsServer.broadcastConfig(targetConfig);
                    servers.goalsServer.broadcastCurrentCounts();
                }
            }

            try {
                const electron = require('electron');
                if (electron && electron.BrowserWindow && typeof electron.BrowserWindow.getAllWindows === 'function') {
                    electron.BrowserWindow.getAllWindows().forEach(win => {
                        if (!win.isDestroyed()) {
                            win.webContents.send('widget-config-updated', { widgetName: targetWidget, config: targetConfig });
                        }
                    });
                }
            } catch (e) { }
        }

    return { success: true, theme: key ? key : 'default' };
}

async function cascadeTheme(chatTheme, bot, servers, obsControl, originWidget = null, originConfig = null) {
    return await applySeasonalTheme(chatTheme, bot, servers, obsControl, originWidget, originConfig);
}

async function reloadThemeContent(bot) {
    const widgets = ['chat', 'spotify', 'subgoals', 'subgoals-list', 'goals', 'emote-wall', 'roulette', 'alerts'];
    const userThemesDir = getUserThemesDir();
    const builtInThemesDir = getBuiltInThemesDir();

    for (const widget of widgets) {
        const config = bot.getWidgetConfig(widget);
        if (config && config.currentTheme) {
            const filename = config.currentTheme;
            let themeContent = '';

            const userThemePath = path.join(userThemesDir, filename);
            if (fs.existsSync(userThemePath)) {
                themeContent = await fs.promises.readFile(userThemePath, 'utf8');
            } else {
                const builtInThemePath = path.join(builtInThemesDir, filename);
                if (fs.existsSync(builtInThemePath)) {
                    themeContent = await fs.promises.readFile(builtInThemePath, 'utf8');
                }
            }

            if (themeContent) {
                config.customCSS = themeContent;
                if (widget === 'goals' && Array.isArray(config.goals)) {
                    config.goals = config.goals.map(g => ({
                        ...g,
                        customCSS: themeContent,
                        currentTheme: config.currentTheme
                    }));
                }
                bot.saveWidgetConfig(widget, config);
            }
        }
    }

    const chatConfig = bot.getWidgetConfig('chat');
    if (chatConfig && chatConfig.currentTheme) {
        await cascadeTheme(chatConfig.currentTheme, bot);
    }
}

function registerHandlers(bot) {
    ipcMain.handle('get-themes', async () => {
        const userThemesDir = getUserThemesDir();
        const builtInThemesDir = getBuiltInThemesDir();
        const configPath = path.join(userThemesDir, 'themes.json');
        const legacyConfigPath = path.join(app.getPath('userData'), 'themeConfig.json');

        let userConfig = {};
        try {
            if (fs.existsSync(configPath)) {
                userConfig = JSON.parse(await fs.promises.readFile(configPath, 'utf8'));
            } else if (fs.existsSync(legacyConfigPath)) {
                userConfig = JSON.parse(await fs.promises.readFile(legacyConfigPath, 'utf8'));
            }
        } catch (e) { }

        const allThemes = new Set();
        const isBuiltin = new Set();

        if (fs.existsSync(userThemesDir)) {
            const userFiles = await fs.promises.readdir(userThemesDir);
            userFiles.filter(f => f.endsWith('.css')).forEach(f => allThemes.add(f));
        }

        if (fs.existsSync(builtInThemesDir)) {
            const builtInFiles = await fs.promises.readdir(builtInThemesDir);
            builtInFiles.filter(f => f.endsWith('.css')).forEach(f => {
                allThemes.add(f);
                isBuiltin.add(f);
            });
        }

        const prefix = 'theme_';
        return {
            themes: Array.from(allThemes).map(f => {
                const confVal = userConfig[f];
                const customName = typeof confVal === 'object' ? confVal?.name : confVal;
                const displayName = customName || DEFAULT_THEME_NAMES[f] || f.replace(prefix, '').replace('.css', '').replace(/_/g, ' ');
                return {
                    id: f,
                    name: displayName,
                    builtin: isBuiltin.has(f)
                };
            }).sort((a, b) => {
                if (a.builtin && !b.builtin) return -1;
                if (!a.builtin && b.builtin) return 1;
                return a.name.localeCompare(b.name);
            })
        };
    });

    ipcMain.handle('get-theme-content', async (event, filename) => {
        const userThemesDir = getUserThemesDir();
        const builtInThemesDir = getBuiltInThemesDir();
        const userThemePath = path.join(userThemesDir, filename);
        const builtInThemePath = path.join(builtInThemesDir, filename);

        if (fs.existsSync(userThemePath)) {
            if (!path.resolve(userThemePath).startsWith(path.resolve(userThemesDir))) {
                throw new Error('Invalid theme path');
            }
            return await fs.promises.readFile(userThemePath, 'utf8');
        }

        if (fs.existsSync(builtInThemePath)) {
            if (!path.resolve(builtInThemePath).startsWith(path.resolve(builtInThemesDir))) {
                throw new Error('Invalid theme path');
            }
            return await fs.promises.readFile(builtInThemePath, 'utf8');
        }

        throw new Error('Theme not found');
    });

    ipcMain.handle('get-theme-config', async () => {
        const themesDir = getUserThemesDir();
        const configPath = path.join(themesDir, 'themes.json');
        let userConfig = {};

        try {
            if (fs.existsSync(configPath)) {
                const content = await fs.promises.readFile(configPath, 'utf8');
                userConfig = JSON.parse(content);
            }
        } catch (e) { }

        return JSON.stringify({ ...DEFAULT_THEME_NAMES, ...userConfig });
    });

    ipcMain.handle('save-theme-config', async (event, content) => {
        const themesDir = getUserThemesDir();
        if (!fs.existsSync(themesDir)) fs.mkdirSync(themesDir, { recursive: true });
        const configPath = path.join(themesDir, 'themes.json');
        await fs.promises.writeFile(configPath, content, 'utf8');
        return { success: true };
    });

    ipcMain.handle('create-theme', async (event, widgetType, themeName, content) => {
        if (!widgetType || !themeName) return { success: false, message: 'Missing arguments' };

        const safeName = themeName.replace(/[^a-z0-9_-]/gi, '_');
        const filename = `${widgetType}_${safeName}.css`;
        const themesDir = getUserThemesDir();
        const destPath = path.join(themesDir, filename);

        if (!fs.existsSync(themesDir)) fs.mkdirSync(themesDir, { recursive: true });

        try {
            await fs.promises.writeFile(destPath, content, 'utf8');

            const configPath = path.join(themesDir, 'themes.json');
            let config = {};
            try {
                if (fs.existsSync(configPath)) {
                    config = JSON.parse(await fs.promises.readFile(configPath, 'utf8'));
                }
            } catch (e) { }

            config[filename] = themeName;
            await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');

            return { success: true, filename };
        } catch (e) {
            log.error('THEME_CREATE_ERR', e);
            throw e;
        }
    });

    ipcMain.handle('delete-theme', async (event, widgetType, filename) => {
        const userThemesDir = getUserThemesDir();
        const builtInThemesDir = getBuiltInThemesDir();
        const userThemePath = path.join(userThemesDir, filename);
        const builtInThemePath = path.join(builtInThemesDir, filename);
        const configPath = path.join(userThemesDir, 'themes.json');

        try {
            if (fs.existsSync(userThemePath)) {
                await fs.promises.unlink(userThemePath);

                let config = {};
                try {
                    if (fs.existsSync(configPath)) {
                        config = JSON.parse(await fs.promises.readFile(configPath, 'utf8'));
                    }
                } catch (e) { }

                if (config[filename]) {
                    delete config[filename];
                    await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2), 'utf8');
                }

                return { success: true };
            } else if (fs.existsSync(builtInThemePath)) {
                return { success: false, message: 'Impossible de supprimer un thème natif.' };
            } else {
                return { success: false, message: 'Thème introuvable.' };
            }
        } catch (e) {
            log.error('THEME_DEL_ERR', e);
            return { success: false, message: e.message };
        }
    });

    ipcMain.handle('import-theme', async (event, widgetType) => {
        const { filePaths } = await dialog.showOpenDialog({
            title: 'Importer un thème CSS',
            filters: [{ name: 'Fichiers CSS', extensions: ['css'] }],
            properties: ['openFile']
        });

        if (!filePaths || filePaths.length === 0) return { success: false, message: 'Annulé' };

        const srcPath = filePaths[0];
        let filename = path.basename(srcPath);

        if (widgetType && !filename.startsWith(widgetType + '_')) {
            filename = `${widgetType}_${filename}`;
        }

        const themesDir = getUserThemesDir();
        const destPath = path.join(themesDir, filename);

        if (!fs.existsSync(themesDir)) fs.mkdirSync(themesDir, { recursive: true });

        try {
            await fs.promises.copyFile(srcPath, destPath);
            return { success: true, filename, message: 'Thème importé !' };
        } catch (e) {
            log.error('THEME_IMPORT_ERR', e);
            throw e;
        }
    });
}

module.exports = {
    reloadThemeContent,
    registerHandlers,
    getUserThemesDir,
    getBuiltInThemesDir,
    cascadeTheme,
    applySeasonalTheme,
    refreshAllWidgets,
    getCascadeKey,
    CASCADE_THEMES,
    getThemeFileContent
};
