import { showNotification } from './ui.js';
import { API } from './api.js';

export function setupCast() {
    const selectFolderBtn = document.getElementById('select-cast-folder-btn');
    if (selectFolderBtn) {
        selectFolderBtn.addEventListener('click', selectCastFolder);
    }

    loadSavedFolder();

    window.api.on('cast-devices-found', (devices) => {
    });

    window.api.on('cast-status', (status) => {
        showNotification(status.message, status.success ? 'success' : 'error');
    });
}

async function loadSavedFolder() {
    try {
        const config = await API.getConfig();
        if (config && config.castFolder) {
            loadVideos(config.castFolder);
        }
    } catch (error) {
        console.error('Erreur de chargement du dossier:', error);
    }
}

async function selectCastFolder() {
    try {
        const folderPath = await API.cast.selectFolder();
        if (folderPath) {
            await API.saveConfig({ castFolder: folderPath });
            loadVideos(folderPath);
        }
    } catch (error) {
        console.error('Erreur sélection dossier:', error);
        showNotification('Erreur lors de la sélection du dossier', 'error');
    }
}

async function loadVideos(folderPath) {
    const grid = document.getElementById('video-thumbnail-grid');
    if (!grid) return;

    grid.innerHTML = '<div class="loading-spinner">Chargement des vidéos...</div>';

    try {
        const videos = await API.cast.getVideos(folderPath);
        grid.innerHTML = '';

        if (videos.length === 0) {
            grid.innerHTML = '<div class="empty-state">Aucune vidéo trouvée dans ce dossier.</div>';
            return;
        }

        videos.forEach(video => {
            const card = document.createElement('div');
            card.className = 'video-card';

            const img = document.createElement('img');
            img.src = video.thumbnailData;
            img.alt = video.fileName;

            const title = document.createElement('div');
            title.className = 'video-title';
            title.textContent = video.fileName;

            card.appendChild(img);
            card.appendChild(title);

            card.addEventListener('click', () => showDevicePicker(video.videoPath));

            grid.appendChild(card);
        });
    } catch (error) {
        console.error('Erreur chargement vidéos:', error);
        grid.innerHTML = '<div class="error-state">Erreur lors du chargement des vidéos.</div>';
    }
}

function showDevicePicker(videoPath) {
    const overlay = document.getElementById('device-picker-overlay');
    const list = document.getElementById('device-list');
    const closeBtn = document.getElementById('close-device-picker');
    const status = document.getElementById('device-discovery-status');

    if (!overlay || !list) return;

    overlay.classList.add('active');
    list.innerHTML = '<div class="loading-spinner">Recherche des appareils...</div>';
    status.textContent = 'Recherche en cours...';

    API.cast.discoverDevices();

    const closeHandler = () => {
        overlay.classList.remove('active');
        closeBtn.removeEventListener('click', closeHandler);
    };
    closeBtn.addEventListener('click', closeHandler);

    const deviceFoundHandler = (devices) => {
        list.innerHTML = '';
        if (devices.length === 0) {
            list.innerHTML = '<div class="empty-state">Aucun appareil trouvé.</div>';
            return;
        }

        devices.forEach(device => {
            const btn = document.createElement('button');
            btn.className = 'device-btn';
            btn.textContent = device.name;
            btn.addEventListener('click', () => {
                playOnDevice(device, videoPath);
                overlay.classList.remove('active');
            });
            list.appendChild(btn);
        });
        status.textContent = 'Appareils trouvés :';
    };

    window.api.removeAllListeners('cast-devices-found');
    window.api.on('cast-devices-found', deviceFoundHandler);
}

async function playOnDevice(device, videoPath) {
    try {
        showNotification(`Lancement sur ${device.name}...`, 'info');
        await API.cast.playOnDevice({
            deviceHost: device.host,
            devicePort: device.port,
            videoPath
        });
    } catch (error) {
        showNotification('Erreur lancement cast: ' + error, 'error');
    }
}
