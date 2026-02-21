import { NOTIFICATIONS, showNotification } from './ui.js';
import { API } from './api.js';

let currentType = 'follow';
let currentConfig = {};
let widgetPort = 8097;

let isInitialized = false;

const EVENT_TYPES = {
    'follow': { label: 'Follow', defaultText: '{username} suit la chaîne !' },
    'sub': { label: 'Sub', defaultText: '{username} s\'est abonné !' },
    'subgift': { label: 'Subgift', defaultText: '{username} a offert {amount} sub{s} !' },
    'resub': { label: 'Re-Sub', defaultText: '{username} s\'est réabonné ({months} mois) !' },
    'donation': { label: 'Dons', defaultText: '{username} a donné {amount}€' },
    'cheer': { label: 'Bits', defaultText: '{username} a envoyé {amount} bits !' },
    'raid': { label: 'Raid', defaultText: 'Raid de {username} !' },
    'hypetrain': { label: 'Hype Train', defaultText: 'Hype Train Niveau {amount} !' }
};

const els = {
    sidebar: null,
    standardConfig: null,
    themeEditor: null,
    widgetUrl: null,
    msgInput: null,
    imgInput: null,
    imgClearBtn: null,
    audioInput: null,
    audioClearBtn: null,
    layoutSelect: null,
    volumeInput: null,
    volumeVal: null,
    durationInput: null,
    themeCss: null,
    themeResetBtn: null,
    themeConfirmBtn: null,
    themeCancelBtn: null,
    previewContainer: null
};

const alertsWidget = API.createWidgetHelper('alerts');

async function init() {
    if (isInitialized) return;
    isInitialized = true;


    els.sidebar = document.querySelector('.alerts-sidebar');
    els.standardConfig = document.getElementById('alert-standard-config');
    els.themeEditor = document.getElementById('alert-theme-editor');
    els.widgetUrl = document.getElementById('alert-widget-url');
    els.msgInput = document.getElementById('alert-message-input');
    els.imgInput = document.getElementById('alert-image-input');
    els.imgClearBtn = document.getElementById('alert-image-clear-btn');
    els.audioInput = document.getElementById('alert-audio-input');
    els.audioClearBtn = document.getElementById('alert-audio-clear-btn');
    els.layoutSelect = document.getElementById('alert-layout-select');
    els.volumeInput = document.getElementById('alert-volume-input');
    els.volumeVal = document.getElementById('alert-volume-val');
    els.durationInput = document.getElementById('alert-duration-input');

    els.themeCss = document.getElementById('alert-theme-css');
    els.themeResetBtn = document.getElementById('alert-theme-reset-btn');
    els.themeConfirmBtn = document.getElementById('alert-theme-confirm-btn');
    els.themeCancelBtn = document.getElementById('alert-theme-cancel-btn');

    els.previewContainer = document.getElementById('alert-preview-container');

    setupEventListeners();
    setupPreview();

    updateSidebarState();


    alertsWidget.onRefresh((globalConfig, appConfig) => {
        currentConfig = globalConfig || {};

        if (appConfig && appConfig.alertsWidgetPort && appConfig.alertsWidgetPort !== 49968) {
            widgetPort = appConfig.alertsWidgetPort;
        } else {
            widgetPort = 8097;
        }

        updateSidebarState();
        updateUI();

        if (currentType === 'themes') {
            updateGlobalThemePreview(currentConfig.customCSS);
        } else {
            updatePreview(currentType);
        }
    });

    const saveBtn = document.getElementById('saveAlertsBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveConfig);

    const testBtn = document.getElementById('testAlertBtn');
    if (testBtn) testBtn.addEventListener('click', triggerTest);

    updatePreview();
}

function setupEventListeners() {

    const typeBtns = document.querySelectorAll('.alert-type-btn');
    typeBtns.forEach(btn => {
        const type = btn.dataset.type;
        if (type) {
            btn.addEventListener('click', (e) => {
                if (e.target.type !== 'checkbox') {
                    switchType(type);
                }
            });

            const checkbox = btn.querySelector('input[type="checkbox"]');
            if (checkbox) {
                checkbox.addEventListener('change', (e) => {
                    updateConfigValue(type, 'enabled', e.target.checked);
                });
            }
        }
    });


    els.msgInput.addEventListener('input', (e) => updateConfigValue(currentType, 'textTemplate', e.target.value));

    const stripPrefix = (path) => path ? path.replace(/^file:\/\/+/, '') : path;

    els.imgInput.style.cursor = 'pointer';
    els.imgInput.addEventListener('click', async () => {
        const path = await API.openFileDialog([{ name: 'Images', extensions: ['jpg', 'png', 'gif'] }]);
        if (path) {
            const val = `file://${path.replace(/\\/g, '/')}`;
            els.imgInput.value = stripPrefix(val);
            updateConfigValue(currentType, 'image', val);
        }
    });

    els.imgClearBtn.addEventListener('click', () => {
        els.imgInput.value = '';
        updateConfigValue(currentType, 'image', '');
    });

    els.audioInput.style.cursor = 'pointer';
    els.audioInput.addEventListener('click', async () => {
        const path = await API.openFileDialog([{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }]);
        if (path) {
            const val = `file://${path.replace(/\\/g, '/')}`;
            els.audioInput.value = stripPrefix(val);
            updateConfigValue(currentType, 'audio', val);
        }
    });

    els.audioClearBtn.addEventListener('click', () => {
        els.audioInput.value = '';
        updateConfigValue(currentType, 'audio', '');
    });


    els.volumeInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        els.volumeVal.textContent = `${Math.round(val * 100)}%`;
        updateConfigValue(currentType, 'volume', val);
    });

    els.durationInput.addEventListener('input', (e) => {
        updateConfigValue(currentType, 'duration', parseInt(e.target.value));
    });



    let debounceTimer;
    els.themeCss.addEventListener('input', (e) => {
        currentConfig.customCSS = e.target.value;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            updateGlobalThemePreview(currentConfig.customCSS);
        }, 500);
    });

    els.themeResetBtn.onclick = () => {
        els.themeResetBtn.style.display = 'none';
        els.themeConfirmBtn.style.display = 'inline-block';
        els.themeCancelBtn.style.display = 'inline-block';
    };

    els.themeCancelBtn.onclick = () => {
        els.themeConfirmBtn.style.display = 'none';
        els.themeCancelBtn.style.display = 'none';
        els.themeResetBtn.style.display = 'inline-block';
    };

    els.themeConfirmBtn.onclick = async () => {
        try {
            await API.widgets.resetConfig('alerts');



            currentConfig.customCSS = '';
            els.themeCss.value = DEFAULT_CSS;
            updateGlobalThemePreview(DEFAULT_CSS);

            showNotification('Thème réinitialisé avec succès', 'success');

            els.themeConfirmBtn.style.display = 'none';
            els.themeCancelBtn.style.display = 'none';
            els.themeResetBtn.style.display = 'inline-block';
        } catch (e) {
            console.error(e);
            showNotification('Erreur réinitialisation', 'error');
        }
    };
}

function updateUI() {
    if (currentType === 'themes') {
        els.standardConfig.style.display = 'none';
        els.themeEditor.style.display = 'flex';

        els.themeCss.value = currentConfig.customCSS || DEFAULT_CSS;
    } else {
        els.themeEditor.style.display = 'none';
        els.standardConfig.style.display = 'flex';

        const typeConfig = currentConfig[currentType] || {};
        const meta = EVENT_TYPES[currentType];


        els.widgetUrl.textContent = `http://127.0.0.1:${widgetPort}/widget/alerts`;


        const stripPrefix = (path) => path ? path.replace(/^file:\/\/+/, '') : path;

        els.msgInput.value = typeConfig.textTemplate || meta.defaultText;
        els.imgInput.value = stripPrefix(typeConfig.image || '');
        els.audioInput.value = stripPrefix(typeConfig.audio || '');

        const vol = typeConfig.volume !== undefined ? typeConfig.volume : 0.5;
        els.volumeInput.value = vol;
        els.volumeVal.textContent = `${Math.round(vol * 100)}%`;

        els.durationInput.value = typeConfig.duration || 5000;
    }
}

function updateConfigValue(type, key, value) {
    if (!currentConfig[type]) currentConfig[type] = {};
    currentConfig[type][key] = value;
    if (type !== 'themes') updatePreview(type);
}

function updateSidebarState() {
    document.querySelectorAll('.alert-type-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.type === currentType);
    });

    Object.keys(EVENT_TYPES).forEach(type => {
        const checkbox = document.getElementById(`check-${type}`);
        if (checkbox) {
            const typeConfig = currentConfig[type] || {};
            checkbox.checked = typeConfig.enabled !== false;
        }
    });
}

function switchType(type) {
    currentType = type;
    updateSidebarState();
    updateUI();

    if (type === 'themes') {
        updateGlobalThemePreview(currentConfig.customCSS);
    } else {
        updatePreview(type);
    }
}

const DEFAULT_CSS = `
.alert-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    box-sizing: border-box;
    padding: 15px;
    overflow: hidden;
}
.alert-image {
    margin-bottom: 10px;
    display: flex;
    justify-content: center;
    flex-shrink: 1;
    overflow: hidden;
}
.alert-image img {
    max-width: 80%;
    max-height: 45vh;
    object-fit: contain;
    display: block;
}
.alert-text {
    font-size: 24px;
    font-weight: 900;
    color: white;
    line-height: 1.2;
    word-wrap: break-word;
    overflow-wrap: break-word;
    max-width: 100%;
}
.alert-message {
    font-size: 32px;
    font-weight: 700;
    color: #eee;
    text-shadow: 0 4px 8px rgba(0, 0, 0, 0.8);
    margin-top: 15px;
    word-wrap: break-word;
    overflow-wrap: break-word;
    max-width: 100%;
}
.alert-username {
    padding-right: 8px;
    letter-spacing: 6px;
    font-size: 22px;
    font-family: 'Road Rage', cursive !important;
    color: yellow;
    text-shadow: 4px 4px #000000;
}
`;

function setupPreview() {
    connectPreviewWebSocket();
}

function connectPreviewWebSocket() {
    const ws = new WebSocket(`ws://127.0.0.1:${widgetPort}`);
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'alert') {
                if (data.alert.type === 'reward-redemption') return;
                playPreviewAlert(data.alert);
            } else if (data.type === 'skip') {
                const wrapper = document.getElementById('alert-wrapper');
                if (wrapper) wrapper.style.opacity = '0';
            }
        } catch (e) { console.error(e); }
    };
}

function transformLocalPath(path) {
    if (!path) return path;
    if (path.startsWith('http')) return path;

    try {
        let rawPath = path;
        if (rawPath.startsWith('file://')) {
            rawPath = rawPath.replace(/^file:\/\/+/, '');
        }

        try { rawPath = decodeURIComponent(rawPath); } catch (e) {
            console.error('[Preview] Decode error', e);
        }

        if (navigator.platform.toUpperCase().indexOf('WIN') >= 0 || rawPath.match(/^\/[a-zA-Z]:/)) {
            if (rawPath.startsWith('/')) rawPath = rawPath.substring(1);
        }

        return `http://127.0.0.1:${widgetPort}/local-file?path=${encodeURIComponent(rawPath)}`;
    } catch (e) {
        console.error('[Preview] Path transform error', e);
        return path;
    }
}

function playPreviewAlert(alert) {
    const imgContainer = document.getElementById('alert-image-container');
    const textContainer = document.getElementById('alert-text');
    const msgContainer = document.getElementById('alert-message');

    if (!imgContainer) return;

    imgContainer.innerHTML = '';
    if (alert.image) {
        const img = document.createElement('img');
        img.src = transformLocalPath(alert.image);
        img.onerror = (e) => console.error('[Preview] Image load failed:', e);
        imgContainer.appendChild(img);
    }

    if (textContainer) {
        textContainer.innerHTML = (alert.text || '');
    }

    if (msgContainer) {
        msgContainer.innerHTML = alert.message || '';
    }
}

function updatePreview(type) {
}

function updateGlobalThemePreview(css) {
}

async function saveConfig() {
    try {
        await API.widgets.saveConfig('alerts', currentConfig);
        showNotification(NOTIFICATIONS.SUCCESS.SAVED, 'success');
        return true;
    } catch (e) {
        console.error(e);
        showNotification(NOTIFICATIONS.ERROR.SAVE, 'error');
        return false;
    }
}

async function triggerTest() {
    try {
        const savedConfig = await API.widgets.getConfig('alerts');
        const config = (savedConfig && savedConfig[currentType]) ? savedConfig[currentType] : {};

        const dummyData = {
            type: currentType,
            username: 'TestUser',
            amount: 100,
            text: (config.textTemplate || EVENT_TYPES[currentType].defaultText)
                .replace('{username}', '<span class="alert-username">Zexal</span>')
                .replace('{amount}', '<span class="alert-amount">100</span>')
                .replace('{months}', '<span class="alert-months">12</span>')
                .replace('{s}', 's'),
            image: config.image,
            audio: config.audio,
            volume: config.volume,
            duration: config.duration,
            layout: config.layout
        };

        await API.alerts.triggerTest(dummyData);
    } catch (e) {
        console.error(e);
        showNotification('Erreur Test', 'error');
    }
}

document.addEventListener('DOMContentLoaded', init);
if (document.readyState === 'interactive' || document.readyState === 'complete') {
    init();
}
