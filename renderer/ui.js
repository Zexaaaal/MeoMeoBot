import { API } from './api.js';
export function showNotification(message, type = 'success', duration = 3000) {
    const container = document.getElementById('notification-container');
    if (!container) return;

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;
    notification.textContent = message;

    container.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'fadeOut 0.3s ease-in forwards';
        setTimeout(() => notification.remove(), 300);
    }, duration);
}

export function showStatus(elementId, message, type = 'success', duration = 3000) {
    const el = document.getElementById(elementId);
    if (!el || elementId === 'global-status-msg') {
        showNotification(message, type, duration);
        return;
    }

    el.textContent = message;
    el.className = `status-msg ${type}`;
    el.style.opacity = '1';

    if (el.dataset.timeoutId) clearTimeout(parseInt(el.dataset.timeoutId));

    if (duration > 0) {
        const timeoutId = setTimeout(() => {
            el.style.opacity = '0';
            setTimeout(() => {
                el.textContent = '';
                el.className = 'status-msg';
            }, 300);
        }, duration);
        el.dataset.timeoutId = timeoutId;
    }
}

export function setupConfirmationOverlay() {
}

export function setupWindowControls() {
    document.getElementById('minimize-btn').addEventListener('click', () => window.api.send('window-control', 'minimize'));
    document.getElementById('maximize-btn').addEventListener('click', () => window.api.send('window-control', 'maximize'));
    document.getElementById('close-btn').addEventListener('click', () => window.api.send('window-control', 'close'));
}

export function updateUpdaterStatus(status) {
    const statusEl = document.getElementById('updateStatus');
    if (!statusEl) return;

    statusEl.className = 'status';
    statusEl.classList.add(status);

    const textEl = statusEl.querySelector('.update-text-label');
    if (status === 'checking') textEl.textContent = 'Recherche...';
    if (status === 'up-to-date') textEl.textContent = 'À jour';
    if (status === 'update-available') textEl.textContent = 'MàJ dispo';
    if (status === 'downloading') textEl.textContent = 'Téléchargement...';
    if (status === 'downloaded') textEl.textContent = 'Prêt à installer';
    if (status === 'error') textEl.textContent = 'Erreur maj';
}



export const NOTIFICATIONS = {
    SUCCESS: {
        SAVED: "Sauvegardé",
        CLEARED: "Liste vidée",
        CONNECTED: "Bot connecté",
        DISCONNECTED: "Bot déconnecté",
        GIVEAWAY_STARTED: "Giveaway démarré",
        GIVEAWAY_STOPPED: "Giveaway fermé",
        COMMAND_MODIFIED: "Commande modifiée",
        THEME_DELETED: "Thème supprimé",
        THEME_APPLIED: "Thème réinitialisé et appliqué",
        THEME_RELOADED: "Thème rechargé et appliqué",
        RESET: "Réinitialisé",
        CONFIG_RESET: "Configuration réinitialisée"
    },
    ERROR: {
        SAVE: "Erreur de sauvegarde",
        DELETE: "Erreur de suppression : {error}",
        ADD: "Echec de l'ajout : {error}",
        CLEAR: "Erreur nettoyage : {error}",
        LOAD: "Erreur de chargement : {error}",
        START: "Erreur de démarrage: {error}",
        STOP: "Erreur de fermeture : {error}",
        CONNECT: "Erreur de connexion: {error}",
        GENERIC: "Erreur : {error}",
        MISSING_FIELDS: "Remplissez la commande et la réponse"
    },
    BANNED_WORD_ADDED: '"{word}" banni',
    BANNED_WORD_REMOVED: '"{word}" débanni',
    GIVEAWAY_WINNER: "Vainqueur : {winner}",
    GIVEAWAY_NO_PARTICIPANT: "Aucun participant",
    COMMAND_ADDED: "Commande {cmd} ajoutée",
    THEME_CREATED: 'Thème "{name}" créé avec succès !',
    THEME_IMPORT_ERROR: "Erreur lors de l'importation : {error}"
};

export const ICONS = {

    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
    save: '<svg viewBox="0 0 24 24" fill="none" stroke="#00b35f" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>',
    cancel: '<svg viewBox="0 0 24 24" fill="none" stroke="#e91916" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
    trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>'
};

export function createDeleteControl(onConfirm) {
    const container = document.createElement('div');
    container.className = 'controls inline-controls';

    const delBtn = document.createElement('button');
    delBtn.className = 'control-button delete-btn';
    delBtn.innerHTML = ICONS.trash;
    delBtn.title = 'Supprimer';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'control-button confirm-btn';
    confirmBtn.style.display = 'none';
    confirmBtn.innerHTML = ICONS.save;
    confirmBtn.title = 'Confirmer';

    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'control-button cancel-btn';
    cancelBtn.style.display = 'none';
    cancelBtn.innerHTML = ICONS.cancel;
    cancelBtn.title = 'Annuler';

    setupInlineConfirmLogic(delBtn, confirmBtn, cancelBtn, onConfirm);

    container.appendChild(delBtn);
    container.appendChild(confirmBtn);
    container.appendChild(cancelBtn);

    return container;
}

export function setupInlineConfirmLogic(triggerBtn, confirmBtn, cancelBtn, onConfirm) {
    if (!triggerBtn || !confirmBtn || !cancelBtn) return;

    triggerBtn.onclick = () => {
        triggerBtn.style.display = 'none';
        confirmBtn.style.display = 'inline-flex';
        cancelBtn.style.display = 'inline-flex';
    };

    cancelBtn.onclick = () => {
        confirmBtn.style.display = 'none';
        cancelBtn.style.display = 'none';
        triggerBtn.style.display = 'inline-flex';
    };

    confirmBtn.onclick = async () => {
        if (onConfirm) await onConfirm();
        confirmBtn.style.display = 'none';
        cancelBtn.style.display = 'none';
        triggerBtn.style.display = 'inline-flex';
    };
}




export function createRow() {
    const div = document.createElement('div');
    div.className = 'form-row';
    return div;
}

export function createInputGroup(label, value, onChange, type = 'text', id = null) {
    const div = document.createElement('div');
    div.className = 'form-group';
    div.innerHTML = `<label>${label}</label>`;
    const input = document.createElement('input');
    input.type = type;
    input.value = value;
    if (id) input.id = id;
    input.addEventListener('input', (e) => onChange(e.target.value));
    div.appendChild(input);
    return div;
}

export function createSliderGroup(label, value, onChange) {
    const div = document.createElement('div');
    div.className = 'form-group';
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.innerHTML = `<label>${label}</label><span>${Math.round(value * 100)}%</span>`;

    const input = document.createElement('input');
    input.type = 'range';
    input.min = 0;
    input.max = 1;
    input.step = 0.05;
    input.value = value;
    input.style.width = '100%';
    input.addEventListener('input', (e) => {
        header.querySelector('span').textContent = `${Math.round(e.target.value * 100)}%`;
        onChange(e.target.value);
    });
    div.appendChild(header);
    div.appendChild(input);
    return div;
}

export function createSelectGroup(label, value, options, onChange) {
    const div = document.createElement('div');
    div.className = 'form-group';
    div.innerHTML = `<label>${label}</label>`;
    const select = document.createElement('select');
    options.forEach(opt => {
        const o = document.createElement('option');
        o.value = opt.value;
        o.textContent = opt.label;
        if (opt.value === value) o.selected = true;
        select.appendChild(o);
    });
    select.addEventListener('change', (e) => onChange(e.target.value));
    div.appendChild(select);
    return div;
}

export function createFilePickerGroup(label, value, type, onChange, id = null) {
    const div = document.createElement('div');
    div.className = 'form-group';
    div.innerHTML = `<label>${label}</label>`;

    const container = document.createElement('div');
    container.className = 'file-picker-container';

    const input = document.createElement('input');
    input.type = 'text';
    const stripPrefix = (path) => path ? path.replace(/^file:\/\//, '') : '';
    input.value = stripPrefix(value);
    input.dataset.path = value || '';
    input.readOnly = true;
    input.className = 'interactive-input';
    input.placeholder = type === 'image' ? 'Cliquer pour choisir une image' : 'Cliquer pour choisir un son';
    if (id) input.id = id;

    const clearBtn = document.createElement('button');
    clearBtn.className = 'btn btn-secondary clear-btn';
    clearBtn.innerHTML = '✖';
    clearBtn.title = 'Vider';

    const openDialog = async () => {
        const filters = type === 'image'
            ? [{ name: 'Images', extensions: ['jpg', 'png', 'gif'] }]
            : [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg'] }];

        try {
            const path = await API.openFileDialog(filters);
            if (path) {
                const fileUri = `file://${path.replace(/\\/g, '/')}`;
                input.value = stripPrefix(fileUri);
                input.dataset.path = fileUri;
                onChange(fileUri);
            }
        } catch (e) {
            console.error(e);
        }
    };

    input.onclick = openDialog;
    clearBtn.onclick = () => {
        input.value = '';
        input.dataset.path = '';
        onChange('');
    };

    container.appendChild(input);
    container.appendChild(clearBtn);
    div.appendChild(container);
    return div;
}

export function createCheckboxGroup(label, checked, onChange) {
    const div = document.createElement('div');
    div.className = 'form-group checkbox-group';
    const labelEl = document.createElement('label');
    labelEl.textContent = label;

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    input.addEventListener('change', (e) => onChange(e.target.checked));

    labelEl.appendChild(input);
    div.appendChild(labelEl);
    return div;
}
