const api = window.api;
import { showNotification } from './ui.js';

let currentConfig = {
    goals: []
};

let selectedGoalIndex = 0;

const goalsList = document.getElementById('goalsList');
const newGoalLabel = document.getElementById('newGoalLabel');
const newGoalTarget = document.getElementById('newGoalTarget');
const newGoalSource = document.getElementById('newGoalSource');
const addGoalBtn = document.getElementById('addGoalBtn');
const saveBtn = document.getElementById('saveBtn');
const closeBtn = document.getElementById('close-btn');
const previewFrame = document.getElementById('preview-frame');

const SOURCE_LABELS = {
    subs: 'Subs',
    followers: 'Followers'
};

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const config = await api.invoke('get-widget-config', 'goals');
        if (config) {
            currentConfig = { ...currentConfig, ...config };
        }
    } catch (e) {
        console.error('Error loading goals config', e);
    }
    updateUI();
    setupEventListeners();
});

function updateUI() {
    renderGoalsList();
    renderPreview();
}

function generateGoalId() {
    let maxId = 0;
    if (currentConfig.goals && currentConfig.goals.length > 0) {
        currentConfig.goals.forEach(g => {
            const idNum = parseInt(g.id);
            if (!isNaN(idNum) && idNum > maxId) {
                maxId = idNum;
            }
        });
    }
    return String(maxId + 1);
}

function renderGoalsList() {
    goalsList.innerHTML = '';

    if (!currentConfig.goals || currentConfig.goals.length === 0) {
        goalsList.innerHTML = '<div class="empty-state">Aucun goal configuré</div>';
        return;
    }

    currentConfig.goals.forEach((goal, index) => {
        const div = document.createElement('div');
        div.className = 'goal-item';
        if (index === selectedGoalIndex) {
            div.style.background = 'var(--bg-tertiary)';
        }

        div.innerHTML = `
            <div class="goal-info">
                <span class="goal-target">${goal.targetCount || 0}</span>
                <span class="goal-label-text">${goal.label || 'Sans nom'}</span>
                <span class="goal-source-badge">${SOURCE_LABELS[goal.sourceType] || goal.sourceType || 'subs'}</span>
            </div>
            <div class="goal-actions">
                <button class="goal-action-btn copy-btn" data-index="${index}" title="Copier l'URL">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                    </svg>
                </button>
                <button class="goal-action-btn duplicate-btn" data-index="${index}" title="Dupliquer">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path>
                        <rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>
                    </svg>
                </button>
                <button class="goal-action-btn delete-btn" data-index="${index}" title="Supprimer">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"></path>
                    </svg>
                </button>
            </div>
        `;

        div.addEventListener('click', (e) => {
            if (!e.target.closest('.goal-action-btn')) {
                selectedGoalIndex = index;
                renderGoalsList();
                renderPreview();
            }
        });

        goalsList.appendChild(div);
    });

    // Attach button listeners
    goalsList.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(e.currentTarget.dataset.index, 10);
            currentConfig.goals.splice(idx, 1);
            if (selectedGoalIndex >= currentConfig.goals.length) {
                selectedGoalIndex = Math.max(0, currentConfig.goals.length - 1);
            }
            updateUI();
        });
    });

    goalsList.querySelectorAll('.copy-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const idx = parseInt(e.currentTarget.dataset.index, 10);
            const goal = currentConfig.goals[idx];
            if (goal) {
                try {
                    const url = await api.invoke('get-goal-widget-url', goal.id);
                    await navigator.clipboard.writeText(url);
                    showNotification('URL copiée !');
                } catch (err) {
                    showNotification('Erreur copie URL: ' + err.message, 'error');
                }
            }
        });
    });

    goalsList.querySelectorAll('.duplicate-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const idx = parseInt(e.currentTarget.dataset.index, 10);
            const goal = currentConfig.goals[idx];
            if (goal) {
                const newGoal = {
                    ...goal,
                    id: generateGoalId(),
                    label: goal.label + ' (copie)'
                };
                currentConfig.goals.splice(idx + 1, 0, newGoal);
                selectedGoalIndex = idx + 1;
                updateUI();
            }
        });
    });
}

function setupEventListeners() {
    closeBtn.addEventListener('click', () => {
        window.close();
    });

    saveBtn.addEventListener('click', async () => {
        try {
            await api.invoke('save-widget-config', 'goals', currentConfig);
            showNotification(window.logger.MESSAGES.NOTIF_SUCCESS_SAVED);
        } catch (e) {
            showNotification(window.logger.format(window.logger.MESSAGES.NOTIF_ERROR_SAVE, { error: e.message }), 'error');
        }
    });

    addGoalBtn.addEventListener('click', () => {
        const label = newGoalLabel.value.trim();
        const target = parseFloat(newGoalTarget.value);
        const source = newGoalSource.value;

        if (!label) {
            showNotification('Veuillez entrer un label', 'error');
            return;
        }
        if (isNaN(target) || target <= 0) {
            showNotification('Veuillez entrer un objectif valide', 'error');
            return;
        }

        currentConfig.goals.push({
            id: generateGoalId(),
            label,
            targetCount: target,
            sourceType: source,
            customCSS: ''
        });

        newGoalLabel.value = '';
        newGoalTarget.value = '';
        selectedGoalIndex = currentConfig.goals.length - 1;
        updateUI();
    });

    newGoalLabel.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            newGoalTarget.focus();
        }
    });

    newGoalTarget.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            addGoalBtn.click();
        }
    });
}

function getPreviewHtml() {
    const goal = currentConfig.goals[selectedGoalIndex];
    if (!goal) {
        return `
            <!DOCTYPE html>
            <html><head><style>
                body { margin: 0; display: flex; align-items: center; justify-content: center; height: 100vh; color: #888; font-family: sans-serif; background: transparent; }
            </style></head>
            <body><div>Sélectionnez un goal</div></body></html>
        `;
    }

    const targetCount = parseFloat(goal.targetCount) || 100;
    const currentCount = Math.floor(targetCount * 0.6); // Preview at 60%
    const percentage = Math.min(100, Math.max(0, (currentCount / targetCount) * 100));
    const label = goal.label || 'GOAL';

    const css = `
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;800&display=swap');
        body { margin: 0; overflow: hidden; font-family: 'Montserrat', sans-serif; background: transparent; }
        #widget-container { width: 100vw; height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 20px; box-sizing: border-box; }
        .progress-container { position: relative; width: 100%; max-width: 800px; height: 40px; background: rgba(0, 0, 0, 0.5); border-radius: 20px; overflow: hidden; border: 2px solid rgba(255, 255, 255, 0.2); margin-bottom: 5px; display: flex; align-items: center; justify-content: center; }
        .progress-bar { position: absolute; top: 0; left: 0; height: 100%; background: linear-gradient(90deg, #ff00cc, #333399); width: 0%; border-radius: 18px; transition: width 0.5s ease; box-shadow: 0 0 10px rgba(255, 0, 204, 0.5); z-index: 1; }
        .progress-value { position: relative; z-index: 10; color: white; font-weight: 800; font-size: 1.3rem; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8); white-space: nowrap; }
        .widget-label { color: white; font-weight: 800; font-size: 1.3rem; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8); text-transform: uppercase; }
        ${goal.customCSS || ''}
    `;

    return `
        <!DOCTYPE html>
        <html>
        <head><style>${css}</style></head>
        <body>
            <div id="widget-container">
                <div class="progress-container">
                    <div class="progress-bar" style="width: ${percentage}%"></div>
                    <div class="progress-value">${currentCount} / ${targetCount}</div>
                </div>
                <div class="widget-label">${label}</div>
            </div>
        </body>
        </html>
    `;
}

function renderPreview() {
    if (previewFrame) {
        previewFrame.srcdoc = getPreviewHtml();
    }
}
