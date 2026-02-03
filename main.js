require('dotenv').config();
const { app, BrowserWindow, ipcMain, Menu } = require('electron');
const path = require('path');
const TwitchBot = require('./bot.js');
const StreamlabsClient = require('./server/streamlabs');
const logger = require('./main/logger');

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
let cssEditorWindow = null;
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

function openCssEditorWindow(widgetName = 'chat') {
    if (cssEditorWindow) {
        cssEditorWindow.focus();
        cssEditorWindow.webContents.send('load-css-editor', { widgetName });
        return;
    }

    const config = bot.getConfig ? bot.getConfig() : {};
    const bounds = config.cssEditorBounds || { width: 900, height: 720 };

    cssEditorWindow = new BrowserWindow({
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        title: 'Editeur CSS Widget',
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

    cssEditorWindow.loadFile('widgets/config/css_editor.html');
    cssEditorWindow.setMenu(null);

    cssEditorWindow.on('ready-to-show', () => {
        cssEditorWindow.show();
        cssEditorWindow.webContents.send('load-css-editor', { widgetName });
    });

    cssEditorWindow.on('closed', () => {
        cssEditorWindow = null;
    });

    cssEditorWindow.on('resize', () => {
        if (cssEditorWindow && bot) {
            const b = cssEditorWindow.getBounds();
            bot.updateConfig({ cssEditorBounds: b });
        }
    });
    cssEditorWindow.on('move', () => {
        if (cssEditorWindow && bot) {
            const b = cssEditorWindow.getBounds();
            bot.updateConfig({ cssEditorBounds: b });
        }
    });
}

let subgoalsConfigWindow = null;
function openSubgoalsConfigWindow() {
    if (subgoalsConfigWindow) {
        subgoalsConfigWindow.focus();
        return;
    }
    subgoalsConfigWindow = new BrowserWindow({
        width: 700,
        height: 600,
        title: 'Configuration Sub-Goals',
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
    subgoalsConfigWindow.loadFile('widgets/config/subgoals_config.html');
    subgoalsConfigWindow.setMenu(null);
    subgoalsConfigWindow.on('ready-to-show', () => subgoalsConfigWindow.show());
    subgoalsConfigWindow.on('closed', () => { subgoalsConfigWindow = null; });
}

let rouletteConfigWindow = null;
function openRouletteConfigWindow() {
    if (rouletteConfigWindow) {
        rouletteConfigWindow.focus();
        return;
    }
    rouletteConfigWindow = new BrowserWindow({
        width: 600,
        height: 500,
        title: 'Configuration Roulette',
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
    rouletteConfigWindow.loadFile('widgets/config/roulette_config.html');
    rouletteConfigWindow.setMenu(null);
    rouletteConfigWindow.on('ready-to-show', () => rouletteConfigWindow.show());
    rouletteConfigWindow.on('closed', () => { rouletteConfigWindow = null; });
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

    bot.onConnected = () => safeSend('bot-status', { connected: true, channel: bot.getConfig().channel });
    bot.onDisconnected = () => safeSend('bot-status', { connected: false });
    bot.onParticipantsUpdated = () => safeSend('participants-updated');
    bot.onParticipantAdded = (username) => safeSend('participant-added', { username });

    bot.onMessageDeleted = (messageId) => {
        logger.log(`[MAIN] Message deleted: ${messageId}`);
        if (chatServer) chatServer.broadcast({ type: 'delete-message', messageId });
    };

    bot.onClearChat = () => {
        logger.log('[MAIN] Chat cleared');
        if (chatServer) chatServer.broadcast({ type: 'clear-chat' });
    };

    bot.onRefreshWidgets = () => {
        logger.log('[MAIN] Refreshing all widgets via admin command');
        if (chatServer) chatServer.broadcast({ type: 'reload' });
        if (spotifyServer) spotifyServer.broadcast({ type: 'reload' });
        if (subgoalsServer) subgoalsServer.broadcast({ type: 'reload' });
        if (rouletteServer) rouletteServer.broadcast({ type: 'reload' });
        if (alertsWidgetServer) alertsWidgetServer.refresh();
    };

    bot.onToggleWidgets = (visible) => {
        logger.log(`[MAIN] Toggling all widgets visibility: ${visible}`);
        const data = { type: 'visibility', visible };
        if (chatServer) chatServer.broadcast(data);
        if (spotifyServer) spotifyServer.broadcast(data);
        if (subgoalsServer) subgoalsServer.broadcast(data);
        if (rouletteServer) rouletteServer.broadcast(data);
    };

    bot.onChatMessage = (msg) => {
        if (chatServer) chatServer.broadcast({ type: 'chat', ...msg });
    };

    bot.onEmoteRain = (emotes) => {
        if (chatServer) chatServer.broadcast({ type: 'emote-rain', emotes });
    };
}

ipcMain.handle('open-css-editor', (event, widgetName) => openCssEditorWindow(widgetName));
ipcMain.handle('open-subgoals-config', () => openSubgoalsConfigWindow());
ipcMain.handle('open-roulette-config', () => openRouletteConfigWindow());

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
        logger.error('Failed to reload theme content:', e);
    }

    createWindow();

    mediaServerModule.start();

    const config = bot.getConfig();
    chatServer = createChatWidgetServer(bot, config.chatWidgetPort || DEFAULT_WIDGET_PORT);
    spotifyServer = createSpotifyWidgetServer(bot, { defaultPort: DEFAULT_SPOTIFY_WIDGET_PORT });
    subgoalsServer = createSubgoalsWidgetServer(bot, DEFAULT_SUBGOALS_WIDGET_PORT);
    rouletteServer = createRouletteWidgetServer(bot, DEFAULT_ROULETTE_WIDGET_PORT);
    alertsWidgetServer = createAlertsWidgetServer(bot, DEFAULT_ALERTS_WIDGET_PORT);

    streamlabsClient = new StreamlabsClient(bot);
    if (config.streamlabsSocketToken) {
        streamlabsClient.start(config.streamlabsSocketToken);
    }

    const onAlert = (alert) => {
        if (alertsWidgetServer) alertsWidgetServer.addToQueue(alert);
    };

    const onServerPortChanged = () => {
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('widget-ports-changed');
        }
    };

    chatServer.start(onServerPortChanged);
    spotifyServer.start(onServerPortChanged);
    subgoalsServer.start(onServerPortChanged);
    rouletteServer.start(onServerPortChanged);
    alertsWidgetServer.start(onServerPortChanged);

    bot.onAlert = onAlert;
    if (streamlabsClient) streamlabsClient.onAlert = onAlert;

    autoUpdaterModule.init(mainWindow);
    if (app.isPackaged) {
        autoUpdaterModule.startCheckLoop();
    }

    ipcHandlers.registerHandlers({
        bot,
        getServers,
        getLocalIp: castManager.getLocalIp,
        mediaServer: mediaServerModule.getServer(),
        streamlabsClient
    });

    themeManager.registerHandlers(bot);
    castManager.registerHandlers(mainWindow, mediaServerModule);
    videoHandlers.registerHandlers();
});

app.on('window-all-closed', () => {
    if (chatServer) chatServer.stop();
    if (spotifyServer) spotifyServer.stop();
    if (subgoalsServer) subgoalsServer.stop();
    if (rouletteServer) rouletteServer.stop();
    castManager.cleanup();
    autoUpdaterModule.stopCheckLoop();
});

app.on('will-quit', () => {
    if (chatServer) chatServer.stop();
    if (spotifyServer) spotifyServer.stop();
    if (subgoalsServer) subgoalsServer.stop();
    if (rouletteServer) rouletteServer.stop();
    if (alertsWidgetServer) alertsWidgetServer.stop();
    if (streamlabsClient) streamlabsClient.stop();
    mediaServerModule.stop();
    castManager.cleanup();
});
