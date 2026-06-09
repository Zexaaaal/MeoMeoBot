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
    setupGoalsConfig();

    try {
        const version = await window.api.invoke('get-app-version');
        const versionTag = document.getElementById('app-version-tag');
        if (versionTag) versionTag.textContent = `v${version}`;
    } catch (err) {
        console.error('Could not fetch app version:', err);
    }
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
            el.className = 'sidebar-status disconnected';
            const label = el.querySelector('.sidebar-status-label');
            if (label) label.textContent = 'Erreur chargement';
            el.title = error.message || error;
        }
    }
}

function setupEventListeners() {
    const el = (id) => document.getElementById(id);

    el('connectBtn')?.addEventListener('click', connectBot);
    el('disconnectBtn')?.addEventListener('click', disconnectBot);
    el('saveConfigBtn')?.addEventListener('click', saveConfig);
    el('kickOAuthBtn')?.addEventListener('click', async () => {
        const clientId = document.getElementById('config-kickClientId').value.trim();
        if (!clientId) { showNotification('Remplissez le Kick Client ID', 'error'); return; }
        const arr = new Uint8Array(32); crypto.getRandomValues(arr);
        const cv = Array.from(arr, b => b.toString(16).padStart(2, '0')).join('');
        const enc = new TextEncoder();
        const dig = await crypto.subtle.digest('SHA-256', enc.encode(cv));
        const cc = btoa(String.fromCharCode(...new Uint8Array(dig))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
        await window.api.invoke('store-kick-verifier', cv);
        const s = crypto.randomUUID();
        const redirectUri = 'http://localhost:8087/kick/callback';
        const u = `https://id.kick.com/oauth/authorize?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=chat:write+chat:read+channel:read+events:subscribe&code_challenge=${cc}&code_challenge_method=S256&state=${s}`;
        window.api.invoke('open-external-url', u);
        showNotification('Autorisez MeoMeoBot sur Kick puis revenez ici', 'info');
    });

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
        // If clicking outside the action buttons on an up-to-date status, trigger a manual check
        if (!e.target.closest('#update-action-container') && updateStatus.classList.contains('up-to-date')) {
            window.api.send('check-for-updates');
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
        // Hide the action container without changing the status text
        const actionContainer = document.getElementById('update-action-container');
        if (actionContainer) actionContainer.classList.add('hidden');
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

    const configPtabs = document.querySelectorAll('.config-ptab');
    configPtabs.forEach(ptab => {
        ptab.addEventListener('click', () => {
            if (ptab.classList.contains('active')) return;
            
            document.querySelector('.config-ptab.active')?.classList.remove('active');
            document.querySelector('.config-platform-panel.active')?.classList.remove('active');
            
            ptab.classList.add('active');
            const platform = ptab.dataset.platform;
            const panel = document.querySelector(`.config-platform-panel[data-platform="${platform}"]`);
            if (panel) panel.classList.add('active');
        });
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
        discordWebhookUrl: document.getElementById('config-discordWebhookUrl').value,
        kickChannel: document.getElementById('config-kickChannel').value,
        kickClientId: document.getElementById('config-kickClientId').value,
        kickClientSecret: document.getElementById('config-kickClientSecret').value,
        kickToken: document.getElementById('config-kickToken').value,
        kickAppToken: document.getElementById('config-kickAppToken').value,
        youtubeChannel: document.getElementById('config-youtubeChannel').value,
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
    document.getElementById('config-discordWebhookUrl').value = config.discordWebhookUrl || '';
    document.getElementById('config-kickChannel').value = config.kickChannel || '';
    document.getElementById('config-kickClientId').value = config.kickClientId || '';
    document.getElementById('config-kickClientSecret').value = config.kickClientSecret || '';
    document.getElementById('config-kickToken').value = config.kickToken || '';
    document.getElementById('config-kickAppToken').value = config.kickAppToken || '';
    document.getElementById('config-youtubeChannel').value = config.youtubeChannel || '';

    document.getElementById('giveawayCommand').value = config.giveawayCommand || '!giveaway';
    document.getElementById('giveawayStartMessage').value = config.giveawayStartMessage !== undefined ? config.giveawayStartMessage : 'Le giveaway commence ! Tape !giveaway pour participer.';
    document.getElementById('giveawayStopMessage').value = config.giveawayStopMessage !== undefined ? config.giveawayStopMessage : 'Le giveaway est terminé !';
    document.getElementById('giveawayWinMessage').value = config.giveawayWinMessage !== undefined ? config.giveawayWinMessage : 'Félicitations {winner} !';
    document.getElementById('clipCooldown').value = config.clipCooldown || 30;
}

function updateBotStatus(status) {
    const el = document.getElementById('connectionStatus');
    if (!el) return;
    const label = el.querySelector('.sidebar-status-label');

    el.className = 'sidebar-status ' + status;
    if (label) label.textContent = status === 'connected' ? 'Connecté' : 'Déconnecté';
}

async function loadWidgetUrls() {
    try {
        const urls = await API.widgets.getUrls();

        const setBtnUrl = (id, url) => {
            const btn = document.getElementById(id);
            if (btn) btn.dataset.url = url;
        };

        setBtnUrl('btnCopyChatUrl', urls.chat);
        setBtnUrl('btnCopyDockUrl', urls.dock);
        setBtnUrl('btnCopySpotifyUrl', urls.spotify);
        setBtnUrl('btnCopyEmoteWallUrl', urls.emoteWall);
        setBtnUrl('btnCopySubgoalsUrl', urls.subgoals);
        setBtnUrl('btnCopyDailySubsUrl', urls.dailySubs);
        setBtnUrl('btnCopySubgoalsListUrl', urls.subgoalsList);
        setBtnUrl('btnCopyLastSubUrl', urls.lastSub);
        setBtnUrl('btnCopyLastFollowUrl', urls.lastFollow);
        setBtnUrl('btnCopyLastDonationUrl', urls.lastDonation);
        setBtnUrl('btnCopyRouletteUrl', urls.roulette);
        setBtnUrl('btnCopyGoalsUrl', urls.goals);

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

        const chatConfig = await API.widgets.getConfig('chat') || {};
        const kickCb = document.getElementById('chatPlatformKick');
        const ytCb = document.getElementById('chatPlatformYoutube');
        if (kickCb) kickCb.checked = !!chatConfig.platformKick;
        if (ytCb) ytCb.checked = !!chatConfig.platformYoutube;
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

    const platformKick = document.getElementById('chatPlatformKick')?.checked || false;
    const platformYoutube = document.getElementById('chatPlatformYoutube')?.checked || false;

    try {
        await API.saveBadgePrefs(prefs);

        const chatConfig = await API.widgets.getConfig('chat') || {};
        chatConfig.platformKick = platformKick;
        chatConfig.platformYoutube = platformYoutube;
        await API.widgets.saveConfig('chat', chatConfig);

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

function setupGoalsConfig() {
    const configureBtn = document.getElementById('configureGoalsBtn');
    if (configureBtn) {
        configureBtn.addEventListener('click', async () => {
            API.widgets.openGoalsConfig();
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