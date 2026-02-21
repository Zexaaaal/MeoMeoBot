const { ipcMain, app } = require('electron');
const { Bonjour } = require('bonjour-service');
const { Client, DefaultMediaReceiver } = require('castv2-client');
const log = require('./logger').tagged('Cast');
const os = require('os');

let bonjourInstance = null;
let lastCastDevice = null;

function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const iface of interfaces[name]) {
            if (iface.family === 'IPv4' && !iface.internal) {
                return iface.address;
            }
        }
    }
    return '127.0.0.1';
}

function registerHandlers(mainWindow, mediaServerModule) {
    ipcMain.handle('discover-devices', async () => {
        mainWindow.webContents.send('device-discovery-status', 'Recherche en cours...');

        if (bonjourInstance) {
            try { bonjourInstance.destroy(); } catch (e) { }
        }
        bonjourInstance = new Bonjour();

        const devices = [];
        const browser = bonjourInstance.find({ type: 'googlecast' });

        browser.on('up', (service) => {
            const host = service.referer?.address || (service.addresses && service.addresses[0]) || service.host;

            if (service.name && host && !devices.some(d => d.host === host)) {
                devices.push({
                    name: service.name,
                    host: host,
                    port: service.port
                });
                mainWindow.webContents.send('cast-devices-found', devices);
            }
        });

        setTimeout(() => {
            try { browser.stop(); } catch (e) { }
            mainWindow.webContents.send('device-discovery-status', 'Recherche terminée.');
        }, 10000);

        return true;
    });

    ipcMain.handle('play-on-device', (event, { deviceHost, devicePort, videoPath }) => {
        mediaServerModule.setCurrentPath(videoPath);
        lastCastDevice = { host: deviceHost, port: devicePort };

        const serverPort = mediaServerModule.getServer().address().port;
        const localIp = getLocalIp();
        const videoUrl = `http://${localIp}:${serverPort}/media`;

        const client = new Client();
        client.connect({ host: deviceHost, port: devicePort }, (err) => {
            if (err) {
                mainWindow.webContents.send('cast-status', {
                    success: false,
                    message: 'Impossible de se connecter à l\'appareil.'
                });
                return;
            }
            client.launch(DefaultMediaReceiver, (err, player) => {
                if (err) {
                    mainWindow.webContents.send('cast-status', {
                        success: false,
                        message: 'Impossible de lancer le lecteur.'
                    });
                    client.close();
                    return;
                }
                const media = {
                    contentId: videoUrl,
                    contentType: 'video/mp4',
                    streamType: 'BUFFERED'
                };
                player.load(media, { autoplay: true }, (err) => {
                    client.close();
                    if (err) {
                        mainWindow.webContents.send('cast-status', {
                            success: false,
                            message: 'Impossible de charger la vidéo.'
                        });
                    } else {
                        mainWindow.webContents.send('cast-status', {
                            success: true,
                            message: 'Lecture démarrée.'
                        });
                    }
                });
            });
        });
    });

    ipcMain.handle('stop-casting', async () => {
        mediaServerModule.setCurrentPath(null);
        if (lastCastDevice) {
            const client = new Client();
            return new Promise((resolve) => {
                client.connect(lastCastDevice, () => {
                    client.stop(DefaultMediaReceiver, () => {
                        client.close();
                        resolve({ success: true });
                    });
                });
                client.on('error', () => {
                    resolve({ success: false });
                });
            });
        }
        return { success: true };
    });
}

function cleanup() {
    if (bonjourInstance) {
        try { bonjourInstance.destroy(); } catch (e) { }
        bonjourInstance = null;
    }
}

module.exports = {
    registerHandlers,
    getLocalIp,
    cleanup
};
