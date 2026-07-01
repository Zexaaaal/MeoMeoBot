const Store = require('electron-store');
const { app } = require('electron');
const path = require('path');
const defaults = require('./defaults');

const isDev = !app.isPackaged;

function getNormalizedUserDataPath() {
    return app.getPath('userData').replace(/\\/g, '/');
}

function resolvePaths(obj) {
    if (typeof obj !== 'object' || obj === null) {
        if (typeof obj === 'string' && obj.includes('{userData}')) {
            return obj.replace(/\{userData\}/g, getNormalizedUserDataPath());
        }
        return obj;
    }
    
    if (Array.isArray(obj)) {
        return obj.map(item => resolvePaths(item));
    }
    
    const resolved = {};
    for (const key of Object.keys(obj)) {
        resolved[key] = resolvePaths(obj[key]);
    }
    return resolved;
}

function unresolvePaths(obj) {
    if (typeof obj !== 'object' || obj === null) {
        if (typeof obj === 'string') {
            const userDataPath = getNormalizedUserDataPath();
            if (obj.includes(userDataPath)) {
                return obj.replace(new RegExp(userDataPath, 'g'), '{userData}');
            }
        }
        return obj;
    }
    
    if (Array.isArray(obj)) {
        return obj.map(item => unresolvePaths(item));
    }
    
    const unresolved = {};
    for (const key of Object.keys(obj)) {
        unresolved[key] = unresolvePaths(obj[key]);
    }
    return unresolved;
}

class ConfigManager {
    constructor() {
        const storeOptions = { defaults };
        const hasPortableArg = process.argv.includes('--portable') || process.argv.includes('-p');
        if (isDev && !hasPortableArg) {
            storeOptions.cwd = path.join(__dirname, '..');
        }
        this.store = new Store(storeOptions);
    }

    get(key, defaultValue) {
        return resolvePaths(this.store.get(key, defaultValue));
    }

    set(key, value) {
        this.store.set(key, unresolvePaths(value));
    }

    getConfig() {
        const config = this.store.get('config');
        return resolvePaths(config);
    }

    updateConfig(newConfig) {
        const current = this.store.get('config') || {};
        const unresolvedNew = unresolvePaths(newConfig);
        this.store.set('config', { ...current, ...unresolvedNew });
    }

    getCommands() {
        return this.store.get('commands', {});
    }

    setCommand(command, response) {
        const commands = this.getCommands();
        const cmdsObj = Array.isArray(commands) ? {} : commands;

        cmdsObj[command] = response;
        this.store.set('commands', cmdsObj);
    }

    removeCommand(commandName) {
        const commands = this.getCommands();
        const cmdsObj = Array.isArray(commands) ? {} : commands;

        if (cmdsObj[commandName]) {
            delete cmdsObj[commandName];
            this.store.set('commands', cmdsObj);
        }
    }

    getBannedWords() {
        return this.store.get('config.bannedWords', []);
    }

    addBannedWord(word) {
        const words = this.getBannedWords();
        if (!words.includes(word)) {
            words.push(word);
            this.store.set('config.bannedWords', words);
        }
    }

    removeBannedWord(word) {
        const words = this.getBannedWords().filter(w => w !== word);
        this.store.set('config.bannedWords', words);
    }

    clearBannedWords() {
        this.store.set('config.bannedWords', []);
    }

    getGiveawayParticipants() {
        return this.store.get('giveaway.participants', []);
    }

    addGiveawayParticipant(participant) {
        const participants = this.getGiveawayParticipants();
        if (!participants.includes(participant)) {
            participants.push(participant);
            this.store.set('giveaway.participants', participants);
        }
    }

    clearGiveawayParticipants() {
        this.store.set('giveaway.participants', []);
    }

    setGiveawayActive(isActive) {
        this.store.set('giveaway.isActive', isActive);
    }

    isGiveawayActive() {
        return this.store.get('giveaway.isActive');
    }

    getWidgetConfig(widgetName) {
        const config = this.store.get(`widgets.${widgetName}`);
        return resolvePaths(config);
    }

    saveWidgetConfig(widgetName, newConfig) {
        const currentConfig = this.store.get(`widgets.${widgetName}`) || {};
        const unresolvedNew = unresolvePaths(newConfig);
        this.store.set(`widgets.${widgetName}`, { ...currentConfig, ...unresolvedNew });
    }

    getLastEvents() {
        return this.store.get('lastEvents', {});
    }

    setLastEvent(type, data) {
        this.store.set(`lastEvents.${type}`, data);
    }
}

module.exports = new ConfigManager();
