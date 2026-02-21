const api = window.api;
import { showNotification } from './ui.js';

let currentConfig = {
    startCount: 0,
    goalCount: 100,
    currentCount: 0,
    steps: []
};

const startCountInput = document.getElementById('startCount');
const goalCountInput = document.getElementById('goalCount');
const stepsList = document.getElementById('stepsList');
const newStepCountInput = document.getElementById('newStepCount');
const newStepLabelInput = document.getElementById('newStepLabel');
const addStepBtn = document.getElementById('addStepBtn');
const saveBtn = document.getElementById('saveBtn');
const closeBtn = document.getElementById('close-btn');
const fetchCurrentBtn = document.getElementById('fetchCurrentBtn');
const resetBtn = document.getElementById('resetBtn');
const statusBar = document.getElementById('statusBar');
const previewFrame = document.getElementById('preview-frame');

const widgetHelper = {
    onRefresh: (cb) => {
        const load = async () => {
            const config = await api.invoke('get-widget-config', 'subgoals');
            cb(config);
        };
        load();
        api.on('refresh-widget-urls', load);
    }
};

document.addEventListener('DOMContentLoaded', async () => {

    widgetHelper.onRefresh((config) => {
        if (config) {
            currentConfig = { ...currentConfig, ...config };
            updateUI();
        }
    });

    setupEventListeners();
});

function updateUI() {
    startCountInput.value = currentConfig.startCount;
    goalCountInput.value = currentConfig.goalCount;
    renderStepsList();
    renderPreview();
}

function renderStepsList() {
    stepsList.innerHTML = '';
    if (currentConfig.steps && Array.isArray(currentConfig.steps)) {
        currentConfig.steps.forEach((step, index) => {
            const div = document.createElement('div');
            div.className = 'step-item';
            div.innerHTML = `
                <div class="step-info">
                    <span class="step-count">+${step.count}</span>
                    <span class="step-label">${step.label}</span>
                </div>
                <button class="delete-step-btn" data-index="${index}" title="Supprimer">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M18 6L6 18M6 6l12 12"></path>
                    </svg>
                </button>
            `;
            stepsList.appendChild(div);
        });

        document.querySelectorAll('.delete-step-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const index = parseInt(e.currentTarget.dataset.index, 10);
                currentConfig.steps.splice(index, 1);
                renderStepsList();
                renderPreview();
            });
        });
    }
}

function setupEventListeners() {
    closeBtn.addEventListener('click', () => {
        window.close();
    });

    saveBtn.addEventListener('click', async () => {
        currentConfig.startCount = parseFloat(startCountInput.value) || 0;
        currentConfig.goalCount = parseFloat(goalCountInput.value) || 100;

        try {
            await api.invoke('save-widget-config', 'subgoals', currentConfig);
            showNotification(window.logger.MESSAGES.NOTIF_SUCCESS_SAVED);
            renderPreview();
        } catch (e) {
            showNotification(window.logger.format(window.logger.MESSAGES.NOTIF_ERROR_SAVE, { error: e.message }), 'error');
        }
    });

    addStepBtn.addEventListener('click', () => {
        const count = parseFloat(newStepCountInput.value);
        const label = newStepLabelInput.value.trim();

        if (!isNaN(count) && label) {
            currentConfig.steps.push({ count, label });
            currentConfig.steps.sort((a, b) => a.count - b.count);

            newStepCountInput.value = '';
            newStepLabelInput.value = '';
            renderStepsList();
            renderPreview();
        }
    });


    let resetConfirmationTimeout;

    resetBtn.addEventListener('click', () => {
        if (resetBtn.textContent === 'Confirmer ?') {
            currentConfig.currentCount = currentConfig.startCount;
            updateUI();
            api.invoke('save-widget-config', 'subgoals', currentConfig).catch(e => console.error(e));

            resetBtn.textContent = 'Réinitialiser';
            clearTimeout(resetConfirmationTimeout);
        } else {
            resetBtn.textContent = 'Confirmer ?';
            resetConfirmationTimeout = setTimeout(() => {
                resetBtn.textContent = 'Réinitialiser';
            }, 3000);
        }
    });

    fetchCurrentBtn.addEventListener('click', async () => {
        try {
            const result = await api.invoke('get-sub-count');
            if (result && result.count !== undefined) {
                currentConfig.startCount = result.count;
                startCountInput.value = result.count;
                showNotification(window.logger.format(window.logger.MESSAGES.NOTIF_CURRENT_COUNT, { count: result.count }));
            }
        } catch (e) {
            showNotification(window.logger.format(window.logger.MESSAGES.NOTIF_API_ERROR, { error: e.message }), 'error');
        }
    });
}

function getPreviewHtml() {
    const sCount = parseFloat(currentConfig.startCount) || 0;
    const gCount = parseFloat(currentConfig.goalCount) || 100;
    const cCount = parseFloat(currentConfig.currentCount) || 0;
    const steps = currentConfig.steps || [];

    const css = `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap');
        body { margin: 0; padding: 0; overflow: hidden; font-family: 'Inter', sans-serif; background: transparent; }
        
        #widget-container { width: 100vw; height: 100vh; display: flex; flex-direction: column; justify-content: center; align-items: center; padding: 20px; box-sizing: border-box; }
        
        .progress-container { position: relative; width: 100%; max-width: 800px; height: 40px; background: rgba(0, 0, 0, 0.5); border-radius: 20px; border: 2px solid rgba(255, 255, 255, 0.2); }
        .markers-container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; border-radius: 18px; pointer-events: none; z-index: 5; }
        .progress-bar { height: 100%; background: linear-gradient(90deg, #ff00cc, #333399); width: 0%; border-radius: 18px; transition: width 0.3s ease; position: relative; box-shadow: 0 0 10px rgba(255, 0, 204, 0.5); z-index: 1; }
        .progress-text { position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: white; font-weight: 800; font-size: 1.2rem; text-shadow: 0 2px 4px rgba(0, 0, 0, 0.8); z-index: 10; white-space: nowrap; }
        
        .step-marker { position: absolute; top: 0; bottom: 0; width: 2px; background: rgba(255, 255, 255, 0.8); pointer-events: none; display: flex; flex-direction: column; align-items: center; overflow: visible; transform: translateX(-50%); }
        .step-label { position: absolute; top: -35px; background: rgba(0, 0, 0, 0.8); color: #fff; padding: 6px 10px; border-radius: 6px; font-size: 0.9rem; white-space: nowrap; border: 1px solid rgba(255, 255, 255, 0.3); z-index: 6; box-shadow: 0 4px 6px rgba(0,0,0,0.3); left: 50%; transform: translateX(-50%); --arrow-pos: 50%; }
        .step-label::after { content: ''; position: absolute; bottom: -5px; left: var(--arrow-pos); transform: translateX(-50%); border-width: 5px 5px 0; border-style: solid; border-color: rgba(0, 0, 0, 0.8) transparent transparent transparent; }
        
        ${currentConfig.customCSS || ''}
    `;

    let markersHtml = '';
    let labelsHtml = '';
    const totalRange = gCount - sCount;
    const progress = cCount - sCount;

    let percentage = 0;
    if (totalRange > 0) percentage = (progress / totalRange) * 100;
    if (percentage < 0) percentage = 0;
    if (percentage > 100) percentage = 100;

    const calculateShift = (percentage) => {
        if (percentage < 20) return (percentage / 20) * 50;
        if (percentage > 80) return 50 + ((percentage - 80) / 20) * 50;
        return 50;
    };

    if (steps && Array.isArray(steps)) {
        const sortedSteps = [...steps].sort((a, b) => parseFloat(a.count) - parseFloat(b.count));
        let nextGoalFound = false;

        sortedSteps.forEach(step => {
            const stepRelative = parseFloat(step.count);
            if (!isNaN(stepRelative)) {
                let stepPercentage = 0;
                if (totalRange > 0) stepPercentage = (stepRelative / totalRange) * 100;
                if (stepPercentage < 0) stepPercentage = 0;
                if (stepPercentage > 100) stepPercentage = 100;

                let labelHtml = '';
                let isNextGoal = false;
                if (!nextGoalFound && stepRelative > progress) {
                    isNextGoal = true;
                    nextGoalFound = true;
                }

                if (isNextGoal) {
                    const shift = calculateShift(stepPercentage);
                    labelHtml = `
                        <div class="step-label" style="display: block; transform: translateX(-${shift}%); --arrow-pos: ${shift}%">
                            ${step.label}
                        </div>
                    `;
                }

                markersHtml += `
                    <div class="step-marker" style="left: ${stepPercentage}%;">
                        ${labelHtml}
                    </div>
                `;
            }
        });
    }

    return `
        <!DOCTYPE html>
        <html>
        <head>
            <style>${css}</style>
        </head>
        <body>
            <div id="widget-container">
                <div class="progress-container">
                    <div class="markers-container">
                        ${markersHtml}
                    </div>
                    <div class="progress-bar" style="width: ${percentage}%"></div>
                    <div class="progress-text">${cCount} / ${gCount} Subs</div>
                </div>
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

