import { NOTIFICATIONS, showStatus } from './ui.js';
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
    'donation': { label: 'Dons', defaultText: '{username} a fait un don de {amount} !' },
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
    themeCancelBtn: null
};

const alertsWidget = API.createWidgetHelper('alerts');

function init() {
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

    const stripPrefix = (path) => path ? path.replace(/^file:\/\//, '') : '';

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

    els.layoutSelect.addEventListener('change', (e) => updateConfigValue(currentType, 'layout', e.target.value));

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

            showStatus('alerts-status-msg', 'Thème réinitialisé avec succès', 'success');

            els.themeConfirmBtn.style.display = 'none';
            els.themeCancelBtn.style.display = 'none';
            els.themeResetBtn.style.display = 'inline-block';
        } catch (e) {
            console.error(e);
            showStatus('alerts-status-msg', 'Erreur réinitialisation', 'error');
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


        const stripPrefix = (path) => path ? path.replace(/^file:\/\//, '') : '';

        els.msgInput.value = typeConfig.textTemplate || meta.defaultText;
        els.imgInput.value = stripPrefix(typeConfig.image || '');
        els.audioInput.value = stripPrefix(typeConfig.audio || '');
        els.layoutSelect.value = typeConfig.layout || 'top';

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
}
.alert-image {
    max-width: 600px;
    margin-bottom: 20px;
}
.alert-image img {
    width: 100%;
    display: block;
    filter: drop-shadow(0 5px 15px rgba(0, 0, 0, 0.5));
}
.alert-text {
    font-size: 24px;
    font-weight: 900;
    color: white;
    line-height: 1.2;
}
.alert-message {
    font-size: 32px;
    font-weight: 700;
    color: #eee;
    text-shadow: 0 4px 8px rgba(0, 0, 0, 0.8);
    margin-top: 15px;
}
.alert-username {
    font-size: 22px;
    font-family: 'Road Rage', cursive !important;
    color: yellow;
    text-shadow: 4px 4px #000000;
}
`;

function setupPreview() {
    const container = document.getElementById('alert-preview-container');
    if (!container) return;

    if (!container.shadowRoot) {
        container.attachShadow({ mode: 'open' });
    }
    const shadow = container.shadowRoot;
    shadow.innerHTML = '';

    const structuralStyle = document.createElement('style');
    structuralStyle.textContent = `
        :host { display: block; width: 100%; height: 100%; position: relative; overflow: hidden; font-family: 'Inter', sans-serif; }
        * { box-sizing: border-box; }
        .alert-box {
            position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
            display: flex; flex-direction: column; align-items: center; justify-content: center;
            text-align: center;
            width: 100%; height: 100%; pointer-events: none;
            opacity: 0;
        }
        .alert-content { pointer-events: auto; }
        img { max-width: 100%; height: auto; }
    `;
    shadow.appendChild(structuralStyle);

    const fontContainer = document.createElement('div');
    fontContainer.style.display = 'none';
    fontContainer.innerHTML = '';
    shadow.appendChild(fontContainer);

    const themeStyle = document.createElement('style');
    themeStyle.id = 'theme-style';
    shadow.appendChild(themeStyle);

    const wrapper = document.createElement('div');
    wrapper.id = 'alert-wrapper';
    wrapper.className = 'alert-box';
    wrapper.innerHTML = `
        <div id="alert-image-container" class="alert-image"></div>
        <div class="alert-content">
            <div id="alert-text" class="alert-text"></div>
            <div id="alert-message" class="alert-message"></div>
        </div>
        <audio id="alert-audio"></audio>
    `;
    shadow.appendChild(wrapper);

    connectPreviewWebSocket(shadow);
}

function connectPreviewWebSocket(shadow) {
    const ws = new WebSocket(`ws://127.0.0.1:${widgetPort}`);
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'alert') {
                if (data.alert.type === 'reward-redemption') return;
                playShadowAlert(shadow, data.alert);
            } else if (data.type === 'skip') {
                const wrapper = shadow.getElementById('alert-wrapper');
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
            rawPath = rawPath.replace(/^file:\/\//, '');
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

function playShadowAlert(shadow, alert) {
    const wrapper = shadow.getElementById('alert-wrapper');
    const imgContainer = shadow.getElementById('alert-image-container');
    const textContainer = shadow.getElementById('alert-text');
    const msgContainer = shadow.getElementById('alert-message');
    const audio = shadow.getElementById('alert-audio');

    if (!wrapper) return;

    wrapper.className = 'alert-box';
    wrapper.classList.remove('animate-in', 'animate-out');
    void wrapper.offsetWidth;

    imgContainer.innerHTML = '';
    if (alert.image) {
        let imgPath = transformLocalPath(alert.image);
        const img = document.createElement('img');
        img.src = imgPath;
        img.onerror = (e) => console.error('[Preview] Image load failed:', e);
        imgContainer.appendChild(img);
    } else {
        imgContainer.innerHTML = '<div style="font-size:48px; color:#777;">[IMG]</div>';
    }

    textContainer.innerHTML = (alert.text || '')
        .replace('{username}', '<span class="alert-username">Pseudo</span>')
        .replace('{amount}', '<span class="alert-amount">100</span>')
        .replace('{months}', '<span class="alert-months">12</span>')
        .replace('{s}', 's');

    msgContainer.innerHTML = alert.message || '';

    if (alert.layout === 'side') wrapper.classList.add('layout-side-by-side');

    if (alert.audio) {
        audio.src = transformLocalPath(alert.audio);
        audio.volume = alert.volume !== undefined ? alert.volume : 0.5;
        // audio.play().catch(e => console.error('[Preview] Audio play failed:', e)); // Disable sound in app
    } else {
        audio.src = '';
    }

    wrapper.style.opacity = '1';
    wrapper.classList.add('animate-in');

    const duration = alert.duration || 5000;
    setTimeout(() => {
        wrapper.classList.remove('animate-in');
        wrapper.classList.add('animate-out');
        if (!audio.paused) {
            let fadeOut = setInterval(() => {
                if (audio.volume > 0.05) {
                    audio.volume = Math.max(0, audio.volume - 0.05);
                } else {
                    clearInterval(fadeOut);
                    audio.pause();
                    audio.currentTime = 0;
                }
            }, 50);
        }
    }, duration);
}

function updatePreview(type) {

    const container = document.getElementById('alert-preview-container');
    if (!container || !container.shadowRoot) return;

    const css = currentConfig.customCSS || '';
    const shadow = container.shadowRoot;
    const themeStyle = shadow.getElementById('theme-style') || shadow.querySelector('#preview-scaler #theme-style');

    const defaultThemeCSS = `
        .animate-in { animation: bounceIn 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards; }
        .animate-out { animation: fadeOut 0.5s ease forwards; }

        @keyframes bounceIn {
            0% { opacity: 0; transform: translate(-50%, -50%) scale(0.3); }
            50% { opacity: 1; transform: translate(-50%, -50%) scale(1.05); }
            70% { transform: translate(-50%, -50%) scale(0.9); }
            100% { opacity: 1; transform: translate(-50%, -50%) scale(1); }
        }
        @keyframes fadeOut {
            from { opacity: 1; transform: translate(-50%, -50%) scale(1); }
            to { opacity: 0; transform: translate(-50%, -50%) scale(0.8); }
        }

        .layout-side-by-side { flex-direction: row !important; }
        .layout-side-by-side .alert-image { margin-right: 20px; margin-bottom: 0; }
        
        .alert-text { 
            font-size: 24px; 
            font-weight: 900; 
            color: white; 
            text-shadow: 0 4px 8px rgba(0,0,0,0.8); 
            line-height: 1.2; 
        }
        .alert-message { 
            font-size: 16px; 
            font-weight: 700; 
            color: #eee; 
            text-shadow: 0 4px 8px rgba(0,0,0,0.8); 
            margin-top: 15px; 
        }
        .alert-image { max-width: 600px; margin-bottom: 30px; }
        .alert-image img { width: 100%; display: block; filter: drop-shadow(0 5px 15px rgba(0,0,0,0.5)); }
        
        .alert-username {
            font-size: 32px;
            font-family: 'Road Rage', cursive;
            color: yellow;
            letter-spacing: 0.2rem;
            text-shadow: 4px 4px #000000;
        }
    `;

    if (themeStyle) {
        themeStyle.textContent = css || defaultThemeCSS;
    }
}

function updateGlobalThemePreview(css) {
    updatePreview();
}

async function saveConfig() {
    try {
        await API.widgets.saveConfig('alerts', currentConfig);
        showStatus('alerts-status-msg', NOTIFICATIONS.SUCCESS.SAVED, 'success');
        return true;
    } catch (e) {
        console.error(e);
        showStatus('alerts-status-msg', NOTIFICATIONS.ERROR.SAVE, 'error');
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
        showStatus('alerts-status-msg', 'Erreur Test', 'error');
    }
}

document.addEventListener('DOMContentLoaded', init);
if (document.readyState === 'interactive' || document.readyState === 'complete') {
    init();
}
