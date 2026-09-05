require('dotenv').config();
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fs = require('fs');

// --- SUPPORT DU MODE PORTABLE ---
let isPortable = false;
let portableDataPath = null;

function copyFolderRecursiveSync(source, target) {
    if (!fs.existsSync(target)) {
        fs.mkdirSync(target, { recursive: true });
    }
    const files = fs.readdirSync(source);
    for (const file of files) {
        const curSource = path.join(source, file);
        const curTarget = path.join(target, file);
        if (fs.lstatSync(curSource).isDirectory()) {
            copyFolderRecursiveSync(curSource, curTarget);
        } else {
            fs.copyFileSync(curSource, curTarget);
        }
    }
}

if (process.env.PORTABLE_EXECUTABLE_DIR) {
    isPortable = true;
    portableDataPath = path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'portable_data');
} else if (app.isPackaged) {
    const exeDir = path.dirname(process.execPath);
    const hasPortableArg = process.argv.includes('--portable') || process.argv.includes('-p');
    const hasPortableFile = fs.existsSync(path.join(exeDir, 'portable')) || fs.existsSync(path.join(exeDir, 'portable.txt'));
    const hasPortableFolder = fs.existsSync(path.join(exeDir, 'portable_data'));
    
    if (hasPortableArg || hasPortableFile || hasPortableFolder) {
        isPortable = true;
        portableDataPath = path.join(exeDir, 'portable_data');
    }
} else {
    const hasPortableArg = process.argv.includes('--portable') || process.argv.includes('-p');
    if (hasPortableArg) {
        isPortable = true;
        portableDataPath = path.join(__dirname, 'portable_data');
    }
}

if (isPortable && portableDataPath) {
    const defaultUserDataPath = app.getPath('userData');
    
    if (!fs.existsSync(portableDataPath)) {
        fs.mkdirSync(portableDataPath, { recursive: true });
    }
    
    const portableConfigPath = path.join(portableDataPath, 'config.json');
    if (!fs.existsSync(portableConfigPath)) {
        const defaultConfigPath = path.join(defaultUserDataPath, 'config.json');
        if (fs.existsSync(defaultConfigPath)) {
            try {
                const configContent = fs.readFileSync(defaultConfigPath, 'utf8');
                const configData = JSON.parse(configContent);
                
                const copiedAssetsDir = path.join(portableDataPath, 'copied_assets');
                const crypto = require('crypto');
                
                const MEDIA_EXTENSIONS = new Set([
                    '.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac',
                    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp',
                    '.webm', '.mp4', '.avi', '.mov', '.mkv'
                ]);

                function getMediaFilePath(val) {
                    if (typeof val !== 'string' || !val) return null;
                    let cleanPath = val;
                    if (cleanPath.startsWith('file://')) {
                        cleanPath = cleanPath.substring(7);
                    }
                    if (cleanPath.startsWith('/') && process.platform === 'win32') {
                        if (/^\/[a-zA-Z]:/.test(cleanPath)) {
                            cleanPath = cleanPath.substring(1);
                        }
                    }
                    try {
                        cleanPath = decodeURIComponent(cleanPath);
                    } catch (e) {}
                    
                    const absolutePath = path.resolve(cleanPath);
                    const ext = path.extname(absolutePath).toLowerCase();
                    
                    if (MEDIA_EXTENSIONS.has(ext)) {
                        if (fs.existsSync(absolutePath)) {
                            try {
                                if (fs.statSync(absolutePath).isFile()) {
                                    return absolutePath;
                                }
                            } catch (e) {}
                        }
                    }
                    return null;
                }

                function migrateAssets(obj) {
                    if (typeof obj !== 'object' || obj === null) return;
                    for (const key of Object.keys(obj)) {
                        const val = obj[key];
                        const resolvedPath = getMediaFilePath(val);
                        if (resolvedPath) {
                            if (!fs.existsSync(copiedAssetsDir)) {
                                fs.mkdirSync(copiedAssetsDir, { recursive: true });
                            }
                            const fileHash = crypto.createHash('md5').update(resolvedPath).digest('hex').substring(0, 8);
                            const filename = `${fileHash}_${path.basename(resolvedPath)}`;
                            const targetPath = path.join(copiedAssetsDir, filename);
                            try {
                                fs.copyFileSync(resolvedPath, targetPath);
                                obj[key] = `file://{userData}/copied_assets/${filename}`;
                                console.log(`[Portable] Copied asset: ${resolvedPath} -> ${targetPath}`);
                            } catch (err) {
                                console.error(`[Portable] Failed to copy asset ${resolvedPath}:`, err);
                            }
                        } else if (typeof obj[key] === 'object') {
                            migrateAssets(obj[key]);
                        }
                    }
                }
                
                migrateAssets(configData);
                
                fs.writeFileSync(portableConfigPath, JSON.stringify(configData, null, 4), 'utf8');
            } catch (err) {
                console.error('[Portable] Failed to migrate config:', err);
                try {
                    fs.copyFileSync(defaultConfigPath, portableConfigPath);
                } catch (e) {}
            }
        }
        
        const defaultThemeConfigPath = path.join(defaultUserDataPath, 'themeConfig.json');
        const portableThemeConfigPath = path.join(portableDataPath, 'themeConfig.json');
        if (fs.existsSync(defaultThemeConfigPath)) {
            try {
                fs.copyFileSync(defaultThemeConfigPath, portableThemeConfigPath);
            } catch (err) {
                console.error('[Portable] Failed to copy themeConfig:', err);
            }
        }

        const defaultThemesDir = path.join(defaultUserDataPath, 'themes');
        const portableThemesDir = path.join(portableDataPath, 'themes');
        if (fs.existsSync(defaultThemesDir)) {
            try {
                copyFolderRecursiveSync(defaultThemesDir, portableThemesDir);
            } catch (err) {
                console.error('[Portable] Failed to copy themes folder:', err);
            }
        }
    }
    
    if (fs.existsSync(portableConfigPath)) {
        try {
            const configText = fs.readFileSync(portableConfigPath, 'utf8');
            const updatedText = configText.replace(/file:\/\/[^"]+?\/copied_assets\/([^"]+)/g, `file://{userData}/copied_assets/$1`);
            if (updatedText !== configText) {
                fs.writeFileSync(portableConfigPath, updatedText, 'utf8');
                console.log('[Portable] Sanitized absolute paths to relative {userData} placeholder in config.json');
            }
        } catch (err) {
            console.error('[Portable] Failed to sanitize config paths:', err);
        }
    }
    
    app.setPath('userData', portableDataPath);
}
// --------------------------------

const fontList = require('font-list');
const TwitchBot = require('./bot.js');
const StreamlabsClient = require('./server/streamlabs');
const log = require('./main/logger').tagged('Main');

if (isPortable) {
    log.info(`[Portable] Mode portable actif. Données stockées dans : ${portableDataPath}`);
}
const KickBot = require('./main/KickBot');
const KickAPI = require('./main/KickAPI');
const YouTubeBot = require('./main/YouTubeBot');

const { createChatWidgetServer } = require('./server/chatWidgetServer');
const { createSpotifyWidgetServer } = require('./server/spotifyWidgetServer');
const { createSubgoalsWidgetServer } = require('./server/subgoalsWidgetServer');
const { createRouletteWidgetServer } = require('./server/rouletteWidgetServer');
const { createAlertsWidgetServer } = require('./server/alertsWidgetServer');
const { createGoalsWidgetServer } = require('./server/goalsWidgetServer');

const autoUpdaterModule = require('./main/auto-updater');
const mediaServerModule = require('./main/media-server');
const themeManager = require('./main/theme-manager');
const castManager = require('./main/cast-manager');
const ipcHandlers = require('./main/ipc-handlers');
const ObsControl = require('./main/obs-control');
const ReauthPrompter = require('./main/reauth');
const videoHandlers = require('./main/video-handlers');

const DEFAULT_WIDGET_PORT = 8087;
const DEFAULT_SPOTIFY_WIDGET_PORT = 8090;
const DEFAULT_SUBGOALS_WIDGET_PORT = 8091;
const DEFAULT_ROULETTE_WIDGET_PORT = 8092;
const DEFAULT_ALERTS_WIDGET_PORT = 8097;
const DEFAULT_GOALS_WIDGET_PORT = 8093;

// A second instance would bind six different ports and silently invalidate
// every browser source in OBS. Refuse to start one.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
    log.warn('MAIN_SECOND_INSTANCE');
    app.quit();
}

let mainWindow;

let bot;
let kickBot;
let kickApi;
let youtubeBot;
let streamlabsClient = null;
let kickCodeVerifier = null;

let obsControl;
let reauthPrompter;

let chatServer;
let spotifyServer;
let subgoalsServer;
let rouletteServer;
let alertsWidgetServer;
let goalsServer;

function getServers() {
    return { chatServer, spotifyServer, subgoalsServer, rouletteServer, alertsWidgetServer, goalsServer };
}

// Which server actually owns each widget path, so a stale port in an OBS
// browser source can be rewritten to the live one.
function getPortForWidget(widgetName) {
    const owners = {
        'chat': chatServer, 'dock': chatServer, 'emote-wall': chatServer,
        'spotify': spotifyServer,
        'subgoals': subgoalsServer, 'subgoals-list': subgoalsServer,
        'daily-subs': subgoalsServer, 'last-sub': subgoalsServer,
        'last-follow': subgoalsServer, 'last-donation': subgoalsServer,
        'roulette': rouletteServer,
        'goals': goalsServer,
        'alerts': alertsWidgetServer
    };
    const server = owners[widgetName];
    return server && server.getPort ? server.getPort() : null;
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        frame: false,
        icon: path.join(__dirname, 'assets/icon.png'),
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        },
        title: 'MeoMeoBot Control Panel',
        minWidth: 1000,
        minHeight: 700
    });
    Menu.setApplicationMenu(null);
    mainWindow.loadFile('index.html');

    if (process.argv.includes('--dev')) {
        mainWindow.webContents.openDevTools();
    }

    setupBotEvents();
    autoConnectBot();
}

const childWindows = {};

function openChildWindow(name, { filePath, width, height, x, y, title, onReady, onResizeMove }) {
    if (childWindows[name]) {
        childWindows[name].focus();
        return childWindows[name];
    }

    const win = new BrowserWindow({
        width, height, x, y, title,
        parent: mainWindow,
        modal: false,
        show: false,
        frame: false,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'preload.js')
        }
    });

    const qIdx = filePath.indexOf('?');
    if (qIdx !== -1) {
        const pathOnly = filePath.substring(0, qIdx);
        const search = filePath.substring(qIdx + 1);
        win.loadFile(pathOnly, { search });
    } else {
        win.loadFile(filePath);
    }
    win.setMenu(null);

    win.on('ready-to-show', () => {
        win.show();
        if (onReady) onReady(win);
    });

    win.on('closed', () => { childWindows[name] = null; });

    if (onResizeMove) {
        let boundsTimeout;
        const handler = () => {
            clearTimeout(boundsTimeout);
            boundsTimeout = setTimeout(() => {
                if (childWindows[name]) onResizeMove(win);
            }, 300);
        };
        win.on('resize', handler);
        win.on('move', handler);
    }

    childWindows[name] = win;
    return win;
}

function openCssEditorWindow(widgetName = 'chat') {
    if (childWindows.cssEditor) {
        childWindows.cssEditor.focus();
        childWindows.cssEditor.webContents.send('load-css-editor', { widgetName });
        return;
    }

    const config = bot.getConfig ? bot.getConfig() : {};
    const bounds = config.cssEditorBounds || { width: 900, height: 720 };

    openChildWindow('cssEditor', {
        filePath: `widgets/config/css_editor.html?widget=${widgetName}`,
        width: bounds.width, height: bounds.height,
        x: bounds.x, y: bounds.y,
        title: 'Editeur CSS Widget',
        onReady: (win) => win.webContents.send('load-css-editor', { widgetName }),
        onResizeMove: (win) => bot.updateConfig({ cssEditorBounds: win.getBounds() })
    });
}

function openSubgoalsConfigWindow() {
    openChildWindow('subgoalsConfig', {
        filePath: 'widgets/config/subgoals_config.html',
        width: 900, height: 600,
        title: 'Configuration Subgoals'
    });
}

function openRouletteConfigWindow() {
    openChildWindow('rouletteConfig', {
        filePath: 'widgets/config/roulette_config.html',
        width: 600, height: 500,
        title: 'Configuration Roulette'
    });
}

function openGoalsConfigWindow() {
    openChildWindow('goalsConfig', {
        filePath: 'widgets/config/goals_config.html',
        width: 1000, height: 600,
        title: 'Configuration Goals'
    });
}

function autoConnectBot() {
    const config = bot.getConfig();
    if (bot && config.channel && config.token) {
        setTimeout(() => bot.connect(), 1000);
    }
    if (kickBot && config.kickChannel) {
        setTimeout(() => kickBot.connect(config.kickChannel), 1000);
    }
    if (youtubeBot && config.youtubeChannel) {
        setTimeout(() => youtubeBot.connect(config.youtubeChannel), 1000);
    }
}

function setupBotEvents() {
    if (!bot) return;

    bot.on('twitch-oauth-token', (token) => {
        log.info('TWITCH_OAUTH_TOKEN_OK');
        if (reauthPrompter) reauthPrompter.clear('twitch');
        bot.updateConfig({ token: `oauth:${token}` });
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('notification', 'Token Twitch obtenu avec succès !', 'success');
            mainWindow.webContents.send('config-updated');
        }
        setTimeout(() => bot.connect(), 500);
    });

    bot.on('kick-oauth-code', async (code) => {
        if (!kickApi || !kickCodeVerifier) {
            log.error('KICK_OAUTH_MISSING', { hasApi: !!kickApi, hasVerifier: !!kickCodeVerifier });
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('notification', 'Erreur OAuth Kick: verifier manquant', 'error');
            }
            return;
        }
        try {
            const config = bot.getConfig();
            const params = new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: config.kickClientId,
                client_secret: config.kickClientSecret,
                redirect_uri: 'http://localhost:8087/kick/callback',
                code_verifier: kickCodeVerifier,
                code
            });
            const response = await fetch('https://id.kick.com/oauth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString()
            });
            if (response.ok) {
                const data = await response.json();
                bot.updateConfig({
                    kickToken: data.access_token,
                    kickRefreshToken: data.refresh_token
                });
                kickApi.userAccessToken = data.access_token;
                log.info('KICK_USER_TOKEN_OK');
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('notification', 'Token Kick obtenu avec succès !', 'success');
                }
            } else {
                const text = await response.text();
                log.error('KICK_TOKEN_EXCHANGE_ERR', { status: response.status, body: text });
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('notification', 'Erreur échange token Kick: ' + response.status, 'error');
                }
            }
            kickCodeVerifier = null;
        } catch (err) {
            log.error('KICK_TOKEN_EXCHANGE_ERR', { error: err.message });
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('notification', 'Erreur OAuth Kick: ' + err.message, 'error');
            }
            kickCodeVerifier = null;
        }
    });

    const safeSend = (channel, data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(channel, data);
        }
    };

    bot.on('eventsub-status', (status) => safeSend('eventsub-status', status));

    bot.on('token-invalid', () => {
        if (reauthPrompter) reauthPrompter.request('twitch', 'validate failed');
        else safeSend('notification', 'Token Twitch invalide ou expiré.', 'error');
    });

    bot.on('auth-expired', ({ service }) => {
        if (reauthPrompter) reauthPrompter.request(service, 'refresh failed');
    });

    bot.on('auth-restored', ({ service }) => {
        if (reauthPrompter) reauthPrompter.clear(service);
    });

    bot.on('token-expiring', (days) => {
        safeSend('notification', `Le token Twitch expire dans ${days} jour(s).`, 'error');
    });

    bot.on('scopes-missing', (scopes) => {
        safeSend('notification', `Permissions Twitch manquantes : ${scopes.join(', ')}`, 'error');
    });

    bot.on('connected', () => safeSend('bot-status', { connected: true, channel: bot.getConfig().channel }));
    bot.on('disconnected', () => safeSend('bot-status', { connected: false }));
    bot.on('participants-updated', () => safeSend('participants-updated'));
    bot.on('participant-added', (username) => safeSend('participant-added', { username }));

    bot.on('sub-count-update', (count) => {
        if (subgoalsServer) {
            const config = bot.getWidgetConfig('subgoals');
            subgoalsServer.broadcastConfig({ ...config, currentCount: count }, 'subgoals');
            subgoalsServer.broadcastSubUpdate(count);
        }
        safeSend('sub-count-updated', count);
        if (goalsServer) goalsServer.broadcastCurrentCounts();
    });

    bot.on('daily-sub-count-update', (count) => {
        if (subgoalsServer) {
            const config = bot.getWidgetConfig('subgoals') || {};
            subgoalsServer.broadcastConfig({ ...config, dailyCurrentCount: count }, 'subgoals');
        }
    });

    bot.on('new-follow', () => {
        if (goalsServer) goalsServer.broadcastCurrentCounts();
    });

    bot.on('message-deleted', (messageId) => {
        log.info('MAIN_MSG_DELETED', { messageId });
        if (chatServer) chatServer.broadcast({ type: 'delete-message', messageId });
    });

    bot.on('clear-chat', () => {
        log.info('MAIN_CHAT_CLEARED');
        if (chatServer) chatServer.broadcast({ type: 'clear-chat' });
    });

    bot.on('clear-user', (username) => {
        log.info('MAIN_USER_CLEARED', { username });
        if (chatServer) chatServer.broadcast({ type: 'clear-user', username });
    });

    bot.on('refresh-widgets', () => {
        log.info('MAIN_REFRESH_WIDGETS');
        if (chatServer) chatServer.broadcast({ type: 'reload' });
        if (spotifyServer) spotifyServer.broadcast({ type: 'reload' });
        if (subgoalsServer) subgoalsServer.broadcast({ type: 'reload' });
        if (rouletteServer) rouletteServer.broadcast({ type: 'reload' });
        if (alertsWidgetServer) alertsWidgetServer.refresh();
        if (goalsServer) goalsServer.broadcast({ type: 'reload' });
    });

    bot.on('toggle-widgets', (visible) => {
        log.info('MAIN_TOGGLE_WIDGETS', { visible });
        const data = { type: 'visibility', visible };
        if (chatServer) chatServer.broadcast(data);
        if (spotifyServer) spotifyServer.broadcast(data);
        if (subgoalsServer) subgoalsServer.broadcast(data);
        if (rouletteServer) rouletteServer.broadcast(data);
        if (goalsServer) goalsServer.broadcast(data);
    });

    bot.on('chat-message', (msg) => {
        if (chatServer) {
            chatServer.broadcast({ type: 'chat', platform: 'twitch', ...msg });
        }
    });

    if (kickBot) {
        kickBot.on('chat-message', (msg) => {
            if (chatServer) {
                chatServer.broadcast({ type: 'chat', platform: 'kick', ...msg });
            }
        });
    }

    if (youtubeBot) {
        youtubeBot.on('chat-message', (msg) => {
            if (chatServer) {
                chatServer.broadcast({ type: 'chat', platform: 'youtube', ...msg });
            }
        });
    }

    bot.on('emote-rain', (emotes) => {
        if (chatServer) chatServer.broadcast({ type: 'emote-rain', emotes });
    });

    bot.on('naporaoult', () => {
        if (chatServer) chatServer.broadcast({ type: 'naporaoult' });
    });

    bot.on('alert', (alert) => {
        if (alertsWidgetServer) alertsWidgetServer.addToQueue(alert);
    });
}

ipcMain.handle('open-css-editor', (event, widgetName) => openCssEditorWindow(widgetName));
ipcMain.handle('open-subgoals-config', () => openSubgoalsConfigWindow());
ipcMain.handle('open-roulette-config', () => openRouletteConfigWindow());
ipcMain.handle('open-goals-config', () => openGoalsConfigWindow());
ipcMain.handle('open-external-url', async (event, url) => {
    const { shell } = require('electron');
    shell.openExternal(url);
});


ipcMain.handle('store-kick-verifier', (event, verifier) => {
    kickCodeVerifier = verifier;
    log.info('KICK_VERIFIER_STORED');
});

ipcMain.handle('kick-auth-oauth', async (event, code, codeVerifier) => {
    if (kickApi) {
        try {
            const config = bot.getConfig();
            const params = new URLSearchParams({
                grant_type: 'authorization_code',
                client_id: config.kickClientId,
                client_secret: config.kickClientSecret,
                redirect_uri: 'http://localhost:8087/kick/callback',
                code_verifier: codeVerifier,
                code
            });
            const response = await fetch('https://id.kick.com/oauth/token', {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params.toString()
            });
            if (response.ok) {
                const data = await response.json();
                bot.updateConfig({
                    kickToken: data.access_token,
                    kickRefreshToken: data.refresh_token
                });
                kickApi.userAccessToken = data.access_token;
                return { success: true };
            }
            return { success: false, error: 'Token exchange failed' };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }
    return { success: false, error: 'KickAPI not initialized' };
});

ipcMain.handle('get-goal-widget-url', (event, goalId) => {
    if (goalsServer) return goalsServer.getGoalUrl('127.0.0.1', goalId);
    return '';
});

let cachedFonts = null;
ipcMain.handle('get-system-fonts', async () => {
    if (cachedFonts) return cachedFonts;
    try {
        const fonts = await fontList.getFonts();
        cachedFonts = fonts
            .map(f => f.replace(/^"|"$/g, ''))
            .filter(f => f.length > 0)
            .sort((a, b) => a.localeCompare(b));
    } catch (e) {
        log.error('MAIN_FONTS_ERR', { error: e.message || e });
        cachedFonts = ['Arial', 'Segoe UI', 'Verdana', 'Georgia', 'Times New Roman', 'Courier New', 'Consolas'];
    }
    return cachedFonts;
});

ipcMain.handle('trigger-roulette-spin', () => {
    if (rouletteServer) {
        rouletteServer.broadcastSpin();
        return { success: true };
    }
    return { success: false, message: 'Roulette server not running' };
});

ipcMain.on('window-control', (event, action) => {
    const window = BrowserWindow.getFocusedWindow();
    if (!window || !['minimize', 'maximize', 'close'].includes(action)) return;
    switch (action) {
        case 'minimize': window.minimize(); break;
        case 'maximize': window.isMaximized() ? window.unmaximize() : window.maximize(); break;
        case 'close': window.close(); break;
    }
});

ipcMain.on('resize-css-editor', (event, width) => {
    const cssEditorWindow = childWindows.cssEditor;
    if (cssEditorWindow) {
        const bounds = cssEditorWindow.getBounds();
        const newWidth = Math.max(400, Math.min(1600, width));
        const widthDelta = newWidth - bounds.width;
        const newX = bounds.x - Math.floor(widthDelta / 2);
        cssEditorWindow.setBounds({
            x: newX,
            y: bounds.y,
            width: newWidth,
            height: bounds.height
        });
    }
});

app.on('second-instance', () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
        if (mainWindow.isMinimized()) mainWindow.restore();
        mainWindow.focus();
    }
});

app.whenReady().then(async () => {
    if (!gotSingleInstanceLock) return;

    bot = new TwitchBot();
    kickBot = new KickBot();
    kickApi = new KickAPI(bot);
    kickBot.setApi(kickApi);
    youtubeBot = new YouTubeBot();
    try {
        await themeManager.reloadThemeContent(bot);
    } catch (e) {
        log.error('MAIN_THEME_ERR', { error: e.message || e });
    }

    createWindow();

    mediaServerModule.start();

    const config = bot.getConfig();
    chatServer = createChatWidgetServer(bot, DEFAULT_WIDGET_PORT, kickBot);
    spotifyServer = createSpotifyWidgetServer(bot, { defaultPort: DEFAULT_SPOTIFY_WIDGET_PORT });
    subgoalsServer = createSubgoalsWidgetServer(bot, DEFAULT_SUBGOALS_WIDGET_PORT);
    rouletteServer = createRouletteWidgetServer(bot, DEFAULT_ROULETTE_WIDGET_PORT);
    alertsWidgetServer = createAlertsWidgetServer(bot, DEFAULT_ALERTS_WIDGET_PORT);
    goalsServer = createGoalsWidgetServer(bot, DEFAULT_GOALS_WIDGET_PORT);

    streamlabsClient = new StreamlabsClient(bot);
    if (config.streamlabsSocketToken) {
        streamlabsClient.start(config.streamlabsSocketToken);
    }

    const onServerPortChanged = () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('widget-ports-changed');
            // The name every renderer module actually listens for.
            mainWindow.webContents.send('refresh-widget-urls');
        }
    };

    Promise.all([
        chatServer.start(),
        spotifyServer.start(),
        subgoalsServer.start(),
        rouletteServer.start(),
        alertsWidgetServer.start(),
        goalsServer.start()
    ]).then(() => {
        if (goalsServer) goalsServer.startPolling();
        onServerPortChanged();
        log.info('MAIN_SERVERS_STARTED');

        // Only now are the widget URLs actually serving, so this is the point
        // at which refreshing OBS is worth anything.
        obsControl = new ObsControl(bot, getPortForWidget);
        obsControl.start();

        reauthPrompter = new ReauthPrompter({
            bot,
            getMainWindow: () => mainWindow,
            getServers
        });
    }).catch(err => {
        log.error('MAIN_SERVERS_ERR', { error: err.message || err });
    });

    autoUpdaterModule.init(mainWindow);
    if (app.isPackaged) {
        setTimeout(() => {
            log.info('MAIN_UPDATE_CHECK');
            autoUpdaterModule.checkNow();
            autoUpdaterModule.startCheckLoop();
        }, 2000);
    }

    log.info('MAIN_IPC_REGISTER');
    ipcHandlers.registerHandlers({
        bot,
        kickBot,
        youtubeBot,
        getObsControl: () => obsControl,
        getServers,
        getLocalIp: castManager.getLocalIp,
        mediaServer: mediaServerModule.getServer(),
        streamlabsClient
    });
    log.info('MAIN_IPC_REGISTERED');

    themeManager.registerHandlers(bot);
    castManager.registerHandlers(mainWindow, mediaServerModule);
    videoHandlers.registerHandlers();
});

function cleanup() {
    if (chatServer) chatServer.stop();
    if (spotifyServer) spotifyServer.stop();
    if (subgoalsServer) subgoalsServer.stop();
    if (rouletteServer) rouletteServer.stop();
    if (alertsWidgetServer) alertsWidgetServer.stop();
    if (goalsServer) goalsServer.stop();
    if (streamlabsClient) streamlabsClient.stop();
    if (obsControl) obsControl.stop();
    mediaServerModule.stop();
    castManager.cleanup();
}

app.on('window-all-closed', () => {
    cleanup();
    autoUpdaterModule.stopCheckLoop();

    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('will-quit', cleanup);
