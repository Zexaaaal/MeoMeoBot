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
        log.info('[AUTO-UPDATER] Checking for update...');
        mainWindow.webContents.send('update-status-check', { status: 'checking' });
    });

    autoUpdater.on('update-available', (info) => {
        log.info(`[AUTO-UPDATER] Update available: ${info.version}`);
        mainWindow.webContents.send('update-available');
        if (updateCheckTimer) clearInterval(updateCheckTimer);
    });

    autoUpdater.on('update-not-available', (info) => {
        log.info(`[AUTO-UPDATER] Update not available. Current version is latest.`);
        mainWindow.webContents.send('update-status-check', { status: 'up-to-date' });
    });

    autoUpdater.on('update-downloaded', () => {
        log.info('[AUTO-UPDATER] Update downloaded, ready to install.');
        mainWindow.webContents.send('update-downloaded');
    });

    autoUpdater.on('error', (err) => {
        log.error(`[AUTO-UPDATER ERROR] Erreur de mise à jour: ${err}`);
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
            log.info('[AUTO-UPDATER] Dev mode: check-for-updates triggered (simulated)');
            mainWindow.webContents.send('update-status-check', { status: 'checking' });
            setTimeout(() => {
                mainWindow.webContents.send('update-status-check', { status: 'up-to-date' });
            }, 2000);
            return;
        }

        log.info('[AUTO-UPDATER] Manual update check triggered');
        checkNow();
        mainWindow.webContents.send('update-status-check', { status: 'checking' });
    });
}

function startCheckLoop() {
    if (updateCheckTimer) clearInterval(updateCheckTimer);
    updateCheckTimer = setInterval(() => {
        if (app.isPackaged) {
            log.info('[AUTO-UPDATER] Vérification des mises à jour (15 min)...');
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
