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

export async function loadAutoMessages() {
    try {
        const config = await API.getConfig();
        const messages = config.autoMessages || [];
        updateAutoMessagesList(messages);
    } catch (error) {
        console.error('Erreur chargement auto-messages:', error);
    }
}




function updateAutoMessagesList(messages) {
    const list = document.getElementById('autoMessagesList');
    list.innerHTML = '';

    messages.forEach((item, index) => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.style.display = 'flex';
        div.style.alignItems = 'center';
        div.style.gap = '10px';
        div.style.marginBottom = '10px';
        div.style.padding = '10px';
        div.style.border = '1px solid var(--border-color)';
        div.style.borderRadius = '8px';
        div.style.backgroundColor = 'var(--bg-secondary)';

        div.innerHTML = `
            <div class="form-group" style="flex: 1; margin-bottom: 0;">
                <textarea class="auto-msg-input" rows="1" style="width:100%; resize:vertical; min-height: 38px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 4px; padding: 8px; color: var(--text-primary); font-family: inherit;" placeholder="Votre message ici...">${item.message}</textarea>
            </div>
            
            <div class="form-group" style="width: 80px; margin-bottom: 0;">
                <input type="number" class="auto-msg-interval" value="${item.interval}" min="1" style="width: 100%; padding: 8px; background: var(--bg-tertiary); border: 1px solid var(--border); border-radius: 4px; color: var(--text-primary); text-align: center;">
            </div>
            
            <div class="controls-wrapper" style="display:flex; gap:5px; align-items: center;">
                <button class="control-button save-btn" title="Sauvegarder" style="background: none; border: none; font-size: 20px; cursor: pointer; padding: 5px;">
                    💾
                </button>
                <!-- Delete Button will be appended here -->
            </div>
        `;

        const controlsWrapper = div.querySelector('.controls-wrapper');
        const saveBtn = div.querySelector('.save-btn');
        const msgInput = div.querySelector('.auto-msg-input');
        const intervalInput = div.querySelector('.auto-msg-interval');

        const deleteControl = createDeleteControl(() => removeAutoMessage(index));
        controlsWrapper.appendChild(deleteControl);

        saveBtn.addEventListener('click', () => updateAutoMessage(index, msgInput.value, intervalInput.value));

        list.appendChild(div);
    });
}

async function updateAutoMessage(index, newMessage, newInterval) {
    const interval = parseInt(newInterval, 10);
    if (!newMessage || isNaN(interval) || interval < 1) {
        showNotification('Données invalides', 'error');
        return;
    }

    try {
        const config = await API.getConfig();
        const messages = [...(config.autoMessages || [])];

        if (messages[index]) {
            messages[index] = { message: newMessage, interval };
            await API.saveConfig({ autoMessages: messages });
            showNotification(NOTIFICATIONS.SUCCESS.SAVED, 'success');
            loadAutoMessages();
        }
    } catch (error) {
        showNotification(NOTIFICATIONS.ERROR.SAVE, 'error');
        console.error(error);
    }
}

export async function addAutoMessage() {


    try {
        const config = await API.getConfig();
        const currentMessages = config.autoMessages || [];

        const newMessages = [...currentMessages, { message: '', interval: 40 }];

        await API.saveConfig({ autoMessages: newMessages });

        loadAutoMessages();
        setTimeout(() => {
            const list = document.getElementById('autoMessagesList');
            if (list) list.scrollTop = list.scrollHeight;
        }, 100);

    } catch (error) {
        showNotification(NOTIFICATIONS.ERROR.SAVE, 'error');
        console.error(error);
    }
}

async function removeAutoMessage(index) {
    try {
        const config = await API.getConfig();
        const currentMessages = config.autoMessages || [];

        const newMessages = currentMessages.filter((_, i) => i !== index);

        await API.saveConfig({ autoMessages: newMessages });
        loadAutoMessages();
        showNotification(NOTIFICATIONS.SUCCESS.SAVED, 'success');
    } catch (error) {
        showNotification(NOTIFICATIONS.ERROR.DELETE, 'error');
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


