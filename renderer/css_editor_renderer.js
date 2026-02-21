import { NOTIFICATIONS, showNotification, ICONS } from './ui.js';
import { initBuilder, generateCSS, parseCSS, setDefaults, setBaseThemeCSS, snapshotThemeValues, resetToTheme, loadSystemFonts } from './theme_builder.js';
import { BUILDER_SCHEMA } from './theme_builder_schema.js';
const api = window.api;

const defaultCss = {
    chat: `body {
    background: transparent;
    overflow: hidden;
    margin: 0;
    padding: 0;
    color: white;
    font-family: sans-serif;
}

#bg-video {
    display: none;
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    z-index: -1;
}

#chat-container {
    display: flex;
    flex-direction: column;
    height: 100vh;
    box-sizing: border-box;
}

.msg-group {
    word-wrap: break-word;
}

.msg-header {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
}

.msg-badges {
    display: inline-flex;
    align-items: center;
    gap: 4px;
}

.badge-img {
    height: auto;
    object-fit: contain;
}

.msg-messages {
    display: flex;
    flex-direction: column;
}

.msg-line img {
    vertical-align: middle;
}

@keyframes slideInBottom {
    from {
        opacity: 0;
        transform: translateY(20px);
    }

    to {
        opacity: 1;
        transform: translateY(0);
    }
}`,
    spotify: `body {
    background: transparent;
    margin: 0;
    padding: 0;
    font-family: "Inter", "Segoe UI", sans-serif;
    color: #f5f7fb;
    overflow: hidden;
}

#spotify-wrapper {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100vw;
    height: 100vh;
    transition: opacity 0.35s ease;
}

#spotify-wrapper.is-hidden {
    opacity: 0;
    pointer-events: none;
}

.spotify-card {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 12px;
    padding: 14px;
    border-radius: 16px;
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 15px 40px rgba(0, 0, 0, 0.45);
    backdrop-filter: blur(8px);
    color: #f5f7fb;
    max-width: 520px;
    box-sizing: border-box;
}

.spotify-cover {
    width: 140px;
    height: 140px;
    border-radius: 12px;
    object-fit: cover;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4);
    background: #111;
}

.spotify-infos {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.spotify-title {
    font-size: 20px;
    font-weight: 700;
    line-height: 1.2;
}

.spotify-artist {
    font-size: 16px;
    color: #cdd7e5;
}

.spotify-album {
    font-size: 14px;
    color: #9fb4d1;
}

.pill {
    align-self: flex-start;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    font-size: 12px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: #d3deef;
}
    `,
    'emote-wall': `body {
    background: transparent;
    overflow: hidden;
    margin: 0;
    padding: 0;
    width: 100vw;
    height: 100vh;
}

.emote {
    position: absolute;
    will-change: transform, opacity;
    pointer-events: none;
}`,
    subgoals: `body { margin: 0; padding: 0; overflow: hidden; font-family: 'Inter', sans-serif; background: transparent; }

#widget-container { width: 100vw; height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 20px; box-sizing: border-box; }

.progress-container { position: relative; width: 100%; max-width: 800px; height: 40px; background: rgba(0, 0, 0, 0.5); border-radius: 20px; border: 2px solid rgba(255, 255, 255, 0.2); }
.markers-container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 18px; pointer-events: none; z-index: 5; }
.progress-bar { height: 100%; background: linear-gradient(90deg, #ff00cc, #333399); width: 0%; border-radius: 18px; transition: width 0.3s ease; position: relative; box-shadow: 0 0 10px rgba(255, 0, 204, 0.5); z-index: 1; }
.progress-text { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; font-weight: 800; font-size: 1.2rem; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8); z-index: 10; white-space: nowrap; }

.step-marker { position: absolute; top: 0; bottom: 0; width: 2px; background: rgba(255, 255, 255, 0.8); pointer-events: none; display: flex; flex-direction: column; align-items: center; overflow: visible; transform: translateX(-50%); }
.step-label { position: absolute; top: -35px; background: rgba(0, 0, 0, 0.8); color: #fff; padding: 6px 10px; border-radius: 6px; font-size: 0.9rem; white-space: nowrap; border: 1px solid rgba(255, 255, 255, 0.3); z-index: 6; box-shadow: 0 4px 6px rgba(0,0,0,0.3); left: 50%; transform: translateX(-50%); --arrow-pos: 50%; }
.step-label::after { content: ''; position: absolute; bottom: -5px; left: var(--arrow-pos); transform: translateX(-50%); border-width: 5px 5px 0; border-style: solid; border-color: rgba(0, 0, 0, 0.8) transparent transparent transparent; }`,
    'subgoals-list': `body {
    margin: 0;
    padding: 0;
    overflow: hidden;
    font-family: 'Inter', sans-serif;
    background: transparent;
    color: white;
}

#widget-container {
    width: 100vw;
    height: 100vh;
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: flex-start;
    padding: 20px;
    box-sizing: border-box;
}

.subgoals-list {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
}

.subgoal-item {
    font-size: 1.2rem;
    font-weight: 600;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    gap: 10px;
}

.subgoal-count {
    font-weight: 800;
    color: #ff00cc;
}

.subgoal-label {
    color: white;
}`
};

let cssInput, maxMessagesInput, statusBar, nameLabel;
let currentWidget = 'chat';
let currentWidgetConfig = {};

function setStatus(msg, type = 'success') {
    showNotification(msg, type);
    if (statusBar) {
        statusBar.textContent = msg;
        setTimeout(() => { if (statusBar.textContent === msg) statusBar.textContent = ''; }, 3000);
    }
}

const cssClasses = {
    chat: [
        { class: '.msg-group', desc: 'Conteneur principal d\'un groupe de messages' },
        { class: '.msg-header', desc: 'En-tête contenant le nom et les badges' },
        { class: '.msg-username', desc: 'Pseudo' },
        { class: '.msg-badges', desc: 'Conteneur des badges' },
        { class: '.badge-img', desc: 'Badge' },
        { class: '.msg-messages', desc: 'Conteneur des lignes de message' },
        { class: '.msg-line', desc: 'Ligne de message' },
        { class: '.user-<username>', desc: 'Classe dynamique pour cibler un utilisateur spécifique (ex: .user-alice)' },
        { class: 'var(--user-color)', desc: 'Couleur du pseudo' },
        { class: 'var(--user-color-soft)', desc: 'Couleur du pseudo avec transparence (0.15)' },
        { class: 'var(--text-primary)', desc: 'Couleur du texte' },
        { class: 'var(--text-shadow)', desc: 'Ombre portée du texte' }
    ],
    spotify: [
        { class: '#spotify-wrapper', desc: 'Conteneur principal centré' },
        { class: '.spotify-card', desc: 'Carte contenant la pochette et les infos' },
        { class: '.spotify-cover', desc: 'Pochette' },
        { class: '.spotify-infos', desc: 'Conteneur des informations textuelles' },
        { class: '.spotify-title', desc: 'Titre' },
        { class: '.spotify-artist', desc: 'Artiste' },
        { class: '.spotify-album', desc: 'Album' },
        { class: '.pill', desc: 'Badge "En lecture"' },
        { class: 'var(--spotify-bg)', desc: 'Couleur de fond de la carte' },
        { class: 'var(--spotify-border)', desc: 'Bordure de la carte' },
        { class: 'var(--spotify-shadow)', desc: 'Ombre de la carte' },
        { class: 'var(--text-primary)', desc: 'Couleur du titre' },
        { class: 'var(--text-secondary)', desc: 'Couleur de l\'artiste' },
        { class: 'var(--text-tertiary)', desc: 'Couleur de l\'album' },
        { class: 'var(--pill-bg)', desc: 'Fond du badge "En lecture"' }
    ],
    subgoals: [
        { class: '.progress-container', desc: 'Conteneur principal de la barre' },
        { class: '.progress-bar', desc: 'La barre de progression elle-même' },
        { class: '.progress-text', desc: 'Texte indiquant le nombre de subs (ex: 50 / 100 Subs)' },
        { class: '.step-marker', desc: 'Ligne verticale marquant une étape' },
        { class: '.step-label', desc: 'Étiquette textuelle d\'une étape' }
    ],
    'subgoals-list': [
        { class: '.subgoals-list', desc: 'Liste des objectifs (<ul>)' },
        { class: '.subgoal-item', desc: 'Élément de la liste (<li>)' },
        { class: '.subgoal-count', desc: 'Le nombre de subs requis (ex: +10)' },
        { class: '.subgoal-label', desc: 'Le titre de l\'objectif' }
    ],
    roulette: [
        { class: '#wheel-container', desc: 'Conteneur de la roue (Canvas)' },
        { class: '#list-container', desc: 'Conteneur de la liste' },
        { class: '.list-item', desc: 'Élément de la liste' },
        { class: '.list-center-marker', desc: 'Marqueur central (liste)' },
        { class: '#winner-display', desc: 'Affichage du gagnant' }
    ]
};

async function loadThemes(widget) {
    try {
        const result = await api.invoke('get-themes', widget);
        const themes = result.themes || [];

        const selector = document.getElementById('themeSelector');
        if (!selector) return;

        selector.innerHTML = '<option value="">Défaut</option>';
        themes.forEach(t => {
            const id = t.id || t;
            const name = t.name || id.replace('.css', '');

            if (widget) {
                const standardPrefix = widget + '_';
                if (!id.startsWith(standardPrefix) && !id.startsWith('theme_')) {
                    return;
                }
            }

            const opt = document.createElement('option');
            opt.value = id;
            opt.textContent = name;
            selector.appendChild(opt);
        });
    } catch (e) {
        console.error('Error loading themes:', e);
        setStatus('Erreur chargement thèmes: ' + e.message, 'err');
    }
}

function openConfigEditor() {
    const modal = document.getElementById('themeConfigModal');
    const container = document.getElementById('themeListContainer');
    container.innerHTML = '';

    const selector = document.getElementById('themeSelector');
    const options = Array.from(selector.options).filter(o => o.value);

    options.forEach(opt => {
        const row = document.createElement('div');
        row.className = 'theme-config-row';

        const label = document.createElement('div');
        label.className = 'theme-config-filename';
        label.textContent = opt.value;

        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'theme-name-input';
        input.placeholder = 'Nom affiché';
        input.value = opt.text === opt.value.replace('.css', '') ? '' : opt.text;
        input.dataset.filename = opt.value;

        const controls = document.createElement('div');
        controls.style.display = 'flex';
        controls.style.gap = '5px';
        controls.style.marginLeft = '10px';

        const delBtn = document.createElement('button');
        delBtn.className = 'control-button';
        delBtn.innerHTML = ICONS.trash;
        delBtn.title = 'Supprimer ce thème';

        const confirmBtn = document.createElement('button');
        confirmBtn.className = 'control-button confirm-btn';
        confirmBtn.style.display = 'none';
        confirmBtn.innerHTML = ICONS.confirm;
        confirmBtn.title = 'Confirmer';

        const cancelBtn = document.createElement('button');
        cancelBtn.className = 'control-button cancel-btn';
        cancelBtn.style.display = 'none';
        cancelBtn.innerHTML = ICONS.cancel;
        cancelBtn.title = 'Annuler';

        delBtn.onclick = () => {
            delBtn.style.display = 'none';
            confirmBtn.style.display = 'flex';
            cancelBtn.style.display = 'flex';
        };

        cancelBtn.onclick = () => {
            confirmBtn.style.display = 'none';
            cancelBtn.style.display = 'none';
            delBtn.style.display = 'flex';
        };

        confirmBtn.onclick = async () => {
            try {
                const res = await api.invoke('delete-theme', currentWidget, opt.value);
                if (res.success) {
                    row.remove();
                    await loadThemes(currentWidget);
                    setStatus(NOTIFICATIONS.SUCCESS.THEME_DELETED, 'ok');
                } else {
                    alert(NOTIFICATIONS.ERROR.DELETE.replace('{error}', res.message));
                }
            } catch (e) {
                alert(NOTIFICATIONS.ERROR.GENERIC.replace('{error}', e));
            }
        };

        controls.appendChild(delBtn);
        controls.appendChild(confirmBtn);
        controls.appendChild(cancelBtn);

        row.appendChild(label);
        row.appendChild(input);
        row.appendChild(controls);
        container.appendChild(row);
    });

    modal.style.display = 'flex';
}

async function loadWidgetConfig(widgetName) {
    if (widgetName) currentWidget = widgetName;
    if (nameLabel) {
        nameLabel.textContent = currentWidget === 'chat' ? 'du tchat' :
            currentWidget === 'spotify' ? 'de Spotify' :
                currentWidget === 'subgoals' ? 'du Subgoals' :
                    currentWidget === 'subgoals-list' ? 'de la Liste Subgoals' :
                        currentWidget === 'roulette' ? 'de la Roulette' :
                            'du mur d\'emotes';
    }

    const maxRow = document.getElementById('maxMessagesRow');
    if (maxRow) {
        if (currentWidget === 'chat') {
            maxRow.style.display = 'block';
        } else {
            maxRow.style.display = 'none';
        }
    }

    try {
        const config = await api.invoke('get-widget-config', currentWidget);
        currentWidgetConfig = config || {};

        const savedCss = currentWidgetConfig.customCSS || '';
        if (cssInput) cssInput.value = savedCss;

        if (currentWidget === 'chat' && maxMessagesInput) {
            maxMessagesInput.value = currentWidgetConfig.maxMessages || 10;
        }

        await loadThemes(currentWidget);

        if (currentWidgetConfig.currentTheme) {
            const selector = document.getElementById('themeSelector');
            if (selector) {
                const options = Array.from(selector.options).map(o => o.value);
                if (options.includes(currentWidgetConfig.currentTheme)) {
                    selector.value = currentWidgetConfig.currentTheme;
                }
            }
            try {
                const themeContent = await api.invoke('get-theme-content', currentWidgetConfig.currentTheme);
                setBaseThemeCSS(themeContent || '');
            } catch (e) {
                setBaseThemeCSS('');
            }
        } else {
            setBaseThemeCSS('');
        }

        setDefaults(currentWidget);

        if (currentWidgetConfig.currentTheme) {
            // Parse theme content to get theme defaults, then snapshot
            try {
                const themeContent = await api.invoke('get-theme-content', currentWidgetConfig.currentTheme);
                if (themeContent) {
                    parseCSS(themeContent, currentWidget);
                }
            } catch (e) { /* theme file not found */ }
            snapshotThemeValues();

            // Now parse saved CSS to pick up any user overrides
            if (savedCss) {
                parseCSS(savedCss, currentWidget);
            }
        } else {
            // No theme: just parse saved CSS
            if (savedCss) {
                parseCSS(savedCss, currentWidget);
            }
        }

        previewInitialized = false;
        initThemeBuilder();
        syncBuilderToPreview();
    } catch (e) {
        setStatus(NOTIFICATIONS.ERROR.LOAD.replace('{error}', e), 'err');
    }
}

async function saveWidgetConfig() {
    try {
        if (!cssInput) return;
        const css = cssInput.value;
        const themeSelector = document.getElementById('themeSelector');
        const update = {
            customCSS: css,
            currentTheme: themeSelector ? themeSelector.value : ''
        };

        if (currentWidget === 'chat' && maxMessagesInput) {
            update.maxMessages = parseInt(maxMessagesInput.value, 10) || 10;
        }

        const result = await api.invoke('save-widget-config', currentWidget, update);
        if (result.success) {
            setStatus(NOTIFICATIONS.SUCCESS.SAVED, 'ok');
            const config = await api.invoke('get-widget-config', currentWidget);
            currentWidgetConfig = config || {};
        } else {
            setStatus(NOTIFICATIONS.ERROR.SAVE, 'err');
        }
    } catch (e) {
        setStatus(NOTIFICATIONS.ERROR.GENERIC.replace('{error}', e), 'err');
    }
}

function getChatPreviewHtml(customCss, max) {
    return `<!DOCTYPE html>
    <html>
        <head>
            <style>
                ${defaultCss.chat}
            </style>
            <style id="custom-css">
                ${customCss}
            </style>
        </head>
        <body>
            <video id="bg-video" loop autoplay muted playsinline>
                <source src="http://127.0.0.1:8087/widget/assets/pranax.webm" type="video/webm">
            </video>
            <div id="chat-container"></div>
            <script>
                const container = document.getElementById('chat-container');
                const MAX_MESSAGES = ${max};

                const demo = [
                {u: 'Alice', c: '#6dd4ff', b: [{set: 'staff', version: '1' }], t: 'Hello world!' },
                {u: 'Bob', c: '#ff8b3d', b: [{set: 'moderator', version: '1' }], t: 'Ceci est un test.' },
                {u: 'Bob', c: '#ff8b3d', b: [{set: 'moderator', version: '1' }], t: 'Deuxieme ligne meme user.' },
                {u: 'Chloe', c: '#9b59b6', b: [], t: 'Nice overlay!' },
                {u: 'Eve', c: '#e67e22', b: [], t: 'Short msg.' }
                ];

                let lastUser = null;
                let lastGroup = null;
                let groupCounter = 0;

                function sanitizeClass(str) {
                    const clean = String(str || '').toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/^-+|-+$/g, '');
                    return clean || 'user';
                }

                function computeColors(hexColor) {
                    const fallback = '#6dd4ff';
                    let c = (hexColor || '').trim();
                    if (!/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c)) c = fallback;
                    if (c.length === 4) c = '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3];
                    const r = parseInt(c.slice(1, 3), 16), g = parseInt(c.slice(3, 5), 16), b = parseInt(c.slice(5, 7), 16);
                    return {solid: c, soft: 'rgba(' + r + ', ' + g + ', ' + b + ', 0.15)' };
                }

                function createBadge(entry) {
                    if (!entry || !entry.set || !entry.version) return null;
                    const img = document.createElement('img');
                    img.className = 'badge-img';
                    img.src = 'https://static-cdn.jtvnw.net/badges/v1/' + entry.set + '/' + entry.version + '/1';
                    img.alt = entry.set;
                    img.onerror = () => img.remove();
                    return img;
                }

                function addMessage(m) {
                    const colors = computeColors(m.c);
                    const sameUser = lastUser === m.u && lastGroup;
                    let group = lastGroup;

                    if (!sameUser) {
                        group = document.createElement('div');
                        const isEven = (groupCounter % 2) === 0;
                        const variant = (groupCounter % 3) + 1;
                        group.className = 'msg-group user-' + sanitizeClass(m.u) + ' group-' + (isEven ? 'even' : 'odd') + ' variant-' + variant;
                        groupCounter++;

                        group.style.setProperty('--user-color', colors.solid);
                        group.style.setProperty('--user-color-soft', colors.soft);

                        const header = document.createElement('div');
                        header.className = 'msg-header';

                        const name = document.createElement('span');
                        name.className = 'msg-username';
                        name.textContent = m.u;
                        name.style.color = colors.solid;

                        header.appendChild(name);

                        const badgesWrap = document.createElement('span');
                        badgesWrap.className = 'msg-badges';
                        (m.b || []).forEach(b => {
                            const node = createBadge(b);
                            if (node) badgesWrap.appendChild(node);
                        });

                        if (badgesWrap.children.length) header.appendChild(badgesWrap);

                        const messagesDiv = document.createElement('div');
                        messagesDiv.className = 'msg-messages';

                        group.appendChild(header);
                        group.appendChild(messagesDiv);
                        container.appendChild(group);

                        lastGroup = group;
                        lastUser = m.u;
                    }

                    const messagesDiv = group.querySelector('.msg-messages');
                    const line = document.createElement('div');
                    line.className = 'msg-line';
                    line.textContent = m.t;
                    messagesDiv.appendChild(line);

                    while (container.children.length > MAX_MESSAGES) {
                        container.removeChild(container.firstChild);
                    }
                }

                let i = 0;
                function loop() {
                    addMessage(demo[i]);
                    i = (i + 1) % demo.length;
                    setTimeout(loop, 2000);
                }
                loop();
            <\/script>
        </body>
    </html>`;
}

function getSpotifyPreviewHtml(customCss, config) {
    const title = "Song Title";
    const artist = "Artist Name";
    const album = "Album Name";
    const cover = "https://via.placeholder.com/140";

    return `<!DOCTYPE html>
    <html>
        <head>
            <style>
                ${defaultCss.spotify}
            </style>
            <style id="custom-css">
                ${customCss}
            </style>
        </head>
        <body>
            <div id="spotify-wrapper">
                <div class="spotify-card">
                    <img class="spotify-cover" src="${cover}" alt="cover">
                        <div class="spotify-infos">
                            <div class="pill">En lecture</div>
                            <div class="spotify-title">${title}</div>
                            <div class="spotify-artist">${artist}</div>
                            <div class="spotify-album">${album}</div>
                        </div>
                </div>
            </div>
        </body>
    </html>`;
}

let previewInitialized = false;
let lastPreviewWidget = null;

function renderPreview() {
    const frame = document.getElementById('preview-frame');
    if (!frame) return;

    const css = (cssInput && cssInput.value || '').trim();
    const max = maxMessagesInput ? (parseInt(maxMessagesInput.value, 10) || 10) : 10;
    if (previewInitialized && lastPreviewWidget === currentWidget) {
        try {
            const doc = frame.contentDocument || frame.contentWindow.document;
            const styleEl = doc.getElementById('custom-css');
            if (styleEl) {
                styleEl.textContent = css;
                return;
            }
        } catch (e) { }
    }

    let html = '';
    if (currentWidget === 'spotify') {
        html = getSpotifyPreviewHtml(css, currentWidgetConfig);
    } else if (currentWidget === 'chat') {
        html = getChatPreviewHtml(css, max);
    } else if (currentWidget === 'subgoals') {
        html = getSubgoalsPreviewHtml(css);
    } else if (currentWidget === 'subgoals-list') {
        html = getSubgoalsListPreviewHtml(css);
    } else if (currentWidget === 'roulette') {
        html = getRoulettePreviewHtml(css);
    } else {
        html = `<!DOCTYPE html><html><head><style>${defaultCss[currentWidget] || ''}</style><style id="custom-css">${css}</style></head><body><div style="color:white;padding:20px;">Aperçu non disponible pour ce widget</div></body></html>`;
    }

    frame.srcdoc = html;
    lastPreviewWidget = currentWidget;
    previewInitialized = true;
}

function getRoulettePreviewHtml(customCss) {
    return `<!DOCTYPE html>
    <html>
    <head>
        <meta charset="UTF-8">
        <style>
            ${defaultCss.roulette || ''}
        </style>
        <style id="custom-css">
            ${customCss}
        </style>
    </head>
    
    <body>
    
        <!-- Wheel View -->
        <div id="wheel-container">
            <div id="pointer"></div>
            <canvas id="wheel" width="1000" height="1000"></canvas>
            <div id="hub">SPIN</div>
        </div>
    
        <!-- List View -->
        <div id="list-container">
            <div class="list-center-marker"></div>
            <div id="list-scroll-view" class="list-scroll-view">
                <!-- Static items for preview -->
                <div class="list-item" style="color:#ffffff;">CHOIX 1</div>
                <div class="list-item" style="color:#ffffff;">CHOIX 2</div>
                <div class="list-item" style="color:#ffffff;">CHOIX 3</div>
                <div class="list-item" style="color:#ffffff;">CHOIX 4</div>
                <div class="list-item" style="color:#ffffff;">CHOIX 5</div>
            </div>
        </div>
    
        <div id="winner-display"></div>
    
        <script>
            // Minimal JS to render static wheel if visible
            const canvas = document.getElementById('wheel');
            const ctx = canvas.getContext('2d');
            
            const choices = ["Rouge", "Bleu", "Jaune", "Noir", "Blanc"];
            const COLORS = [
                { bg: '#ecf0f1', text: '#2c3e50' },
                { bg: '#2c3e50', text: '#ecf0f1' },
                { bg: '#3498db', text: '#ffffff' },
                { bg: '#f1c40f', text: '#2c3e50' },
                { bg: '#e74c3c', text: '#ffffff' }
            ];
            
            function drawWheel() {
                if (!canvas) return;
                const arc = Math.PI * 2 / choices.length;
                const outsideRadius = 480;
                const textRadius = 360;
                
                ctx.translate(500, 500);
                
                for (let i = 0; i < choices.length; i++) {
                    const angle = i * arc;
                    const style = COLORS[i % COLORS.length];
                    
                    ctx.fillStyle = style.bg;
                    ctx.beginPath();
                    ctx.arc(0, 0, outsideRadius, angle, angle + arc, false);
                    ctx.arc(0, 0, 0, angle + arc, angle, true);
                    ctx.fill();
                    
                    ctx.save();
                    ctx.fillStyle = style.text;
                    ctx.rotate(angle + arc / 2 + Math.PI);
                    ctx.translate(-textRadius, 0); 
                    ctx.restore();
                }
            }
            
            // List Visuals Logic (FISHEYE)
            const listContainer = document.getElementById('list-container');
            const listScrollView = document.getElementById('list-scroll-view');
            const listItemHeight = 44; // Must match widget
            
            function updatePreviewVisuals() {
                if (getComputedStyle(listContainer).display === 'none') {
                    requestAnimationFrame(updatePreviewVisuals);
                    return;
                }
                
                const containerCenter = listContainer.clientHeight / 2;
                const currentTranslateY = 0; 
                
                const items = listScrollView.children;
                const totalItems = items.length;

                for (let i = 0; i < totalItems; i++) {
                    const item = items[i];
                    
                    const itemTop = (i * listItemHeight) + currentTranslateY;
                    const itemCenter = itemTop + (listItemHeight / 2);
                    const signedDist = itemCenter - containerCenter; 
                    const dist = Math.abs(signedDist);
                    
                    let scale = 0.8;
                    let opacity = 1;
                    let fontWeight = '400';
                    let translateY = 0;

                    if (dist < 28) {
                        scale = 1.6;
                        fontWeight = '800';
                        translateY = 0;
                    } else if (dist < 60) {
                        scale = 1.25;
                        fontWeight = '600';
                        translateY = signedDist > 0 ? 18 : -18;
                    } else if (dist < 100) {
                         scale = 0.95;
                         fontWeight = '400';
                        translateY = signedDist > 0 ? 32 : -32;
                    } else {
                         scale = 0.7;
                         translateY = signedDist > 0 ? 48 : -48;
                    }
                    
                    item.style.transform = 'scale(' + scale + ') translateY(' + translateY + 'px)';
                    item.style.opacity = opacity;
                    item.style.fontWeight = fontWeight;
                }
                requestAnimationFrame(updatePreviewVisuals);
            }
            
            drawWheel(); 
            updatePreviewVisuals();
        </script>
    </body>
    </html>`;
}

function getSubgoalsListPreviewHtml(customCss) {
    return `<!DOCTYPE html>
    <html>
        <head>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
                ${defaultCss['subgoals-list']}
            </style>
            <style id="custom-css">
                ${customCss}
            </style>
        </head>
        <body>
            <div id="widget-container">
                <ul class="subgoals-list">
                    <li class="subgoal-item">
                        <span class="subgoal-count">+10</span>
                        <span class="subgoal-label"> : Karaoké</span>
                    </li>
                    <li class="subgoal-item">
                        <span class="subgoal-count">+25</span>
                        <span class="subgoal-label"> : Cosplay</span>
                    </li>
                    <li class="subgoal-item">
                        <span class="subgoal-count">+50</span>
                        <span class="subgoal-label"> : Horror Game</span>
                    </li>
                </ul>
            </div>
        </body>
    </html>`;
}

function getSubgoalsPreviewHtml(customCss) {
    return `<!DOCTYPE html>
    <html>
        <head>
            <style>
                @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
                ${defaultCss.subgoals}
            </style>
            <style id="custom-css">
                ${customCss}
            </style>
        </head>
        <body>
            <div id="widget-container">
                <div class="progress-container">
                    <div class="markers-container">
                        <div class="step-marker" style="left: 75%;">
                            <div class="step-label" style="display: block; transform: translateX(-50%); --arrow-pos: 50%">Step 1 (+50)</div>
                        </div>
                    </div>
                    <div class="progress-bar" style="width: 50%"></div>
                    <div class="progress-text">50 / 100 Subs</div>
                </div>
            </div>
        </body>
    </html>`;
}


function updateCssGuide() {
    const classes = cssClasses[currentWidget] || [];
    const cssGuideWidgetName = document.getElementById('cssGuideWidgetName');
    const cssGuideBody = document.getElementById('cssGuideBody');

    if (cssGuideWidgetName) cssGuideWidgetName.textContent = currentWidget;
    if (cssGuideBody) {
        cssGuideBody.innerHTML = classes.map(c => `
            <tr>
                <td class="class-name">${c.class}</td>
                <td class="description">${c.desc}</td>
            </tr>
        `).join('');
    }
}

function toggleCssGuide(show, shouldResize = false) {
    const cssGuidePanel = document.getElementById('cssGuidePanel');
    if (!cssGuidePanel) return;

    const isVisible = show !== undefined ? show : cssGuidePanel.style.display === 'none';

    if (shouldResize && isVisible !== (cssGuidePanel.style.display !== 'none')) {
        const delta = isVisible ? 350 : -350;
        api.invoke('resize-css-editor', delta);
    }

    cssGuidePanel.style.display = isVisible ? 'flex' : 'none';
    localStorage.setItem('cssGuideVisible', isVisible);
}

function init() {
    cssInput = document.getElementById('customCss');
    maxMessagesInput = document.getElementById('maxMessages');
    statusBar = document.getElementById('statusBar');
    nameLabel = document.getElementById('widgetNameLabel');

    const saveBtn = document.getElementById('save-btn');
    if (saveBtn) saveBtn.addEventListener('click', saveWidgetConfig);

    const resetBtn = document.getElementById('reset-btn');
    if (resetBtn) {
        let resetTimeout;

        resetBtn.addEventListener('click', async () => {
            if (!resetBtn.classList.contains('confirming')) {
                resetBtn.classList.add('confirming');
                resetBtn.textContent = 'Sûr ?';
                resetBtn.classList.add('btn-danger');
                resetTimeout = setTimeout(() => {
                    resetBtn.classList.remove('confirming');
                    resetBtn.textContent = 'Remettre par défaut';
                    resetBtn.classList.remove('btn-danger');
                }, 3000);
                return;
            }

            clearTimeout(resetTimeout);
            resetBtn.classList.remove('confirming');
            resetBtn.textContent = 'Remettre par défaut';
            resetBtn.classList.remove('btn-danger');

            const themeSelector = document.getElementById('themeSelector');
            const selectedTheme = themeSelector ? themeSelector.value : '';

            if (selectedTheme) {
                // Theme active: reset to theme defaults (keep theme selected)
                resetToTheme();
                previewInitialized = false;
                initThemeBuilder();
                syncBuilderToPreview();

                // Save the theme's original CSS (no overrides)
                try {
                    const themeContent = await api.invoke('get-theme-content', selectedTheme);
                    await api.invoke('save-widget-config', currentWidget, {
                        customCSS: themeContent || '',
                        currentTheme: selectedTheme
                    });
                    const config = await api.invoke('get-widget-config', currentWidget);
                    currentWidgetConfig = config || {};
                    setStatus(NOTIFICATIONS.SUCCESS.RESET, 'ok');
                } catch (err) {
                    setStatus(NOTIFICATIONS.ERROR.GENERIC.replace('{error}', err), 'err');
                }
            } else {
                // No theme: clear everything, revert to app defaults
                if (cssInput) cssInput.value = '';

                try {
                    await api.invoke('save-widget-config', currentWidget, {
                        customCSS: '',
                        currentTheme: ''
                    });
                    const config = await api.invoke('get-widget-config', currentWidget);
                    currentWidgetConfig = config || {};
                    setStatus(NOTIFICATIONS.SUCCESS.RESET, 'ok');
                } catch (err) {
                    setStatus(NOTIFICATIONS.ERROR.GENERIC.replace('{error}', err), 'err');
                }

                setBaseThemeCSS('');
                setDefaults(currentWidget);
                previewInitialized = false;
                initThemeBuilder();
                syncBuilderToPreview();
            }
        });
    }

    const closeBtn = document.getElementById('close-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => window.close());

    if (maxMessagesInput) maxMessagesInput.addEventListener('input', renderPreview);

    const themeSelector = document.getElementById('themeSelector');
    if (themeSelector) {
        themeSelector.addEventListener('change', async (e) => {
            const filename = e.target.value;
            if (!filename) {
                if (cssInput) cssInput.value = '';
                setBaseThemeCSS('');
                setDefaults(currentWidget);
                previewInitialized = false;
                initThemeBuilder();
                syncBuilderToPreview();
                return;
            }
            try {
                const content = await api.invoke('get-theme-content', filename);
                if (cssInput) cssInput.value = content || '';
                setBaseThemeCSS(content || '');
                setDefaults(currentWidget);
                if (content) {
                    parseCSS(content, currentWidget);
                }
                snapshotThemeValues();
                previewInitialized = false;
                initThemeBuilder();
                syncBuilderToPreview();
            } catch (err) {
                alert(NOTIFICATIONS.ERROR.LOAD.replace('{error}', err));
            }
        });
    }

    const editThemeConfigBtn = document.getElementById('editThemeConfigBtn');
    if (editThemeConfigBtn) editThemeConfigBtn.addEventListener('click', openConfigEditor);

    const importThemeBtn = document.getElementById('importThemeBtn');
    if (importThemeBtn) {
        importThemeBtn.addEventListener('click', async () => {
            try {
                const res = await api.invoke('import-theme', currentWidget);
                if (res.success) {
                    setStatus(res.message, 'ok');
                    loadThemes(currentWidget);
                } else {
                    setStatus(res.message || 'Import annulé', 'info');
                }
            } catch (error) {
                setStatus(NOTIFICATIONS.THEME_IMPORT_ERROR.replace('{error}', error.message), 'err');
            }
        });
    }

    const saveAsThemeBtn = document.getElementById('saveAsThemeBtn');
    if (saveAsThemeBtn) {
        saveAsThemeBtn.addEventListener('click', () => {
            const newThemeModal = document.getElementById('newThemeModal');
            const newThemeNameInput = document.getElementById('newThemeNameInput');
            if (newThemeNameInput) newThemeNameInput.value = '';
            if (newThemeModal) newThemeModal.style.display = 'flex';
            if (newThemeNameInput) newThemeNameInput.focus();
        });
    }

    const cancelNewThemeBtn = document.getElementById('cancelNewThemeBtn');
    if (cancelNewThemeBtn) {
        cancelNewThemeBtn.addEventListener('click', () => {
            const newThemeModal = document.getElementById('newThemeModal');
            if (newThemeModal) newThemeModal.style.display = 'none';
        });
    }

    const confirmNewThemeBtn = document.getElementById('confirmNewThemeBtn');
    if (confirmNewThemeBtn) {
        confirmNewThemeBtn.addEventListener('click', async () => {
            const newThemeNameInput = document.getElementById('newThemeNameInput');
            const name = newThemeNameInput ? newThemeNameInput.value.trim() : '';
            if (!name) return;

            try {
                const cssContent = cssInput ? cssInput.value : '';
                const res = await api.invoke('create-theme', currentWidget, name, cssContent);
                if (res.success) {
                    setStatus(NOTIFICATIONS.SUCCESS.THEME_CREATED.replace('{name}', name), 'ok');
                    await loadThemes(currentWidget);
                    const selector = document.getElementById('themeSelector');
                    if (selector) selector.value = res.filename;
                    const newThemeModal = document.getElementById('newThemeModal');
                    if (newThemeModal) newThemeModal.style.display = 'none';
                }
            } catch (e) {
                setStatus(NOTIFICATIONS.ERROR.GENERIC.replace('{error}', e), 'err');
            }
        });
    }

    const closeThemeConfigBtn = document.getElementById('closeThemeConfigBtn');
    if (closeThemeConfigBtn) {
        closeThemeConfigBtn.addEventListener('click', () => {
            const modal = document.getElementById('themeConfigModal');
            if (modal) modal.style.display = 'none';
        });
    }

    const saveThemeConfigBtn = document.getElementById('saveThemeConfigBtn');
    if (saveThemeConfigBtn) {
        saveThemeConfigBtn.addEventListener('click', async () => {
            try {
                const configStr = await api.invoke('get-theme-config');
                const fullConfig = JSON.parse(configStr || '{}');

                const inputs = document.querySelectorAll('.theme-name-input');
                inputs.forEach(input => {
                    const filename = input.dataset.filename;
                    const name = input.value.trim();
                    if (filename) {
                        if (name) {
                            fullConfig[filename] = name;
                        } else {
                            delete fullConfig[filename];
                        }
                    }
                });

                await api.invoke('save-theme-config', JSON.stringify(fullConfig, null, 2));
                const modal = document.getElementById('themeConfigModal');
                if (modal) modal.style.display = 'none';
                loadThemes(currentWidget);
                setStatus(NOTIFICATIONS.SUCCESS.SAVED, 'ok');
            } catch (e) { alert(NOTIFICATIONS.ERROR.SAVE + ': ' + e); }
        });
    }
}

async function initThemeBuilder() {
    const container = document.getElementById('theme-builder-container');
    if (!container) return;
    if (!BUILDER_SCHEMA[currentWidget]) {
        container.innerHTML = '<p class="tb-empty">Aucun builder disponible pour ce widget.</p>';
        return;
    }
    await loadSystemFonts();
    initBuilder(container, currentWidget, syncBuilderToPreview);
}

function syncBuilderToPreview() {
    const css = generateCSS(currentWidget);
    if (cssInput) cssInput.value = css;
    renderPreview();
}

loadWidgetConfig().then(() => {
});

api.on('load-css-editor', ({ widgetName }) => {
    if (cssInput) {
        loadWidgetConfig(widgetName);
    } else {
        currentWidget = widgetName;
    }
});

document.addEventListener('DOMContentLoaded', init);
