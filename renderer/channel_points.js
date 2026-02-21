import { API } from './api.js';
import { showNotification, NOTIFICATIONS, ICONS, createDeleteControl } from './ui.js';
const DEFAULT_COLOR = '#9146FF';


let rewardsList;
let rewardEditorContainer;
let isEditing = false;
let editingId = null;
let currentRewards = [];
let savedRewardSounds = {};
let savedRewardImages = {};
let savedRewardFunctions = {};
let rewardFolders = [];
let isDevMode = false;

async function init() {
    try {
        isDevMode = await API.app.isDev();
    } catch (e) {
        console.warn('Could not determine dev mode', e);
    }

    rewardsList = document.getElementById('rewardsList');
    rewardEditorContainer = document.getElementById('reward-editor-static');

    const addBtn = document.getElementById('addRewardBtn');
    if (addBtn) addBtn.addEventListener('click', () => openEditor());
    const createFolderBtn = document.getElementById('createFolderBtn');
    if (createFolderBtn) createFolderBtn.addEventListener('click', createFolder);

    const refreshBtn = document.getElementById('refreshRewardsBtn');
    if (refreshBtn) refreshBtn.addEventListener('click', loadRewards);

    const cancelBtn = document.getElementById('cancelRewardEditorBtn');
    if (cancelBtn) cancelBtn.addEventListener('click', closeEditor);

    const saveBtn = document.getElementById('saveRewardEditorBtn');
    if (saveBtn) saveBtn.addEventListener('click', saveReward);

    const stripPrefix = (path) => path ? path.replace(/^file:\/\/+/, '') : path;

    const soundInput = document.getElementById('rewardSoundInput');
    const imageInput = document.getElementById('rewardImageInput');

    soundInput.style.cursor = 'pointer';
    soundInput.addEventListener('click', async () => {
        try {
            const path = await API.openFileDialog([{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }]);
            if (path) {
                const val = `file://${path.replace(/\\/g, '/')}`;
                soundInput.value = stripPrefix(val);
                soundInput.dataset.path = val;
            }
        } catch (e) { console.error(e); }
    });

    document.getElementById('rewardSoundClearBtn').addEventListener('click', () => {
        soundInput.value = '';
        soundInput.dataset.path = '';
    });

    imageInput.style.cursor = 'pointer';
    imageInput.addEventListener('click', async () => {
        try {
            const path = await API.openFileDialog([{ name: 'Images', extensions: ['jpg', 'png', 'gif'] }]);
            if (path) {
                const val = `file://${path.replace(/\\/g, '/')}`;
                imageInput.value = stripPrefix(val);
                imageInput.dataset.path = val;
            }
        } catch (e) { console.error(e); }
    });

    document.getElementById('rewardImageClearBtn').addEventListener('click', () => {
        imageInput.value = '';
        imageInput.dataset.path = '';
    });


    const pointsTab = document.querySelector('.tab[data-tab="points"]');
    if (pointsTab) {
        pointsTab.addEventListener('click', () => {
            loadRewards();
            loadRewardSounds();
        });
    }

    loadRewardSounds();
    loadGlobalVolume();

    const funcBtn = document.getElementById('rewardFunctionBtn');
    const funcDropdown = document.getElementById('rewardFunctionDropdown');
    const funcOptions = document.querySelectorAll('.custom-picker-option');

    if (funcBtn) {
        funcBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            funcBtn.classList.toggle('active');
            funcDropdown.classList.toggle('active');
        });
    }

    funcOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            const val = opt.dataset.value;
            const text = opt.textContent;
            funcBtn.textContent = text;
            funcBtn.dataset.value = val;

            funcOptions.forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');

            funcBtn.classList.remove('active');
            funcDropdown.classList.remove('active');
        });
    });

    document.addEventListener('click', () => {
        if (funcBtn) funcBtn.classList.remove('active');
        if (funcDropdown) funcDropdown.classList.remove('active');
    });

    if (rewardsList) {
        rewardsList.addEventListener('dragover', (e) => {
            e.preventDefault();
        });

        rewardsList.addEventListener('drop', async (e) => {
            if (e.target.closest('.reward-folder')) return;

            e.preventDefault();
            const type = e.dataTransfer.getData('text/type');
            const id = e.dataTransfer.getData('text/id');
            const sourceFolderId = e.dataTransfer.getData('text/source-folder');

            if (type === 'reward' && id && sourceFolderId) {
                const srcFolder = rewardFolders.find(f => f.id === sourceFolderId);
                const draggedChip = document.querySelector(`.reward-chip[data-reward-id="${id}"]`);

                if (srcFolder) {
                    srcFolder.rewardIds = srcFolder.rewardIds.filter(rid => rid !== id);

                    if (draggedChip) draggedChip.remove();
                    const reward = currentRewards.find(r => String(r.id) === String(id));
                    if (reward) {
                        renderRewardCard(reward);
                    }

                    await updateLocalFolders();
                }
            }
        });
    }
}

async function loadGlobalVolume() {
    const vol = await window.api.invoke('get-points-global-volume');
    const container = document.querySelector('.points-header-controls');

    const refreshBtn = document.getElementById('refreshRewardsBtn');
    if (refreshBtn && refreshBtn.parentNode) {
        let volContainer = document.getElementById('points-global-volume-container');
        if (!volContainer) {
            volContainer = document.createElement('div');
            volContainer.id = 'points-global-volume-container';
            volContainer.style.display = 'flex';
            volContainer.style.alignItems = 'center';
            volContainer.style.marginLeft = '15px';
            volContainer.style.gap = '10px';

            const label = document.createElement('span');
            label.textContent = 'Volume Global:';
            label.style.fontSize = '0.9em';
            label.style.color = 'var(--text-secondary)';

            const slider = document.createElement('input');
            slider.type = 'range';
            slider.min = '0';
            slider.max = '1';
            slider.step = '0.05';
            slider.value = vol;
            slider.style.width = '100px';

            slider.addEventListener('input', async (e) => {
                await window.api.invoke('save-points-global-volume', parseFloat(e.target.value));
            });

            volContainer.appendChild(label);
            volContainer.appendChild(slider);
            refreshBtn.parentNode.insertBefore(volContainer, refreshBtn.nextSibling);
        }
    }
}

async function loadRewardSounds() {
    try {
        savedRewardSounds = await window.api.invoke('get-reward-sounds') || {};
        savedRewardImages = await window.api.invoke('get-reward-images') || {};
        savedRewardFunctions = await window.api.invoke('get-reward-functions') || {};
        rewardFolders = await window.api.invoke('get-reward-folders') || [];
    } catch (e) {
        console.error('Error loading reward assets:', e);
    }
}

async function loadRewards() {
    if (!rewardsList) return;
    rewardsList.innerHTML = '<div class="loading-spinner">Chargement (Init)...</div>';
    closeEditor();

    try {
        rewardsList.innerHTML = '<div class="loading-spinner">Connexion au bot (IPC)...</div>';
        const rewards = await API.points.getRewards();
        currentRewards = rewards || [];
        refreshUI();
        showNotification(window.logger.MESSAGES.NOTIF_UPDATE_SUCCESS, 'success');
    } catch (e) {
        console.error(e);
        if (e.message && e.message.includes('partner or affiliate status')) {
            showNotification(window.logger.MESSAGES.NOTIF_DEMO_MODE, 'warning');
            try {
                const rewards = await window.api.invoke('get-mock-rewards');
                currentRewards = rewards || [];
                refreshUI();
            } catch (mockError) {
                rewardsList.innerHTML = `
                    <div class="empty-list" style="text-align: center; padding: 20px;">
                        <p><strong>Fonctionnalité restreinte</strong></p>
                        <p style="font-size: 0.9em; color: var(--text-secondary); margin-top: 10px;">
                            La gestion réelle nécessite le statut <strong>Affilié</strong> ou <strong>Partenaire</strong>.
                        </p>
                    </div>`;
            }
        } else {
            rewardsList.innerHTML = '<div class="error-msg">Erreur lors du chargement des récompenses. Vérifiez la connexion du bot.</div>';
            showNotification('Erreur chargement', 'error');
        }
    }
}

function refreshUI() {
    if (!rewardsList) return;
    rewardsList.innerHTML = '';
    renderFolders();
    renderRewardsMain(currentRewards);
}



function renderRewardsMain(rewards) {
    if (!rewardsList) return;

    let orphanedRewards = rewards.filter(r => {
        return !rewardFolders.some(f => f.rewardIds && f.rewardIds.includes(r.id));
    });

    if (orphanedRewards.length === 0 && rewardFolders.length === 0) {
        rewardsList.innerHTML = '<div class="empty-list">Aucune récompense personnalisée trouvée.</div>';
        return;
    }

    orphanedRewards.sort((a, b) => a.cost - b.cost);

    orphanedRewards.forEach(reward => {
        renderRewardCard(reward);
    });
}

function renderRewardCard(reward) {
    const card = document.createElement('div');
    card.className = 'reward-card';
    card.id = `reward-card-${reward.id}`;
    card.draggable = true;
    card.dataset.rewardId = reward.id;

    card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/type', 'reward');
        e.dataTransfer.setData('text/id', reward.id);
        e.dataTransfer.effectAllowed = 'move';
        card.style.opacity = '0.5';
    });

    card.addEventListener('dragend', (e) => {
        card.style.opacity = '1';
    });

    card.style.borderLeft = `5px solid ${reward.background_color}`;

    const details = document.createElement('div');
    details.className = 'reward-details';

    const hasSound = savedRewardSounds[reward.id];
    const soundIcon = hasSound ? '<span title="Son configuré">🔊</span> ' : '';

    const title = document.createElement('div');
    title.className = 'reward-title';
    title.innerHTML = `${soundIcon}<strong>${reward.title}</strong> <span class="cost-badge">${reward.cost} pts</span>`;

    const sub = document.createElement('div');
    sub.className = 'reward-sub';
    const cooldownSetting = reward.global_cooldown_setting || { is_enabled: false, global_cooldown_seconds: 0 };
    const cooldownTxt = cooldownSetting.is_enabled ? `${cooldownSetting.global_cooldown_seconds}s` : 'Aucun';
    sub.textContent = `Cooldown: ${cooldownTxt} | Status: ${reward.is_enabled ? 'Activé' : 'Désactivé'}`;

    details.appendChild(title);
    details.appendChild(sub);

    const actions = document.createElement('div');
    actions.className = 'reward-actions';

    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'reward-toggle-container';
    toggleContainer.style.display = 'flex';
    toggleContainer.style.alignItems = 'center';
    toggleContainer.style.marginRight = '10px';

    const toggleSwitch = document.createElement('label');
    toggleSwitch.className = 'toggle-switch';
    toggleSwitch.title = reward.is_enabled ? 'Désactiver' : 'Activer';

    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = reward.is_enabled;
    toggleInput.addEventListener('change', async (e) => {
        e.stopPropagation();
        const newState = toggleInput.checked;
        try {
            await API.points.updateReward(reward.id, { is_enabled: newState });
            reward.is_enabled = newState;
            sub.textContent = `Cooldown: ${cooldownTxt} | Status: ${newState ? 'Activé' : 'Désactivé'}`;
            toggleSwitch.title = newState ? 'Désactiver' : 'Activer';
            showNotification(`Récompense ${newState ? 'activée' : 'désactivée'}`, 'success');
        } catch (err) {
            console.error(err);
            toggleInput.checked = !newState;
            showNotification('Erreur lors du changement de statut', 'error');
        }
    });

    const slider = document.createElement('span');
    slider.className = 'slider';

    toggleSwitch.appendChild(toggleInput);
    toggleSwitch.appendChild(slider);
    toggleContainer.appendChild(toggleSwitch);

    const editBtn = document.createElement('button');
    editBtn.className = 'btn btn-secondary btn-sm';
    editBtn.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>';
    editBtn.title = 'Modifier';
    editBtn.onclick = () => openEditor(reward);

    const deleteControl = createDeleteControl(async () => {
        try {
            await API.points.deleteReward(reward.id);
            const newSounds = { ...savedRewardSounds };
            delete newSounds[reward.id];
            await window.api.invoke('save-reward-sounds', newSounds);
            savedRewardSounds = newSounds;

            showNotification('Récompense supprimée', 'success');
            loadRewards();
        } catch (e) {
            console.error(e);
            showNotification(NOTIFICATIONS.ERROR.DELETE.replace('{error}', e.message), 'error');
        }
    });

    if (isDevMode) {
        const triggerBtn = document.createElement('button');
        triggerBtn.className = 'btn btn-primary btn-sm';
        triggerBtn.innerHTML = '⚡';
        triggerBtn.title = 'Déclencher (Test / Démo)';
        triggerBtn.onclick = () => API.points.triggerMockRedemption(reward.id);
        actions.appendChild(triggerBtn);
    }

    actions.appendChild(toggleContainer);
    actions.appendChild(editBtn);
    actions.appendChild(deleteControl);

    card.appendChild(details);
    card.appendChild(actions);
    rewardsList.appendChild(card);
};


function openEditor(reward = null) {
    if (!rewardEditorContainer) return;

    isEditing = !!reward;
    editingId = reward ? reward.id : null;

    document.getElementById('reward-editor-title').textContent = isEditing ? 'Modifier la récompense' : 'Nouvelle récompense';
    document.getElementById('saveRewardEditorBtn').textContent = isEditing ? 'Sauvegarder' : 'Créer';

    document.getElementById('rewardNameInput').value = reward ? reward.title : '';
    document.getElementById('rewardCostInput').value = reward ? reward.cost : 100;
    document.getElementById('rewardPromptInput').value = reward ? (reward.prompt || '') : '';
    document.getElementById('rewardColorInput').value = reward ? reward.background_color : DEFAULT_COLOR;

    const hasCooldown = reward && reward.global_cooldown_setting && reward.global_cooldown_setting.is_enabled;
    document.getElementById('rewardCooldownInput').value = hasCooldown ? reward.global_cooldown_setting.global_cooldown_seconds : 0;
    document.getElementById('rewardUserInputInput').checked = (reward && reward.is_user_input_required);

    const stripPrefix = (path) => path ? path.replace(/^file:\/\/+/, '') : path;
    const soundVal = (reward && savedRewardSounds[reward.id]) ? savedRewardSounds[reward.id] : '';
    const imageVal = (reward && savedRewardImages[reward.id]) ? savedRewardImages[reward.id] : '';

    const soundInput = document.getElementById('rewardSoundInput');
    const imageInput = document.getElementById('rewardImageInput');

    soundInput.value = stripPrefix(soundVal);
    soundInput.dataset.path = soundVal;

    imageInput.value = stripPrefix(imageVal);
    imageInput.dataset.path = imageVal;

    const functionVal = (reward && savedRewardFunctions[reward.id]) ? savedRewardFunctions[reward.id] : '';
    const funcBtn = document.getElementById('rewardFunctionBtn');
    const funcOptions = document.querySelectorAll('.custom-picker-option');

    let found = false;
    funcOptions.forEach(opt => {
        opt.classList.remove('selected');
        if (opt.dataset.value === functionVal) {
            opt.classList.add('selected');
            funcBtn.textContent = opt.textContent;
            funcBtn.dataset.value = functionVal;
            found = true;
        }
    });
    if (!found) {
        funcBtn.textContent = 'Aucune';
        funcBtn.dataset.value = '';
    }

    rewardEditorContainer.classList.remove('hidden');
    rewardsList.classList.add('hidden');
}

function closeEditor() {
    if (rewardEditorContainer) {
        rewardEditorContainer.classList.add('hidden');
    }
    if (rewardsList) rewardsList.classList.remove('hidden');
    isEditing = false;
    editingId = null;
}

async function saveReward() {
    const title = document.getElementById('rewardNameInput').value.trim();
    const cost = parseInt(document.getElementById('rewardCostInput').value, 10);
    const color = document.getElementById('rewardColorInput').value;
    const cooldown = parseInt(document.getElementById('rewardCooldownInput').value, 10);
    const userInput = document.getElementById('rewardUserInputInput').checked;


    const promptText = document.getElementById('rewardPromptInput').value.trim();

    const soundInput = document.getElementById('rewardSoundInput');
    const soundPath = soundInput ? (soundInput.dataset.path || '') : '';

    const imageInput = document.getElementById('rewardImageInput');
    const imagePath = imageInput ? (imageInput.dataset.path || '') : '';

    if (!title || cost < 1) {
        showNotification('Nom et coût (>0) requis', 'error');
        return;
    }

    const isDuplicate = currentRewards.some(r =>
        r.title.toLowerCase() === title.toLowerCase() && r.id !== editingId
    );

    if (isDuplicate) {
        showNotification(`Une récompense nommée "${title}" existe déjà`, 'error');
        return;
    }

    const data = {
        title: title,
        cost: cost,
        background_color: color,
        is_user_input_required: userInput,
        prompt: promptText,
        is_global_cooldown_enabled: cooldown > 0,
        global_cooldown_seconds: cooldown > 0 ? cooldown : undefined
    };

    if (isEditing) {
        const currentReward = currentRewards.find(r => r.id === editingId);
        if (currentReward) {
            data.is_enabled = currentReward.is_enabled;
        }
    } else {
        data.is_enabled = true;
    }


    if (cooldown > 0) {
        data.is_global_cooldown_enabled = true;
        data.global_cooldown_seconds = cooldown;
    } else {
        data.is_global_cooldown_enabled = false;
        data.global_cooldown_seconds = 0;
    }


    if (cooldown > 0) {
        data.is_global_cooldown_enabled = true;
        data.global_cooldown_seconds = cooldown;
    } else {
        data.is_global_cooldown_enabled = false;
        data.global_cooldown_seconds = 0;
    }

    try {
        let finalId = editingId;
        if (isEditing) {
            try {
                await API.points.updateReward(editingId, data);
                showNotification('Récompense modifiée', 'success');
            } catch (e) {
                const isForbidden = e.message && (e.message.includes('403') || e.message.includes('Forbidden'));
                if (isForbidden) {
                    console.warn('[POINTS] Cannot edit Twitch reward (not owned). Saving local config only.');
                    showNotification('Réglages Twitch bloqués (externe), alerte sauvegardée', 'warning');
                } else {
                    throw e;
                }
            }
        } else {
            const newRew = await API.points.createReward(data);
            finalId = newRew.id;
            showNotification('Récompense créée', 'success');
        }

        if (finalId) {
            const newSounds = { ...savedRewardSounds };
            if (soundPath) {
                newSounds[finalId] = soundPath;
            } else {
                delete newSounds[finalId];
            }
            await window.api.invoke('save-reward-sounds', newSounds);
            savedRewardSounds = newSounds;

            const newImages = { ...savedRewardImages };
            if (imagePath) {
                newImages[finalId] = imagePath;
            } else {
                delete newImages[finalId];
            }
            await window.api.invoke('save-reward-images', newImages);
            savedRewardImages = newImages;

            const newFunctions = { ...savedRewardFunctions };
            const funcValue = document.getElementById('rewardFunctionBtn').dataset.value;
            if (funcValue) {
                newFunctions[finalId] = funcValue;
            } else {
                delete newFunctions[finalId];
            }
            await window.api.invoke('save-reward-functions', newFunctions);
            savedRewardFunctions = newFunctions;


        }


        closeEditor();
        loadRewards();
    } catch (e) {
        console.error(e);
        showNotification(NOTIFICATIONS.ERROR.SAVE + ' ' + (e.message || ''), 'error');
    }
}

async function createFolder() {
    const newFolder = {
        id: 'folder-' + Date.now(),
        name: 'Nouveau Dossier',
        is_enabled: true,
        rewardIds: []
    };
    rewardFolders.push(newFolder);
    const folderEl = createFolderElement(newFolder);
    const firstReward = rewardsList.querySelector('.reward-card');
    if (firstReward) {
        rewardsList.insertBefore(folderEl, firstReward);
    } else {
        rewardsList.appendChild(folderEl);
    }
}

async function updateLocalFolders() {
    await window.api.invoke('save-reward-folders', rewardFolders);
}

function renderFolders() {
    if (!rewardsList) return;

    rewardFolders.forEach(folder => {
        rewardsList.appendChild(createFolderElement(folder));
    });
}

function createFolderElement(folder) {
    const folderEl = document.createElement('div');
    folderEl.className = 'reward-folder';
    folderEl.dataset.folderId = folder.id;

    folderEl.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        folderEl.classList.add('drag-over');
    });

    folderEl.addEventListener('dragleave', () => {
        folderEl.classList.remove('drag-over');
    });

    folderEl.addEventListener('drop', async (e) => {
        e.preventDefault();
        folderEl.classList.remove('drag-over');
        const type = e.dataTransfer.getData('text/type');
        const id = e.dataTransfer.getData('text/id');
        const sourceFolderId = e.dataTransfer.getData('text/source-folder');

        if (type === 'reward' && id) {
            if (sourceFolderId && sourceFolderId !== folder.id) {
                const srcFolder = rewardFolders.find(f => f.id === sourceFolderId);
                if (srcFolder) {
                    srcFolder.rewardIds = srcFolder.rewardIds.filter(rid => rid !== id);
                }
            } else if (!sourceFolderId) {
            } else if (sourceFolderId === folder.id) {
                return;
            }
            if (!folder.rewardIds.includes(id)) {
                folder.rewardIds.push(id);

                if (sourceFolderId && sourceFolderId !== folder.id) {
                    const srcFolder = rewardFolders.find(f => f.id === sourceFolderId);
                    if (srcFolder) {
                        srcFolder.rewardIds = srcFolder.rewardIds.filter(rid => rid !== id);
                        const oldFolderEl = document.querySelector(`.reward-folder[data-folder-id="${sourceFolderId}"]`);
                        if (oldFolderEl) {
                            const oldChip = oldFolderEl.querySelector(`.reward-chip[data-reward-id="${id}"]`);
                            if (oldChip) oldChip.remove();
                        }
                    }
                } else if (!sourceFolderId) {
                    const card = document.getElementById(`reward-card-${id}`);
                    if (card) card.remove();
                }

                const reward = currentRewards.find(r => String(r.id) === String(id));
                if (reward) {
                    const chip = createRewardChip(reward, folder.id);
                    folderEl.querySelector('.folder-content').appendChild(chip);

                    const placeholder = folderEl.querySelector('.folder-empty-placeholder');
                    if (placeholder) placeholder.remove();
                }

                await updateLocalFolders();
            }
        }
    });

    const header = document.createElement('div');
    header.className = 'folder-header';

    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.className = 'folder-name-input';
    nameInput.value = folder.name;

    const saveName = async () => {
        if (folder.name !== nameInput.value) {
            folder.name = nameInput.value;
            await updateLocalFolders();
        }
    };
    nameInput.addEventListener('blur', saveName);
    nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') nameInput.blur();
    });

    const toggleContainer = document.createElement('div');
    toggleContainer.className = 'folder-toggle-container';

    const toggleSwitch = document.createElement('label');
    toggleSwitch.className = 'toggle-switch';

    const toggleInput = document.createElement('input');
    toggleInput.type = 'checkbox';
    toggleInput.checked = folder.is_enabled;
    toggleInput.addEventListener('change', async () => {
        folder.is_enabled = toggleInput.checked;
        await toggleFolder(folder);
    });

    const slider = document.createElement('span');
    slider.className = 'slider';

    toggleSwitch.appendChild(toggleInput);
    toggleSwitch.appendChild(slider);
    toggleContainer.appendChild(toggleSwitch);
    toggleContainer.appendChild(document.createTextNode('Activer tout'));

    const deleteControl = createDeleteControl(async () => {
        rewardFolders = rewardFolders.filter(f => f.id !== folder.id);
        await updateLocalFolders();
        refreshUI();
        showNotification('Dossier supprimé', 'success');
    });

    const content = document.createElement('div');
    content.className = 'folder-content';

    if (folder.rewardIds.length === 0) {
        const placeholder = document.createElement('span');
        placeholder.className = 'folder-empty-placeholder';
        placeholder.textContent = 'Glissez des récompenses ici...';
        content.appendChild(placeholder);
    } else {
        folder.rewardIds.forEach(rewId => {
            const reward = currentRewards.find(r => r.id === rewId);
            if (reward) {
                const chip = createRewardChip(reward, folder.id);
                content.appendChild(chip);
            }
        });
    }

    header.appendChild(nameInput);
    header.appendChild(content);
    header.appendChild(toggleContainer);
    header.appendChild(deleteControl);

    folderEl.appendChild(header);

    return folderEl;
}

function createRewardChip(reward, folderId) {
    const chip = document.createElement('div');
    chip.className = 'reward-chip';
    chip.draggable = true;
    chip.dataset.rewardId = reward.id;
    chip.style.borderLeftColor = reward.background_color;

    chip.innerHTML = `<strong>${reward.title}</strong> <span class="chip-cost">${reward.cost}</span>`;

    chip.onclick = () => openEditor(reward);

    chip.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/type', 'reward');
        e.dataTransfer.setData('text/id', reward.id);
        e.dataTransfer.setData('text/source-folder', folderId);
        e.dataTransfer.effectAllowed = 'move';
        setTimeout(() => chip.style.opacity = '0.5', 0);
    });

    chip.addEventListener('dragend', () => {
        chip.style.opacity = '1';
    });

    return chip;
}

async function toggleFolder(folder) {
    const newState = folder.is_enabled;
    for (const rid of folder.rewardIds) {
        const reward = currentRewards.find(r => r.id === rid);
        if (reward && reward.is_enabled !== newState) {
            try {
                await API.points.updateReward(reward.id, { is_enabled: newState });
                reward.is_enabled = newState;
            } catch (e) {
                console.error(`Failed to toggle reward ${reward.title}`, e);
            }
        }
    }
    refreshUI();
}

document.addEventListener('DOMContentLoaded', init);

