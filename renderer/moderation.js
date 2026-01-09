import { showStatus, createDeleteControl, NOTIFICATIONS } from './ui.js';
import { API } from './api.js';

export async function loadBannedWords() {
    try {
        const response = await API.moderation.getBannedWords();
        updateBannedWordsList(response.bannedWords || []);
    } catch (error) {
        console.error('Erreur chargement mots bannis:', error);
    }
}

function updateBannedWordsList(words) {
    const list = document.getElementById('bannedWordsList');
    list.innerHTML = '';

    words.forEach(word => {
        const div = document.createElement('div');
        div.className = 'list-item';

        const span = document.createElement('span');
        span.textContent = word;

        const deleteControl = createDeleteControl(() => removeBannedWord(word));

        div.appendChild(span);
        div.appendChild(deleteControl);

        list.appendChild(div);
    });
}

export async function addBannedWord() {
    const input = document.getElementById('newBannedWord');
    const word = input.value.trim();
    if (!word) return;

    try {
        await API.moderation.addBannedWord(word);
        input.value = '';
        loadBannedWords();
        showStatus('banned-words-status-msg', NOTIFICATIONS.BANNED_WORD_ADDED.replace('{word}', word), 'success');
    } catch (error) {
        showStatus('banned-words-status-msg', NOTIFICATIONS.ERROR.ADD.replace('{error}', error), 'error');
    }
}

async function removeBannedWord(word) {
    try {
        await API.moderation.removeBannedWord(word);
        loadBannedWords();
        showStatus('banned-words-status-msg', NOTIFICATIONS.BANNED_WORD_REMOVED.replace('{word}', word), 'success');
    } catch (error) {
        showStatus('banned-words-status-msg', NOTIFICATIONS.ERROR.DELETE.replace('{error}', error), 'error');
    }
}

export async function clearBannedWords() {
    try {
        await API.moderation.clearBannedWords();
        loadBannedWords();
        showStatus('clear-banned-words-status', NOTIFICATIONS.SUCCESS.CLEARED, 'success');
    } catch (error) {
        showStatus('clear-banned-words-status', NOTIFICATIONS.ERROR.CLEAR.replace('{error}', error), 'error');
        console.error(error);
    }
}

export async function saveAutoMessage() {
    const message = document.getElementById('autoMessage').value;
    const interval = parseInt(document.getElementById('autoMessageInterval').value, 10);

    try {
        await API.saveConfig({
            autoMessage: message,
            autoMessageInterval: interval
        });
        showStatus('auto-message-status', NOTIFICATIONS.SUCCESS.SAVED, 'success');
    } catch (error) {
        showStatus('auto-message-status', NOTIFICATIONS.ERROR.SAVE, 'error');
        console.error(error);
    }
}

export async function saveClipConfig() {
    const cooldown = parseInt(document.getElementById('clipCooldown').value, 10);
    try {
        await API.saveConfig({ clipCooldown: cooldown });
        showStatus('clip-config-status', NOTIFICATIONS.SUCCESS.SAVED, 'success');
    } catch (error) {
        showStatus('clip-config-status', NOTIFICATIONS.ERROR.SAVE, 'error');
        console.error(error);
    }
}

function setStatus(elementId, msg, type = 'success') {
    const statusMsg = document.getElementById(elementId);
    if (!statusMsg) return;

    statusMsg.textContent = msg;
    statusMsg.style.color = type === 'success' ? '#4ecca3' : '#e63946';
    statusMsg.style.opacity = '1';

    setTimeout(() => {
        statusMsg.style.opacity = '0';
        setTimeout(() => {
            statusMsg.textContent = '';
        }, 300);
    }, 2000);
}
