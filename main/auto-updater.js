const { autoUpdater } = require('electron-updater');
const { ipcMain, app } = require('electron');
const logger = require('./logger');

const UPDATE_CHECK_INTERVAL = 800000;
let updateCheckTimer = null;

function init(mainWindow) {
    autoUpdater.on('checking-for-update', () => {
        mainWindow.webContents.send('update-status-check', { status: 'checking' });
    });

    autoUpdater.on('update-available', () => {
        mainWindow.webContents.send('update-available');
        if (updateCheckTimer) clearInterval(updateCheckTimer);
    });

    autoUpdater.on('update-not-available', () => {
        mainWindow.webContents.send('update-status-check', { status: 'up-to-date' });
    });

    autoUpdater.on('update-downloaded', () => {
        mainWindow.webContents.send('update-downloaded');
    });

    autoUpdater.on('error', (err) => {
        logger.error(`[AUTO-UPDATER ERROR] Erreur de mise à jour: ${err}`);
        mainWindow.webContents.send('update-status-check', { status: 'error' });
    });

    ipcMain.on('start-download', () => {
        autoUpdater.downloadUpdate();
        mainWindow.webContents.send('update-status-check', { status: 'downloading' });
    });

    ipcMain.on('quit-and-install', () => {
        autoUpdater.quitAndInstall();
    });
}

function startCheckLoop() {
    if (updateCheckTimer) clearInterval(updateCheckTimer);
    updateCheckTimer = setInterval(() => {
        if (app.isPackaged) {
            logger.log('[AUTO-UPDATER] Vérification des mises à jour (15 min)...');
            autoUpdater.checkForUpdates();
        }
    }, UPDATE_CHECK_INTERVAL);
}

function stopCheckLoop() {
    if (updateCheckTimer) {
        clearInterval(updateCheckTimer);
        updateCheckTimer = null;
    }
}

function checkNow() {
    if (app.isPackaged) {
        autoUpdater.checkForUpdates();
    }
}

module.exports = {
    init,
    startCheckLoop,
    stopCheckLoop,
    checkNow
};
