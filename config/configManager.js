const Store = require('electron-store');
const defaults = require('./defaults');

class ConfigManager {
    constructor() {
        this.store = new Store({ defaults });
    }

    get(key, defaultValue) {
        return this.store.get(key, defaultValue);
    }

    set(key, value) {
        this.store.set(key, value);
    }

    getConfig() {
        const config = this.store.get('config');
        return config;
    }

    updateConfig(newConfig) {
        const current = this.getConfig() || {};
        this.store.set('config', { ...current, ...newConfig });
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
        return this.store.get(`widgets.${widgetName}`);
    }

    saveWidgetConfig(widgetName, newConfig) {
        const currentConfig = this.getWidgetConfig(widgetName) || {};
        this.store.set(`widgets.${widgetName}`, { ...currentConfig, ...newConfig });
    }

    getLastEvents() {
        return this.store.get('lastEvents', {});
    }

    setLastEvent(type, data) {
        this.store.set(`lastEvents.${type}`, data);
    }
}

module.exports = new ConfigManager();
