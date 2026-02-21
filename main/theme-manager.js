const { ipcMain, app, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const log = require('./logger').tagged('Themes');

const DEFAULT_THEME_NAMES = {
    'chat_christmas.css': 'Noël',
    'chat_retro_terminal.css': 'Matrix',
    'chat_bubble_pop.css': 'meoMessage',
    'chat_neon_cyberpunk.css': 'Cyberpunk',
    'chat_soso_base.css': 'Soso Défaut',
    'spotify_soso_base.css': 'Défaut',
    'sub_candycane.css': 'Candy Cane'
};

function getUserThemesDir() {
    return path.join(app.getPath('userData'), 'themes');
}


function getBuiltInThemesDir() {
    return app.isPackaged
        ? path.join(app.getAppPath(), 'widgets/themes')
        : path.join(__dirname, '../widgets/themes');
}

async function reloadThemeContent(bot) {
    const widgets = ['chat', 'spotify', 'subgoals', 'emote-wall', 'roulette', 'alerts'];
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
                bot.saveWidgetConfig(widget, config);
            }
        }
    }
}

function registerHandlers(bot) {
    ipcMain.handle('get-themes', async () => {
        const userThemesDir = getUserThemesDir();
        const builtInThemesDir = getBuiltInThemesDir();
        const themeConfigPath = path.join(app.getPath('userData'), 'themeConfig.json');

        let themeConfig = {};
        if (fs.existsSync(themeConfigPath)) {
            themeConfig = JSON.parse(await fs.promises.readFile(themeConfigPath, 'utf8'));
        }

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
            themes: Array.from(allThemes).map(f => ({
                id: f,
                name: (themeConfig[f]?.name || f.replace(prefix, '').replace('.css', '')).replace(/_/g, ' '),
                builtin: isBuiltin.has(f)
            })).sort((a, b) => {
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
    getBuiltInThemesDir
};
