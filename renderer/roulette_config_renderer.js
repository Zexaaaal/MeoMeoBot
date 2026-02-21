const api = window.api;
import { showNotification } from './ui.js';

const widgetHelper = {
    onRefresh: (cb) => {
        const load = async () => {
            const config = await api.invoke('get-widget-config', 'roulette');
            cb(config);
        };
        load();
        api.on('refresh-widget-urls', load);
    },
    getUrl: () => api.invoke('get-widget-url', 'roulette')
};

let choices = [];
let widgetUrl = '';

document.addEventListener('DOMContentLoaded', async () => {
    document.getElementById('close-btn').addEventListener('click', () => window.close());
    document.getElementById('addChoiceBtn').addEventListener('click', addChoice);
    document.getElementById('newChoiceInput').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') addChoice();
    });
    document.getElementById('saveBtn').addEventListener('click', saveConfig);

    widgetHelper.onRefresh((config) => {
        if (config) {
            choices = config.choices || [];
            renderChoices();
        }

        widgetHelper.getUrl().then(url => {
            const iframe = document.getElementById('preview-frame');
            if (iframe && url) {
                iframe.src = url;
            }
        }).catch(console.error);
    });
});

function renderChoices() {
    const list = document.getElementById('choicesList');
    list.innerHTML = '';

    choices.forEach((choice, index) => {
        const item = document.createElement('div');
        item.className = 'choice-item';

        const input = document.createElement('input');
        input.type = 'text';
        input.value = choice;
        input.className = 'choice-input';
        input.onchange = (e) => updateChoice(index, e.target.value);

        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.innerHTML = '✕';
        delBtn.onclick = () => removeChoice(index);

        item.appendChild(input);
        item.appendChild(delBtn);
        list.appendChild(item);
    });
}

function addChoice() {
    const input = document.getElementById('newChoiceInput');
    const value = input.value.trim();
    if (value) {
        choices.push(value);
        input.value = '';
        renderChoices();
    }
}

function removeChoice(index) {
    choices.splice(index, 1);
    renderChoices();
}

function updateChoice(index, value) {
    choices[index] = value;
}

async function saveConfig() {
    try {
        const cleanChoices = choices.map(c => c.trim()).filter(c => c.length > 0);
        const config = { choices: cleanChoices };

        await api.invoke('save-widget-config', 'roulette', config);

        if (iframe) iframe.src = iframe.src;

        showNotification(window.logger.MESSAGES.NOTIF_SUCCESS_SAVED);

    } catch (e) {
        showNotification(window.logger.format(window.logger.MESSAGES.NOTIF_ERROR_SAVE, { error: e.message }), 'error');
    }
}
