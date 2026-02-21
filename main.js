require('dotenv').config();
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const fontList = require('font-list');
const TwitchBot = require('./bot.js');
const StreamlabsClient = require('./server/streamlabs');
const log = require('./main/logger').tagged('Main');

const { createChatWidgetServer } = require('./server/chatWidgetServer');
const { createSpotifyWidgetServer } = require('./server/spotifyWidgetServer');
const { createSubgoalsWidgetServer } = require('./server/subgoalsWidgetServer');
const { createRouletteWidgetServer } = require('./server/rouletteWidgetServer');
const { createAlertsWidgetServer } = require('./server/alertsWidgetServer');

const autoUpdaterModule = require('./main/auto-updater');
const mediaServerModule = require('./main/media-server');
const themeManager = require('./main/theme-manager');
const castManager = require('./main/cast-manager');
const ipcHandlers = require('./main/ipc-handlers');
const videoHandlers = require('./main/video-handlers');

const DEFAULT_WIDGET_PORT = 8087;
const DEFAULT_SPOTIFY_WIDGET_PORT = 8090;
const DEFAULT_SUBGOALS_WIDGET_PORT = 8091;
const DEFAULT_ROULETTE_WIDGET_PORT = 8092;
const DEFAULT_ALERTS_WIDGET_PORT = 8097;

let mainWindow;

let bot;
let streamlabsClient = null;

let chatServer;
let spotifyServer;
let subgoalsServer;
let rouletteServer;
let alertsWidgetServer;

function getServers() {
    return { chatServer, spotifyServer, subgoalsServer, rouletteServer, alertsWidgetServer };
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

    win.loadFile(filePath);
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
        filePath: 'widgets/config/css_editor.html',
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
        width: 700, height: 600,
        title: 'Configuration Sub-Goals'
    });
}

function openRouletteConfigWindow() {
    openChildWindow('rouletteConfig', {
        filePath: 'widgets/config/roulette_config.html',
        width: 600, height: 500,
        title: 'Configuration Roulette'
    });
}

function autoConnectBot() {
    const config = bot.getConfig();
    if (bot && config.channel && config.username && config.token) {
        setTimeout(() => bot.connect(), 1000);
    }
}

function setupBotEvents() {
    if (!bot) return;

    const safeSend = (channel, data) => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send(channel, data);
        }
    };

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
    });

    bot.on('daily-sub-count-update', (count) => {
        if (subgoalsServer) {
            const config = bot.getWidgetConfig('subgoals') || {};
            subgoalsServer.broadcastConfig({ ...config, dailyCurrentCount: count }, 'subgoals');
        }
    });

    bot.on('message-deleted', (messageId) => {
        log.info('MAIN_MSG_DELETED', { messageId });
        if (chatServer) chatServer.broadcast({ type: 'delete-message', messageId });
    });

    bot.on('clear-chat', () => {
        log.info('MAIN_CHAT_CLEARED');
        if (chatServer) chatServer.broadcast({ type: 'clear-chat' });
    });

    bot.on('refresh-widgets', () => {
        log.info('MAIN_REFRESH_WIDGETS');
        if (chatServer) chatServer.broadcast({ type: 'reload' });
        if (spotifyServer) spotifyServer.broadcast({ type: 'reload' });
        if (subgoalsServer) subgoalsServer.broadcast({ type: 'reload' });
        if (rouletteServer) rouletteServer.broadcast({ type: 'reload' });
        if (alertsWidgetServer) alertsWidgetServer.refresh();
    });

    bot.on('toggle-widgets', (visible) => {
        log.info('MAIN_TOGGLE_WIDGETS', { visible });
        const data = { type: 'visibility', visible };
        if (chatServer) chatServer.broadcast(data);
        if (spotifyServer) spotifyServer.broadcast(data);
        if (subgoalsServer) subgoalsServer.broadcast(data);
        if (rouletteServer) rouletteServer.broadcast(data);
    });

    bot.on('chat-message', (msg) => {
        if (chatServer) chatServer.broadcast({ type: 'chat', ...msg });
    });

    bot.on('emote-rain', (emotes) => {
        if (chatServer) chatServer.broadcast({ type: 'emote-rain', emotes });
    });

    bot.on('alert', (alert) => {
        if (alertsWidgetServer) alertsWidgetServer.addToQueue(alert);
    });
}

ipcMain.handle('open-css-editor', (event, widgetName) => openCssEditorWindow(widgetName));
ipcMain.handle('open-subgoals-config', () => openSubgoalsConfigWindow());
ipcMain.handle('open-roulette-config', () => openRouletteConfigWindow());

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

app.whenReady().then(async () => {
    bot = new TwitchBot();
    try {
        await themeManager.reloadThemeContent(bot);
    } catch (e) {
        log.error('MAIN_THEME_ERR', { error: e.message || e });
    }

    createWindow();

    mediaServerModule.start();

    const config = bot.getConfig();
    chatServer = createChatWidgetServer(bot, DEFAULT_WIDGET_PORT);
    spotifyServer = createSpotifyWidgetServer(bot, { defaultPort: DEFAULT_SPOTIFY_WIDGET_PORT });
    subgoalsServer = createSubgoalsWidgetServer(bot, DEFAULT_SUBGOALS_WIDGET_PORT);
    rouletteServer = createRouletteWidgetServer(bot, DEFAULT_ROULETTE_WIDGET_PORT);
    alertsWidgetServer = createAlertsWidgetServer(bot, DEFAULT_ALERTS_WIDGET_PORT);

    streamlabsClient = new StreamlabsClient(bot);
    if (config.streamlabsSocketToken) {
        streamlabsClient.start(config.streamlabsSocketToken);
    }

    const onServerPortChanged = () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('widget-ports-changed');
        }
    };

    Promise.all([
        chatServer.start(),
        spotifyServer.start(),
        subgoalsServer.start(),
        rouletteServer.start(),
        alertsWidgetServer.start()
    ]).then(() => {
        onServerPortChanged();
        log.info('MAIN_SERVERS_STARTED');
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
    if (streamlabsClient) streamlabsClient.stop();
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
