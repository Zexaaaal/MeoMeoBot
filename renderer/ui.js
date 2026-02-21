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
        SAVED: window.logger.MESSAGES.NOTIF_SUCCESS_SAVED,
        CLEARED: window.logger.MESSAGES.NOTIF_SUCCESS_CLEARED,
        CONNECTED: window.logger.MESSAGES.NOTIF_SUCCESS_CONNECTED,
        DISCONNECTED: window.logger.MESSAGES.NOTIF_SUCCESS_DISCONNECTED,
        GIVEAWAY_STARTED: window.logger.MESSAGES.NOTIF_SUCCESS_GIVEAWAY_STARTED,
        GIVEAWAY_STOPPED: window.logger.MESSAGES.NOTIF_SUCCESS_GIVEAWAY_STOPPED,
        COMMAND_MODIFIED: window.logger.MESSAGES.NOTIF_SUCCESS_COMMAND_MODIFIED,
        THEME_DELETED: window.logger.MESSAGES.NOTIF_SUCCESS_THEME_DELETED,
        THEME_APPLIED: window.logger.MESSAGES.NOTIF_SUCCESS_THEME_APPLIED,
        THEME_RELOADED: window.logger.MESSAGES.NOTIF_SUCCESS_THEME_RELOADED,
        RESET: window.logger.MESSAGES.NOTIF_SUCCESS_RESET,
        CONFIG_RESET: window.logger.MESSAGES.NOTIF_SUCCESS_CONFIG_RESET
    },
    ERROR: {
        SAVE: window.logger.MESSAGES.NOTIF_ERROR_SAVE,
        DELETE: window.logger.MESSAGES.NOTIF_ERROR_DELETE,
        ADD: window.logger.MESSAGES.NOTIF_ERROR_ADD,
        CLEAR: window.logger.MESSAGES.NOTIF_ERROR_CLEAR,
        LOAD: window.logger.MESSAGES.NOTIF_ERROR_LOAD,
        START: window.logger.MESSAGES.NOTIF_ERROR_START,
        STOP: window.logger.MESSAGES.NOTIF_ERROR_STOP,
        CONNECT: window.logger.MESSAGES.NOTIF_ERROR_CONNECT,
        GENERIC: window.logger.MESSAGES.NOTIF_ERROR_GENERIC,
        MISSING_FIELDS: window.logger.MESSAGES.NOTIF_ERROR_MISSING_FIELDS
    },
    BANNED_WORD_ADDED: window.logger.MESSAGES.NOTIF_BANNED_WORD_ADDED,
    BANNED_WORD_REMOVED: window.logger.MESSAGES.NOTIF_BANNED_WORD_REMOVED,
    GIVEAWAY_WINNER: window.logger.MESSAGES.NOTIF_GIVEAWAY_WINNER,
    GIVEAWAY_NO_PARTICIPANT: window.logger.MESSAGES.NOTIF_GIVEAWAY_NO_PARTICIPANT,
    COMMAND_ADDED: window.logger.MESSAGES.NOTIF_COMMAND_ADDED,
    THEME_CREATED: window.logger.MESSAGES.NOTIF_THEME_CREATED,
    THEME_IMPORT_ERROR: window.logger.MESSAGES.NOTIF_THEME_IMPORT_ERROR
};

export const ICONS = {
    edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>',
    confirm: '<svg viewBox="0 0 304.25 208.55" fill="none" stroke="currentColor" stroke-width="20"><line x1="98.55" y1="205.69" x2="301.39" y2="2.86"></line><line x1="2.86" y1="104.27" x2="104.27" y2="205.69"></line></svg>',
    cancel: '<svg viewBox="0 0 208.55 208.55" fill="none" stroke="currentColor" stroke-width="20"><line x1="2.86" y1="205.69" x2="205.69" y2="2.86"></line><line x1="205.69" y1="205.69" x2="2.86" y2="2.86"></line></svg>',
    trash: '<svg viewBox="0 0 177.59 205.4" fill="none" stroke="currentColor" stroke-width="8.08"><path d="M0,43.5h177.59M157.86,43.5v138.12c0,10.9-8.83,19.73-19.73,19.73H39.46c-10.9,0-19.73-8.83-19.73-19.73V43.5M49.33,43.5v-19.73c0-10.9,8.83-19.73,19.73-19.73h39.46c10.9,0,19.73,8.83,19.73,19.73v19.73"></path></svg>',
    folder: '<svg viewBox="0 0 251.88 227.5" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="8.08"><path d="M247.84,199.08c0,13.46-10.92,24.38-24.38,24.38H28.42c-13.46,0-24.38-10.92-24.38-24.38V28.42C4.04,14.96,14.96,4.04,28.42,4.04h60.95l24.38,36.57h109.71c13.46,0,24.38,10.92,24.38,24.38v134.09Z"></path></svg>'
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
    confirmBtn.innerHTML = ICONS.confirm;
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
