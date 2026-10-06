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
    themeSelect: null,
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
    els.isVodInput = document.getElementById('alert-isvod-input');
    els.themeSelect = document.getElementById('alert-theme-select');
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
        connectPreviewWebSocket();

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
        const path = await API.openFileDialog([{ name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] }]);
        if (path) {
            const val = `file://${path.replace(/\\/g, '/')}`;
            els.imgInput.value = stripPrefix(val);
            updateConfigValue(currentType, 'image', val);
            saveConfig();
        }
    });

    els.imgClearBtn.addEventListener('click', () => {
        els.imgInput.value = '';
        updateConfigValue(currentType, 'image', '');
        saveConfig();
    });

    els.audioInput.style.cursor = 'pointer';
    els.audioInput.addEventListener('click', async () => {
        const path = await API.openFileDialog([{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac'] }]);
        if (path) {
            const val = `file://${path.replace(/\\/g, '/')}`;
            els.audioInput.value = stripPrefix(val);
            updateConfigValue(currentType, 'audio', val);
            saveConfig();
        }
    });

    els.audioClearBtn.addEventListener('click', () => {
        els.audioInput.value = '';
        updateConfigValue(currentType, 'audio', '');
        saveConfig();
    });


    els.volumeInput.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        els.volumeVal.textContent = `${Math.round(val * 100)}%`;
        updateConfigValue(currentType, 'volume', val);
    });

    els.durationInput.addEventListener('input', (e) => {
        updateConfigValue(currentType, 'duration', parseInt(e.target.value));
    });

    els.isVodInput.addEventListener('change', (e) => {
        updateConfigValue(currentType, 'isVod', e.target.checked);
    });



    let debounceTimer;
    els.themeCss.addEventListener('input', (e) => {
        currentConfig.customCSS = e.target.value;
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            updateGlobalThemePreview(currentConfig.customCSS);
        }, 500);
    });

    if (els.themeSelect) {
        els.themeSelect.addEventListener('change', async (e) => {
            const val = e.target.value;
            if (!val) {
                currentConfig.customCSS = '';
                currentConfig.currentTheme = '';
                els.themeCss.value = DEFAULT_CSS;
                updateGlobalThemePreview(DEFAULT_CSS);
                return;
            }
            try {
                const content = await window.api.invoke('get-theme-content', val);
                currentConfig.customCSS = content || '';
                currentConfig.currentTheme = val;
                els.themeCss.value = content || '';
                updateGlobalThemePreview(content || '');
            } catch (err) {
                console.error(err);
            }
        });
    }

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
            currentConfig.currentTheme = '';
            if (els.themeSelect) els.themeSelect.value = '';
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
        if (els.themeSelect) {
            els.themeSelect.value = currentConfig.currentTheme || '';
        }
        els.themeCss.value = currentConfig.customCSS || DEFAULT_CSS;
    } else {
        els.themeEditor.style.display = 'none';
        els.standardConfig.style.display = 'flex';

        const typeConfig = currentConfig[currentType] || {};
        const meta = EVENT_TYPES[currentType];


        els.widgetUrl.innerHTML = `http://127.0.0.1:${widgetPort}/widget/alerts?mode=main<br>http://127.0.0.1:${widgetPort}/widget/alerts?mode=vod-audio`;


        const stripPrefix = (path) => path ? path.replace(/^file:\/\/+/, '') : path;

        els.msgInput.value = typeConfig.textTemplate || meta.defaultText;
        els.imgInput.value = stripPrefix(typeConfig.image || '');
        els.audioInput.value = stripPrefix(typeConfig.audio || '');

        const vol = typeConfig.volume !== undefined ? typeConfig.volume : 0.5;
        els.volumeInput.value = vol;
        els.volumeVal.textContent = `${Math.round(vol * 100)}%`;

        els.durationInput.value = typeConfig.duration || 5000;
        els.isVodInput.checked = !!typeConfig.isVod;
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
    padding: clamp(10px, 2.5vh, 24px);
    gap: clamp(8px, 2vh, 18px);
    overflow: hidden;
    width: 100%;
    height: 100%;
}
.alert-image {
    width: 100%;
    flex: 1 1 0%;
    max-height: 70%;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
}
.alert-image img {
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
    display: block;
}
.alert-image:empty {
    display: none;
}
#alert-text-wrapper {
    width: 100%;
    flex: 0 0 auto;
    max-height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    gap: clamp(4px, 1vh, 10px);
    overflow: visible;
}
.alert-image:empty ~ #alert-text-wrapper {
    flex: 0 1 auto;
    max-height: 100%;
}
.alert-text {
    font-size: clamp(20px, 4.5vh, 28px);
    font-weight: 900;
    color: white;
    line-height: 1.25;
    word-wrap: break-word;
    overflow-wrap: break-word;
    word-break: break-word;
    max-width: 100%;
    text-align: center;
}
.alert-message {
    font-size: clamp(15px, 3vh, 22px);
    font-weight: 700;
    color: #eee;
    text-shadow: 0 4px 8px rgba(0, 0, 0, 0.8);
    line-height: 1.25;
    word-wrap: break-word;
    overflow-wrap: break-word;
    word-break: break-word;
    max-width: 100%;
    text-align: center;
}
.alert-message:empty {
    display: none;
}
.alert-username {
    padding-right: 6px;
    letter-spacing: 2px;
    font-weight: 900;
    color: #ffeb3b;
    text-shadow: 2px 2px #000000;
    display: inline-block;
    line-height: inherit;
}
.alert-amount,
.alert-months {
    font-weight: 800;
    color: #40c4ff;
}
`;

let previewTimer = null;
let previewFadeTimer = null;
let previewWs = null;
let previewWsTimer = null;

function setupPreview() {
    connectPreviewWebSocket();
}

function connectPreviewWebSocket() {
    if (previewWsTimer) {
        clearTimeout(previewWsTimer);
        previewWsTimer = null;
    }
    try {
        if (previewWs) {
            previewWs.onopen = null;
            previewWs.onclose = null;
            previewWs.onerror = null;
            previewWs.onmessage = null;
            previewWs.close();
        }
    } catch (e) { }

    const ws = new WebSocket(`ws://127.0.0.1:${widgetPort}`);
    previewWs = ws;

    ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'register-preview' }));
    };
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
    ws.onclose = () => {
        previewWsTimer = setTimeout(connectPreviewWebSocket, 2000);
    };
    ws.onerror = () => {
        ws.close();
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
    const wrapper = document.getElementById('alert-wrapper');
    const imgContainer = document.getElementById('alert-image-container');
    const textContainer = document.getElementById('alert-text');
    const msgContainer = document.getElementById('alert-message');

    if (!imgContainer || !wrapper) return;

    if (previewTimer) clearTimeout(previewTimer);
    if (previewFadeTimer) clearTimeout(previewFadeTimer);

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

    wrapper.classList.remove('animate-out');
    void wrapper.offsetWidth;
    wrapper.classList.add('animate-in');
    wrapper.style.opacity = '1';

    const duration = parseInt(alert.duration) || 5000;
    previewTimer = setTimeout(() => {
        wrapper.classList.remove('animate-in');
        wrapper.classList.add('animate-out');
        previewFadeTimer = setTimeout(() => {
            wrapper.classList.remove('animate-out');
            updatePreview(currentType);
        }, 500);
    }, duration);
}

function updatePreview(type = currentType) {
    if (type === 'themes') return;
    const typeConfig = currentConfig[type] || {};
    const meta = EVENT_TYPES[type] || { defaultText: '{username}' };

    const imgContainer = document.getElementById('alert-image-container');
    const textContainer = document.getElementById('alert-text');
    const msgContainer = document.getElementById('alert-message');
    const wrapper = document.getElementById('alert-wrapper');

    if (!imgContainer || !wrapper) return;

    if (previewTimer) clearTimeout(previewTimer);
    if (previewFadeTimer) clearTimeout(previewFadeTimer);

    imgContainer.innerHTML = '';
    if (typeConfig.image) {
        const img = document.createElement('img');
        img.src = transformLocalPath(typeConfig.image);
        img.onerror = (e) => console.error('[Preview] Image load failed:', e);
        imgContainer.appendChild(img);
    }

    if (textContainer) {
        const sampleText = (typeConfig.textTemplate || meta.defaultText)
            .replace('{username}', '<span class="alert-username">Zexal</span>')
            .replace('{amount}', '<span class="alert-amount">100</span>')
            .replace('{months}', '<span class="alert-months">12</span>')
            .replace('{s}', 's');
        textContainer.innerHTML = sampleText;
    }

    if (msgContainer) {
        msgContainer.innerHTML = (type === 'donation') ? 'Merci pour le don !' : '';
    }

    wrapper.classList.remove('animate-out');
    wrapper.classList.add('animate-in');
    wrapper.style.opacity = '1';
}

function updateGlobalThemePreview(css) {
    let style = document.getElementById('alert-preview-custom-css');
    if (!style) {
        style = document.createElement('style');
        style.id = 'alert-preview-custom-css';
        document.head.appendChild(style);
    }
    style.textContent = css || '';
}

async function saveConfig() {
    try {
        if (els.themeSelect) {
            currentConfig.currentTheme = els.themeSelect.value;
        }
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
        const typeConfig = currentConfig[currentType] || {};
        const meta = EVENT_TYPES[currentType] || { defaultText: '{username}' };

        const dummyData = {
            type: currentType,
            username: 'TestUser',
            amount: 100,
            text: (typeConfig.textTemplate || meta.defaultText)
                .replace('{username}', '<span class="alert-username">Zexal</span>')
                .replace('{amount}', '<span class="alert-amount">100</span>')
                .replace('{months}', '<span class="alert-months">12</span>')
                .replace('{s}', 's'),
            image: typeConfig.image || '',
            audio: typeConfig.audio || '',
            volume: typeConfig.volume !== undefined ? typeConfig.volume : 0.5,
            duration: typeConfig.duration || 5000,
            layout: typeConfig.layout,
            isVod: !!typeConfig.isVod
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
