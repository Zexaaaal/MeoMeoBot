const { autoUpdater } = require('electron-updater');
const { ipcMain, app } = require('electron');
const log = require('./logger').tagged('Update');

const UPDATE_CHECK_INTERVAL = 800000;
let updateCheckTimer = null;

autoUpdater.logger = log;
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;
autoUpdater.verifyUpdateCodeSignature = false;

function init(mainWindow) {
    autoUpdater.on('checking-for-update', () => {
        log.info('AUTO_UPDATER_CHECKING');
        mainWindow.webContents.send('update-status-check', { status: 'checking' });
    });

    autoUpdater.on('update-available', (info) => {
        log.info('AUTO_UPDATER_AVAILABLE', { version: info.version });
        mainWindow.webContents.send('update-available');
        if (updateCheckTimer) clearInterval(updateCheckTimer);
    });

    autoUpdater.on('update-not-available', (info) => {
        log.info('AUTO_UPDATER_NOT_AVAILABLE');
        mainWindow.webContents.send('update-status-check', { status: 'up-to-date' });
    });

    autoUpdater.on('update-downloaded', () => {
        log.info('AUTO_UPDATER_DOWNLOADED');
        mainWindow.webContents.send('update-downloaded');
    });

    autoUpdater.on('error', (err) => {
        log.error('AUTO_UPDATER_ERROR', { error: err.message || err });
        mainWindow.webContents.send('update-status-check', { status: 'error' });
    });

    ipcMain.on('start-download', () => {
        autoUpdater.downloadUpdate();
        mainWindow.webContents.send('update-status-check', { status: 'downloading' });
    });

    ipcMain.on('quit-and-install', () => {
        autoUpdater.quitAndInstall(true, true);
    });

    ipcMain.on('check-for-updates', () => {
        if (!app.isPackaged) {
            log.info('AUTO_UPDATER_DEV_CHECK');
            mainWindow.webContents.send('update-status-check', { status: 'checking' });
            setTimeout(() => {
                mainWindow.webContents.send('update-status-check', { status: 'up-to-date' });
            }, 2000);
            return;
        }

        log.info('AUTO_UPDATER_MANUAL_CHECK');
        checkNow();
        mainWindow.webContents.send('update-status-check', { status: 'checking' });
    });
}

function startCheckLoop() {
    if (updateCheckTimer) clearInterval(updateCheckTimer);
    updateCheckTimer = setInterval(() => {
        if (app.isPackaged) {
            log.info('AUTO_UPDATER_PERIODIC_CHECK');
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
