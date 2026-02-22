const { contextBridge, ipcRenderer } = require('electron');

const ALLOWED_INVOKE_CHANNELS = [
    'get-config', 'save-config', 'open-file-dialog', 'connect-bot', 'disconnect-bot',
    'get-app-version', 'get-bot-status', 'get-banned-words', 'add-banned-word', 'remove-banned-word',
    'clear-banned-words', 'trigger-alert-test', 'get-participants', 'is-giveaway-active',
    'start-giveaway', 'stop-giveaway', 'draw-winner', 'clear-participants', 'get-commands',
    'add-command', 'remove-command', 'get-widget-config', 'save-widget-config',
    'reset-widget-config', 'get-widget-urls', 'open-css-editor', 'resize-css-editor',
    'open-subgoals-config', 'open-roulette-config', 'trigger-roulette-spin', 'get-themes',
    'get-theme-config', 'save-theme-config', 'create-theme', 'import-theme', 'delete-theme',
    'get-theme-content', 'get-channel-rewards', 'create-channel-reward', 'update-channel-reward',
    'delete-channel-reward', 'select-folder', 'get-videos', 'discover-devices',
    'play-on-device', 'stop-casting', 'start-spotify-auth', 'get-badge-prefs',
    'save-badge-prefs', 'get-widget-url',
    'get-participants-count', 'open-external-url', 'get-sub-count', 'simulate-sub',
    'get-reward-sounds', 'save-reward-sounds', 'get-reward-images', 'save-reward-images',
    'get-mock-rewards',
    'get-reward-functions', 'save-reward-functions',
    'get-points-global-volume', 'save-points-global-volume', 'twitch-search-categories',
    'get-reward-folders', 'save-reward-folders',
    'twitch-get-steamgriddb-image', 'twitch-get-schedule', 'twitch-create-schedule-segment',
    'twitch-update-schedule-segment', 'twitch-delete-schedule-segment', 'save-planning-base64',
    'is-dev', 'trigger-mock-redemption', 'update-config', 'get-system-fonts'
];

const ALLOWED_SEND_CHANNELS = [
    'start-download', 'quit-and-install', 'window-control'
];

const ALLOWED_ON_CHANNELS = [
    'notification', 'bot-status', 'participants-updated', 'participant-added',
    'device-discovery-status', 'cast-devices-found', 'cast-status', 'update-status-check',
    'update-available', 'update-downloaded', 'refresh-widget-urls', 'load-css-editor',
    'sub-count-updated', 'widget-ports-changed'
];

contextBridge.exposeInMainWorld('api', {
    invoke: (channel, ...args) => {
        if (ALLOWED_INVOKE_CHANNELS.includes(channel)) {
            return ipcRenderer.invoke(channel, ...args);
        }
        return Promise.reject(new Error(`Unauthorized IPC invoke channel: ${channel}`));
    },
    send: (channel, data) => {
        if (ALLOWED_SEND_CHANNELS.includes(channel)) {
            ipcRenderer.send(channel, data);
        }
    },
    on: (channel, listener) => {
        if (ALLOWED_ON_CHANNELS.includes(channel)) {
            const subscription = (event, ...args) => listener(...args);
            ipcRenderer.on(channel, subscription);
            return () => {
                ipcRenderer.removeListener(channel, subscription);
            };
        }
    },
    removeAllListeners: (channel) => {
        if (ALLOWED_ON_CHANNELS.includes(channel)) {
            ipcRenderer.removeAllListeners(channel);
        }
    }
});


