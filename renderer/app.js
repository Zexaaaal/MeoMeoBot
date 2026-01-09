import { setupTabs } from './tabs.js';
import { setupWindowControls, setupConfirmationOverlay, updateUpdaterStatus, setupInlineConfirmLogic, NOTIFICATIONS, showStatus, createInputGroup } from './ui.js';
import { API } from './api.js';
import { loadParticipants, startGiveaway, stopGiveaway, drawWinner, clearParticipants, saveGiveawayConfig } from './giveaway.js';
import { loadCommands, addCommand } from './commands.js';
import { loadBannedWords, addBannedWord, clearBannedWords, saveAutoMessage, saveClipConfig } from './moderation.js';
import { setupCast } from './cast.js';
import { initPlanning } from './planning.js';

let configState = {};

window.editWidgetCss = (widgetName) => {
    API.widgets.openCssEditor(widgetName);
};

document.addEventListener('DOMContentLoaded', initializeApp);

async function initializeApp() {
    setupTabs();
    setupWindowControls();
    setupConfirmationOverlay();
    setupCast();
    initPlanning();
    setupEventListeners();

    await loadAllData();
    updateUpdaterStatus('checking');

    loadWidgetUrls();
    loadEmoteWallConfig();
    loadBadgePrefs();
    setupSubgoalsConfig();
    setupRouletteConfig();
}

async function loadAllData() {
    try {
        const config = await API.getConfig();
        updateConfigForm(config);

        await loadCommands();
        await loadBannedWords();
        await loadParticipants();

        const status = await API.getBotStatus();
        updateBotStatus(status.connected ? 'connected' : 'disconnected');
    } catch (error) {
        console.error(error);
        const el = document.getElementById('connectionStatus');
        if (el) {
            el.className = 'status disconnected';
            el.querySelector('span:last-child').textContent = 'Erreur Chargement';
            el.title = error.message || error;
        }
    }
}

function setupEventListeners() {
    document.getElementById('connectBtn').addEventListener('click', connectBot);
    document.getElementById('disconnectBtn').addEventListener('click', disconnectBot);
    document.getElementById('saveConfigBtn').addEventListener('click', saveConfig);

    document.getElementById('addCommandBtn').addEventListener('click', addCommand);
    document.getElementById('newCommand').addEventListener('keydown', (e) => { if (e.key === 'Enter') document.getElementById('commandResponse').focus(); });
    document.getElementById('commandResponse').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCommand(); } });

    document.getElementById('saveGiveawayConfig').addEventListener('click', saveGiveawayConfig);
    document.getElementById('startGiveawayBtn').addEventListener('click', startGiveaway);
    document.getElementById('stopGiveawayBtn').addEventListener('click', stopGiveaway);
    document.getElementById('drawWinnerBtn').addEventListener('click', drawWinner);
    document.getElementById('clearParticipantsBtn').addEventListener('click', () => window.showConfirmation('Vider la liste des participants ?', clearParticipants));

    const addBannedWordBtn = document.getElementById('addBannedWordBtn');
    const newBannedWordInput = document.getElementById('newBannedWord');
    if (addBannedWordBtn) addBannedWordBtn.addEventListener('click', addBannedWord);
    if (newBannedWordInput) {
        newBannedWordInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                addBannedWord();
            }
        });
    }

    setupInlineConfirmLogic(
        document.getElementById('clearBannedWordsBtn'),
        document.getElementById('confirmClearBannedWordsBtn'),
        document.getElementById('cancelClearBannedWordsBtn'),
        clearBannedWords
    );

    document.getElementById('saveAutoMessage').addEventListener('click', saveAutoMessage);
    const resetChatConfigBtn = document.getElementById('resetChatConfigBtn');
    if (resetChatConfigBtn) {
        let resetTimeout;
        resetChatConfigBtn.addEventListener('click', async () => {
            if (!resetChatConfigBtn.classList.contains('confirming')) {
                resetChatConfigBtn.classList.add('confirming');
                const originalText = resetChatConfigBtn.textContent;
                resetChatConfigBtn.dataset.originalText = originalText;
                resetChatConfigBtn.textContent = 'Sûr ?';

                resetTimeout = setTimeout(() => {
                    resetChatConfigBtn.classList.remove('confirming');
                    resetChatConfigBtn.textContent = originalText;
                }, 3000);
                return;
            }

            clearTimeout(resetTimeout);
            resetChatConfigBtn.classList.remove('confirming');
            resetChatConfigBtn.textContent = resetChatConfigBtn.dataset.originalText || 'Reset Config';

            try {
                await API.widgets.resetConfig('chat');
                showStatus('global-status-msg', NOTIFICATIONS.SUCCESS.CONFIG_RESET, 'success');
            } catch (e) {
                showStatus('global-status-msg', NOTIFICATIONS.ERROR.GENERIC.replace('{error}', e), 'error');
            }
        });
    }

    const spotifyAuthBtn = document.getElementById('spotifyAuthBtn');
    if (spotifyAuthBtn) spotifyAuthBtn.addEventListener('click', startSpotifyAuth);

    const saveEmoteWallBtn = document.getElementById('saveEmoteWallConfig');
    if (saveEmoteWallBtn) saveEmoteWallBtn.addEventListener('click', saveEmoteWallConfig);

    const updateStatus = document.getElementById('updateStatus');
    updateStatus.addEventListener('click', (e) => {
        if (!e.target.closest('.update-popover') && (updateStatus.classList.contains('update-available') || updateStatus.classList.contains('downloaded'))) {
            updateStatus.classList.toggle('active');
        }
    });
    document.getElementById('update-confirm-icon').addEventListener('click', (e) => {
        e.stopPropagation();
        const updateStatus = document.getElementById('updateStatus');
        if (updateStatus.classList.contains('update-available')) {
            API.updates.startDownload();
        } else if (updateStatus.classList.contains('downloaded')) {
            API.updates.quitAndInstall();
        }
    });
    document.getElementById('update-deny-icon').addEventListener('click', (e) => {
        e.stopPropagation();
        updateStatus.classList.remove('active');
    });

    window.api.on('bot-status', (status) => updateBotStatus(status.connected ? 'connected' : 'disconnected'));
    window.api.on('update-status-check', (data) => updateUpdaterStatus(data.status));
    window.api.on('update-available', () => updateUpdaterStatus('update-available'));
    window.api.on('update-downloaded', () => updateUpdaterStatus('downloaded'));
    window.api.on('notification', (msg, type) => showStatus('global-status-msg', msg, type));
    window.api.on('participants-updated', () => loadParticipants());
    window.api.on('refresh-widget-urls', () => loadWidgetUrls());
}

async function connectBot() {
    try {
        const result = await API.connectBot();
        if (result.success) showStatus('global-status-msg', NOTIFICATIONS.SUCCESS.CONNECTED, 'success');
        else showStatus('global-status-msg', NOTIFICATIONS.ERROR.CONNECT.replace('{error}', result.error), 'error');
    } catch (e) { showStatus('global-status-msg', NOTIFICATIONS.ERROR.GENERIC.replace('{error}', e), 'error'); }
}

async function disconnectBot() {
    try {
        await API.disconnectBot();
        showStatus('global-status-msg', NOTIFICATIONS.SUCCESS.DISCONNECTED, 'info');
    } catch (e) { showStatus('global-status-msg', NOTIFICATIONS.ERROR.GENERIC.replace('{error}', e), 'error'); }
}

async function saveConfig() {
    const config = { ...configState };
    try {
        await API.saveConfig(config);
        showStatus('global-status-msg', NOTIFICATIONS.SUCCESS.SAVED, 'success');
    } catch (e) { showStatus('global-status-msg', NOTIFICATIONS.ERROR.SAVE + ': ' + e, 'error'); }
}

function renderConfigForm() {
    const container = document.getElementById('config-form-container');
    if (!container) return;
    container.innerHTML = '';

    const columnsDiv = document.createElement('div');
    columnsDiv.className = 'config-columns';

    const colTwitch = document.createElement('div');
    colTwitch.className = 'config-col';
    colTwitch.innerHTML = '<h4>Twitch Compte</h4>';
    colTwitch.appendChild(createInputGroup('Nom de la chaîne', configState.channel, v => configState.channel = v));
    colTwitch.appendChild(createInputGroup('Nom du Bot', configState.username, v => configState.username = v));
    const tokenGroup = createInputGroup('Token OAuth', configState.token, v => configState.token = v, 'password');
    colTwitch.appendChild(tokenGroup);

    const colApi = document.createElement('div');
    colApi.className = 'config-col';
    colApi.innerHTML = '<h4>Twitch API</h4>';
    colApi.appendChild(createInputGroup('Client ID', configState.twitchClientId, v => configState.twitchClientId = v));
    colApi.appendChild(createInputGroup('App Token', configState.twitchAppToken, v => configState.twitchAppToken = v, 'password'));

    const colSpotify = document.createElement('div');
    colSpotify.className = 'config-col';
    colSpotify.innerHTML = '<h4>Spotify</h4>';
    colSpotify.appendChild(createInputGroup('Client ID', configState.spotifyClientId, v => configState.spotifyClientId = v));
    colSpotify.appendChild(createInputGroup('Client Secret', configState.spotifyClientSecret, v => configState.spotifyClientSecret = v, 'password'));

    const spotifyBtn = document.createElement('button');
    spotifyBtn.className = 'btn btn-secondary';
    spotifyBtn.id = 'spotifyAuthBtn';
    spotifyBtn.style.marginTop = '10px';
    spotifyBtn.style.width = '100%';
    spotifyBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" style="margin-right: 8px;"><path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z" /></svg>Connexion Spotify`;
    spotifyBtn.addEventListener('click', startSpotifyAuth);
    colSpotify.appendChild(spotifyBtn);

    const colStreamlabs = document.createElement('div');
    colStreamlabs.className = 'config-col';
    colStreamlabs.innerHTML = '<h4>Streamlabs</h4>';
    colStreamlabs.appendChild(createInputGroup('Socket Token', configState.streamlabsSocketToken, v => configState.streamlabsSocketToken = v, 'password'));

    const colSteamGrid = document.createElement('div');
    colSteamGrid.className = 'config-col';
    colSteamGrid.innerHTML = '<h4>SteamGridDB</h4>';
    colSteamGrid.appendChild(createInputGroup('API Key', configState.steamGridDbApiKey, v => configState.steamGridDbApiKey = v, 'password'));

    columnsDiv.appendChild(colTwitch);
    columnsDiv.appendChild(colApi);
    columnsDiv.appendChild(colSpotify);
    columnsDiv.appendChild(colStreamlabs);
    columnsDiv.appendChild(colSteamGrid);

    container.appendChild(columnsDiv);
}

function updateConfigForm(config) {
    if (!config) return;
    configState = { ...config };
    renderConfigForm();

    document.getElementById('giveawayCommand').value = config.giveawayCommand || '!giveaway';
    document.getElementById('giveawayStartMessage').value = config.giveawayStartMessage !== undefined ? config.giveawayStartMessage : 'Le giveaway commence ! Tape !giveaway pour participer.';
    document.getElementById('giveawayStopMessage').value = config.giveawayStopMessage !== undefined ? config.giveawayStopMessage : 'Le giveaway est terminé !';
    document.getElementById('giveawayWinMessage').value = config.giveawayWinMessage !== undefined ? config.giveawayWinMessage : 'Félicitations {winner} !';

    document.getElementById('autoMessage').value = config.autoMessage || '';
    document.getElementById('autoMessageInterval').value = config.autoMessageInterval || 10;
    document.getElementById('clipCooldown').value = config.clipCooldown || 30;
}

function updateBotStatus(status) {
    const el = document.getElementById('connectionStatus');
    const dot = el.querySelector('.status-dot');
    const text = el.querySelector('span:not(.status-dot)');

    el.className = 'status';
    if (status === 'connected') {
        el.classList.add('connected');
        text.textContent = 'Connecté';
    } else {
        el.classList.add('disconnected');
        text.textContent = 'Déconnecté';
    }
}

async function loadWidgetUrls() {
    try {
        const urls = await API.widgets.getUrls();
        if (document.getElementById('widgetUrlDisplay')) document.getElementById('widgetUrlDisplay').textContent = urls.chat;
        if (document.getElementById('spotifyWidgetUrlDisplay')) document.getElementById('spotifyWidgetUrlDisplay').textContent = urls.spotify;
        if (document.getElementById('emoteWallWidgetUrlDisplay')) document.getElementById('emoteWallWidgetUrlDisplay').textContent = urls.emoteWall;
        if (document.getElementById('subgoalsWidgetUrlDisplay')) document.getElementById('subgoalsWidgetUrlDisplay').textContent = urls.subgoals;
        if (document.getElementById('subgoalsListWidgetUrlDisplay')) document.getElementById('subgoalsListWidgetUrlDisplay').textContent = urls.subgoalsList;
        if (document.getElementById('rouletteWidgetUrlDisplay')) document.getElementById('rouletteWidgetUrlDisplay').textContent = urls.roulette;
    } catch (e) { console.error('Erreur URLs widgets', e); }
}

async function startSpotifyAuth() {
    try {
        await API.startSpotifyAuth();
    } catch (e) { showStatus('global-status-msg', 'Erreur Auth Spotify: ' + e, 'error'); }
}

async function loadBadgePrefs() {
    try {
        const prefs = await API.getBadgePrefs();
        renderBadgePrefs(prefs);
    } catch (e) { console.error('Erreur de chargement badges', e); }
}

function renderBadgePrefs(prefs) {
    const container = document.getElementById('badgePrefs');
    if (!container) return;
    container.innerHTML = '';

    const grid = document.createElement('div');
    grid.className = 'badge-grid';

    const badges = [
        { id: 'moderator', label: 'Modérateur' },
        { id: 'vip', label: 'VIP' },
        { id: 'subscriber', label: 'Abonné' },
        { id: 'founder', label: 'Fondateur' },
        { id: 'partner', label: 'Partenaire' },
        { id: 'premium', label: 'Prime Gaming' }
    ];

    badges.forEach(badge => {
        const isChecked = prefs[badge.id] !== false;
        const label = document.createElement('label');
        label.innerHTML = `<input type="checkbox" data-badge="${badge.id}" ${isChecked ? 'checked' : ''}> ${badge.label}`;
        grid.appendChild(label);
    });

    container.appendChild(grid);
}

async function saveBadgePrefs() {
    const checkboxes = document.querySelectorAll('#badgePrefs input[type="checkbox"]');
    const prefs = {};
    checkboxes.forEach(cb => {
        prefs[cb.dataset.badge] = cb.checked;
    });
    try {
        await API.saveBadgePrefs(prefs);
        showStatus('global-status-msg', 'Préférences sauvegardées', 'success');
    } catch (e) { showStatus('global-status-msg', 'Erreur sauvegarde badges: ' + e, 'error'); }
}

async function loadEmoteWallConfig() {
    try {
        const config = await API.widgets.getConfig('emote-wall');
        if (config) {
            if (document.getElementById('emoteWallMinSize')) document.getElementById('emoteWallMinSize').value = config.minSize || 24;
            if (document.getElementById('emoteWallMaxSize')) document.getElementById('emoteWallMaxSize').value = config.maxSize || 64;
            if (document.getElementById('emoteWallSpawnInterval')) document.getElementById('emoteWallSpawnInterval').value = config.spawnInterval || 100;
            if (document.getElementById('emoteWallDuration')) document.getElementById('emoteWallDuration').value = config.animationDuration || 5000;
        }
    } catch (e) { console.error('Erreur chargement de la config Emote Wall', e); }
}

async function saveEmoteWallConfig() {
    const config = {
        minSize: parseInt(document.getElementById('emoteWallMinSize').value, 10),
        maxSize: parseInt(document.getElementById('emoteWallMaxSize').value, 10),
        spawnInterval: parseInt(document.getElementById('emoteWallSpawnInterval').value, 10),
        animationDuration: parseInt(document.getElementById('emoteWallDuration').value, 10)
    };
    try {
        await API.widgets.saveConfig('emote-wall', config);
        showStatus('global-status-msg', 'Config Mur d\'Emotes sauvegardée', 'success');
    } catch (e) { showStatus('global-status-msg', 'Erreur de la sauvegarde Emote Wall: ' + e, 'error'); }
}


let subgoalsSteps = [];

function setupSubgoalsConfig() {
    const configureBtn = document.getElementById('configureSubgoalsBtn');

    if (configureBtn) {
        configureBtn.addEventListener('click', async () => {



            API.widgets.openSubgoalsConfig();
        });
    }
}

function setupRouletteConfig() {
    const configureBtn = document.getElementById('configureRouletteBtn');
    if (configureBtn) {
        configureBtn.addEventListener('click', async () => {
            await API.widgets.openRouletteConfig();
        });
    }

    const spinBtn = document.getElementById('spinRouletteBtn');
    if (spinBtn) {
        spinBtn.addEventListener('click', async () => {
            try {
                await API.widgets.triggerRouletteSpin();
                showStatus('global-status-msg', 'Roulette lancée', 'success');
            } catch (e) {
                showStatus('global-status-msg', 'Erreur lancement roulette: ' + e, 'error');
            }
        });
    }
}

async function loadSubgoalsConfig() {
    try {
        const config = await API.widgets.getConfig('subgoals');
        if (config) {
            document.getElementById('subgoalsStartCount').value = config.startCount || 0;
            document.getElementById('subgoalsGoalCount').value = config.goalCount || 100;
            subgoalsSteps = config.steps || [];
            renderSubgoalsSteps();
        }
    } catch (e) { console.error('Erreur du chargement de la config Subgoals', e); }
}

function renderSubgoalsSteps() {
    const container = document.getElementById('subgoalsStepsList');
    container.innerHTML = '';

    subgoalsSteps.forEach((step, index) => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.innerHTML = `
            <span><strong>${step.count}</strong> : ${step.label}</span>
            <button class="btn-link delete-btn" data-index="${index}" title="Supprimer">
                <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events: none;">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
            </button>
        `;
        container.appendChild(div);
    });

    container.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const idx = parseInt(e.target.dataset.index, 10);
            subgoalsSteps.splice(idx, 1);
            renderSubgoalsSteps();
        });
    });
}

async function saveSubgoalsConfig() {
    const config = {
        startCount: parseInt(document.getElementById('subgoalsStartCount').value, 10),
        goalCount: parseInt(document.getElementById('subgoalsGoalCount').value, 10),
        steps: subgoalsSteps
    };
    try {
        await API.widgets.saveConfig('subgoals', config);
        showStatus('global-status-msg', 'Config Subgoals sauvegardée', 'success');
    } catch (e) { showStatus('global-status-msg', 'Erreur sauvegarde Subgoals: ' + e, 'error'); }
}