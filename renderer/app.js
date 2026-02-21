import { setupTabs } from './tabs.js';
import { setupWindowControls, updateUpdaterStatus, setupInlineConfirmLogic, NOTIFICATIONS, showNotification, ICONS } from './ui.js';
import { API } from './api.js';
import { loadParticipants, startGiveaway, stopGiveaway, drawWinner, clearParticipants, saveGiveawayConfig } from './giveaway.js';
import { loadCommands, addCommand } from './commands.js';
import {
    loadBannedWords, addBannedWord, clearBannedWords,
    loadAutoMessages, addAutoMessage, saveClipConfig
} from './moderation.js';
import { setupCast } from './cast.js';
import { initPlanning } from './planning.js';


window.editWidgetCss = (widgetName) => {
    API.widgets.openCssEditor(widgetName);
};



if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}

async function initializeApp() {
    setupTabs();
    setupWindowControls();
    setupCast();
    initPlanning();
    setupEventListeners();

    await loadAllData();
    updateUpdaterStatus('checking');

    loadWidgetUrls();
    loadEmoteWallConfig();
    loadBadgePrefs();
    setupSubgoalsConfig();
    loadDailySubsConfig();
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
    const el = (id) => document.getElementById(id);

    el('connectBtn')?.addEventListener('click', connectBot);
    el('disconnectBtn')?.addEventListener('click', disconnectBot);
    el('saveConfigBtn')?.addEventListener('click', saveConfig);

    el('addCommandBtn')?.addEventListener('click', addCommand);
    el('newCommand')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') el('commandResponse')?.focus(); });
    el('commandResponse')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCommand(); } });

    el('saveGiveawayConfig')?.addEventListener('click', saveGiveawayConfig);
    el('startGiveawayBtn')?.addEventListener('click', startGiveaway);
    el('stopGiveawayBtn')?.addEventListener('click', stopGiveaway);
    el('drawWinnerBtn')?.addEventListener('click', drawWinner);

    setupInlineConfirmLogic(
        el('clearParticipantsBtn'),
        el('confirmClearParticipantsBtn'),
        el('cancelClearParticipantsBtn'),
        clearParticipants
    );

    el('addBannedWordBtn')?.addEventListener('click', addBannedWord);
    el('newBannedWord')?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addBannedWord();
        }
    });

    setupInlineConfirmLogic(
        el('clearBannedWordsBtn'),
        el('confirmClearBannedWordsBtn'),
        el('cancelClearBannedWordsBtn'),
        clearBannedWords
    );

    el('addAutoMessageBtn')?.addEventListener('click', addAutoMessage);
    el('saveClipConfig')?.addEventListener('click', saveClipConfig);

    el('spotifyAuthBtn')?.addEventListener('click', startSpotifyAuth);

    el('saveBadgePrefs')?.addEventListener('click', saveBadgePrefs);

    el('saveEmoteWallConfig')?.addEventListener('click', saveEmoteWallConfig);
    el('saveDailySubsBtn')?.addEventListener('click', saveDailySubsConfig);

    const updateStatus = el('updateStatus');
    updateStatus?.addEventListener('click', (e) => {
        if (!e.target.closest('.update-popover')) {
            if (updateStatus.classList.contains('update-available') || updateStatus.classList.contains('downloaded')) {
                updateStatus.classList.toggle('active');
            } else if (updateStatus.classList.contains('up-to-date')) {
                window.api.send('check-for-updates');
            }
        }
    });
    el('update-confirm-icon')?.addEventListener('click', (e) => {
        e.stopPropagation();
        const updateStatus = el('updateStatus');
        if (updateStatus.classList.contains('update-available')) {
            API.updates.startDownload();
        } else if (updateStatus.classList.contains('downloaded')) {
            API.updates.quitAndInstall();
        }
    });
    el('update-deny-icon')?.addEventListener('click', (e) => {
        e.stopPropagation();
        updateStatus?.classList.remove('active');
    });

    window.api.on('bot-status', (status) => updateBotStatus(status.connected ? 'connected' : 'disconnected'));
    window.api.on('update-status-check', (data) => updateUpdaterStatus(data.status));
    window.api.on('update-available', () => updateUpdaterStatus('update-available'));
    window.api.on('update-downloaded', () => updateUpdaterStatus('downloaded'));
    window.api.on('notification', (msg, type) => showNotification(msg, type));
    window.api.on('participants-updated', () => loadParticipants());
    window.api.on('refresh-widget-urls', () => loadWidgetUrls());

    document.getElementById('widgets-tab').addEventListener('click', async (e) => {
        if (e.target.classList.contains('copy-source-btn')) {
            const url = e.target.dataset.url;
            if (url) {
                try {
                    await navigator.clipboard.writeText(url);
                    showNotification('URL copiée dans le presse-papier !', 'success');
                } catch (err) {
                    showNotification('Erreur de copie : ' + err, 'error');
                }
            } else {
                showNotification('URL non disponible', 'error');
            }
        }
    });
}

async function connectBot() {
    try {
        const result = await API.connectBot();
        if (result.success) showNotification(NOTIFICATIONS.SUCCESS.CONNECTED, 'success');
        else showNotification(NOTIFICATIONS.ERROR.CONNECT.replace('{error}', result.error), 'error');
    } catch (e) { showNotification(NOTIFICATIONS.ERROR.GENERIC.replace('{error}', e), 'error'); }
}

async function disconnectBot() {
    try {
        await API.disconnectBot();
        showNotification(NOTIFICATIONS.SUCCESS.DISCONNECTED, 'info');
    } catch (e) { showNotification(NOTIFICATIONS.ERROR.GENERIC.replace('{error}', e), 'error'); }
}

async function saveConfig() {
    const config = {
        channel: document.getElementById('config-channel').value,
        username: document.getElementById('config-username').value,
        token: document.getElementById('config-token').value,
        twitchClientId: document.getElementById('config-twitchClientId').value,
        twitchAppToken: document.getElementById('config-twitchAppToken').value,
        spotifyClientId: document.getElementById('config-spotifyClientId').value,
        spotifyClientSecret: document.getElementById('config-spotifyClientSecret').value,
        streamlabsSocketToken: document.getElementById('config-streamlabsSocketToken').value,
        steamGridDbApiKey: document.getElementById('config-steamGridDbApiKey').value,
        giveawayCommand: document.getElementById('giveawayCommand').value,
        giveawayStartMessage: document.getElementById('giveawayStartMessage').value,
        giveawayStopMessage: document.getElementById('giveawayStopMessage').value,
        giveawayWinMessage: document.getElementById('giveawayWinMessage').value,
        clipCooldown: parseInt(document.getElementById('clipCooldown').value)
    };

    try {
        await API.saveConfig(config);
        showNotification(NOTIFICATIONS.SUCCESS.SAVED, 'success');
    } catch (e) { showNotification(NOTIFICATIONS.ERROR.SAVE + ': ' + e, 'error'); }
}

function updateConfigForm(config) {
    if (!config) return;

    document.getElementById('config-channel').value = config.channel || '';
    document.getElementById('config-username').value = config.username || '';
    document.getElementById('config-token').value = config.token || '';
    document.getElementById('config-twitchClientId').value = config.twitchClientId || '';
    document.getElementById('config-twitchAppToken').value = config.twitchAppToken || '';
    document.getElementById('config-spotifyClientId').value = config.spotifyClientId || '';
    document.getElementById('config-spotifyClientSecret').value = config.spotifyClientSecret || '';
    document.getElementById('config-streamlabsSocketToken').value = config.streamlabsSocketToken || '';
    document.getElementById('config-steamGridDbApiKey').value = config.steamGridDbApiKey || '';

    document.getElementById('giveawayCommand').value = config.giveawayCommand || '!giveaway';
    document.getElementById('giveawayStartMessage').value = config.giveawayStartMessage !== undefined ? config.giveawayStartMessage : 'Le giveaway commence ! Tape !giveaway pour participer.';
    document.getElementById('giveawayStopMessage').value = config.giveawayStopMessage !== undefined ? config.giveawayStopMessage : 'Le giveaway est terminé !';
    document.getElementById('giveawayWinMessage').value = config.giveawayWinMessage !== undefined ? config.giveawayWinMessage : 'Félicitations {winner} !';
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

        const setBtnUrl = (id, url) => {
            const btn = document.getElementById(id);
            if (btn) btn.dataset.url = url;
        };

        setBtnUrl('btnCopyChatUrl', urls.chat);
        setBtnUrl('btnCopySpotifyUrl', urls.spotify);
        setBtnUrl('btnCopyEmoteWallUrl', urls.emoteWall);
        setBtnUrl('btnCopySubgoalsUrl', urls.subgoals);
        setBtnUrl('btnCopyDailySubsUrl', urls.dailySubs);
        setBtnUrl('btnCopySubgoalsListUrl', urls.subgoalsList);
        setBtnUrl('btnCopyLastSubUrl', urls.lastSub);
        setBtnUrl('btnCopyLastFollowUrl', urls.lastFollow);
        setBtnUrl('btnCopyLastDonationUrl', urls.lastDonation);
        setBtnUrl('btnCopyRouletteUrl', urls.roulette);

    } catch (e) { console.error('Erreur URLs widgets', e); }
}

async function startSpotifyAuth() {
    try {
        await API.startSpotifyAuth();
    } catch (e) { showNotification('Erreur Auth Spotify: ' + e, 'error'); }
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
        showNotification('Préférences sauvegardées', 'success');
    } catch (e) { showNotification('Erreur sauvegarde badges: ' + e, 'error'); }
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
        showNotification('Config Mur d\'Emotes sauvegardée', 'success');
    } catch (e) { showNotification('Erreur de la sauvegarde Emote Wall: ' + e, 'error'); }
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
                showNotification('Roulette lancée', 'success');
            } catch (e) {
                showNotification('Erreur lancement roulette: ' + e, 'error');
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
            <button class="btn-link delete-btn" data-index="${index}" title="Supprimer" style="pointer-events: auto;">
                ${ICONS.trash}
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
        showNotification('Config Subgoals sauvegardée', 'success');
    } catch (e) { showNotification('Erreur sauvegarde Subgoals: ' + e, 'error'); }
}

async function loadDailySubsConfig() {
    try {
        const config = await API.widgets.getConfig('subgoals');
        if (config) {
            if (document.getElementById('dailyStartCount')) document.getElementById('dailyStartCount').value = config.dailyStartCount || 0;
            if (document.getElementById('dailyGoalCount')) document.getElementById('dailyGoalCount').value = config.dailyGoalCount || 10;
            if (document.getElementById('dailyCurrentCount')) document.getElementById('dailyCurrentCount').value = config.dailyCurrentCount || 0;
            const countRegularSubs = config.countRegularSubs !== false;
            const countSubGifts = config.countSubGifts === true;
            if (document.getElementById('countRegularSubs')) document.getElementById('countRegularSubs').checked = countRegularSubs;
            if (document.getElementById('countSubGifts')) document.getElementById('countSubGifts').checked = countSubGifts;
        }
    } catch (e) { console.error('Erreur chargement config Daily Subs', e); }
}

async function saveDailySubsConfig() {
    try {
        const currentConfig = await API.widgets.getConfig('subgoals') || {};
        const getInt = (id) => {
            const el = document.getElementById(id);
            return el ? parseInt(el.value, 10) : 0;
        };
        const countRegularSubsEl = document.getElementById('countRegularSubs');
        const countSubGiftsEl = document.getElementById('countSubGifts');

        const newConfig = {
            ...currentConfig,
            dailyGoalCount: getInt('dailyGoalCount'),
            baseDailyGoalCount: getInt('dailyGoalCount'),
            dailyStartCount: document.getElementById('dailyStartCount') ? getInt('dailyStartCount') : (currentConfig.dailyStartCount || 0),
            dailyCurrentCount: document.getElementById('dailyCurrentCount') ? getInt('dailyCurrentCount') : (currentConfig.dailyCurrentCount || 0),
            countRegularSubs: countRegularSubsEl ? countRegularSubsEl.checked : true,
            countSubGifts: countSubGiftsEl ? countSubGiftsEl.checked : false
        };

        await API.widgets.saveConfig('subgoals', newConfig);
        showNotification('Config Daily Subs sauvegardée', 'success');
    } catch (e) { showNotification('Erreur sauvegarde Daily Subs: ' + e, 'error'); }
}