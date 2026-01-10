import { showNotification, createDeleteControl, NOTIFICATIONS } from './ui.js';
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
        showNotification(NOTIFICATIONS.BANNED_WORD_ADDED.replace('{word}', word), 'success');
    } catch (error) {
        showNotification(NOTIFICATIONS.ERROR.ADD.replace('{error}', error), 'error');
    }
}

async function removeBannedWord(word) {
    try {
        await API.moderation.removeBannedWord(word);
        loadBannedWords();
        showNotification(NOTIFICATIONS.BANNED_WORD_REMOVED.replace('{word}', word), 'success');
    } catch (error) {
        showNotification(NOTIFICATIONS.ERROR.DELETE.replace('{error}', error), 'error');
    }
}

export async function clearBannedWords() {
    try {
        await API.moderation.clearBannedWords();
        loadBannedWords();
        showNotification(NOTIFICATIONS.SUCCESS.CLEARED, 'success');
    } catch (error) {
        showNotification(NOTIFICATIONS.ERROR.CLEAR.replace('{error}', error), 'error');
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
        showNotification(NOTIFICATIONS.SUCCESS.SAVED, 'success');
    } catch (error) {
        showNotification(NOTIFICATIONS.ERROR.SAVE, 'error');
        console.error(error);
    }
}

export async function saveClipConfig() {
    const cooldown = parseInt(document.getElementById('clipCooldown').value, 10);
    try {
        await API.saveConfig({ clipCooldown: cooldown });
        showNotification(NOTIFICATIONS.SUCCESS.SAVED, 'success');
    } catch (error) {
        showNotification(NOTIFICATIONS.ERROR.SAVE, 'error');
        console.error(error);
    }
}


