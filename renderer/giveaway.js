import { showNotification, NOTIFICATIONS } from './ui.js';
import { API } from './api.js';

export async function loadParticipants() {
    try {
        const participants = await API.giveaway.getParticipants();
        updateParticipantsList(participants);

        const isActive = await API.giveaway.isActive();
        updateGiveawayStatus(isActive);
    } catch (error) {
        console.error('Erreur chargement participants:', error);
    }
}

function updateParticipantsList(participants) {
    const list = document.getElementById('participantsList');
    const count = document.getElementById('participantsCount');
    list.innerHTML = '';
    count.textContent = `${participants.length} participants`;

    participants.forEach(p => {
        const div = document.createElement('div');
        div.className = 'list-item';
        div.textContent = p;
        list.appendChild(div);
    });
}

function updateGiveawayStatus(isActive) {
    const startBtn = document.getElementById('startGiveawayBtn');
    const stopBtn = document.getElementById('stopGiveawayBtn');

    if (isActive) {
        startBtn.disabled = true;
        stopBtn.disabled = false;
        startBtn.classList.add('hidden');
        stopBtn.classList.remove('hidden');
    } else {
        startBtn.disabled = false;
        stopBtn.disabled = true;
        startBtn.classList.remove('hidden');
        stopBtn.classList.add('hidden');
    }
}

export async function startGiveaway() {
    try {
        await API.giveaway.start();
        updateGiveawayStatus(true);
        loadParticipants();
    } catch (error) {
        showNotification(NOTIFICATIONS.ERROR.START.replace('{error}', error), 'error');
    }
}

export async function stopGiveaway() {
    try {
        await API.giveaway.stop();
        updateGiveawayStatus(false);
    } catch (error) {
        showNotification(NOTIFICATIONS.ERROR.STOP.replace('{error}', error), 'error');
    }
}

export async function drawWinner() {
    try {
        const result = await API.giveaway.drawWinner();
        const winner = result.winner;
        const display = document.getElementById('winnerDisplay');
        if (winner) {
            display.textContent = `🏆 Vainqueur : ${winner} !`;
            display.classList.add('animate-winner');
        } else {
            display.textContent = NOTIFICATIONS.GIVEAWAY_NO_PARTICIPANT;
            showNotification(NOTIFICATIONS.GIVEAWAY_NO_PARTICIPANT, 'error');
        }
    } catch (error) {
        showNotification(NOTIFICATIONS.ERROR.GENERIC.replace('{error}', error), 'error');
    }
}

export async function clearParticipants() {
    try {
        await API.giveaway.clearParticipants();
        loadParticipants();
        document.getElementById('winnerDisplay').textContent = '';
        showNotification(NOTIFICATIONS.SUCCESS.CLEARED, 'success');
    } catch (error) {
        showNotification(NOTIFICATIONS.ERROR.CLEAR.replace('{error}', error), 'error');
    }
}

export async function saveGiveawayConfig() {
    const command = document.getElementById('giveawayCommand').value;
    const startMsg = document.getElementById('giveawayStartMessage').value;
    const stopMsg = document.getElementById('giveawayStopMessage').value;
    const winMsg = document.getElementById('giveawayWinMessage').value;

    try {
        await API.saveConfig({
            giveawayCommand: command,
            giveawayStartMessage: startMsg,
            giveawayStopMessage: stopMsg,
            giveawayWinMessage: winMsg
        });
        showNotification(NOTIFICATIONS.SUCCESS.SAVED, 'success');
    } catch (error) {
        showNotification(NOTIFICATIONS.ERROR.SAVE, 'error');
        console.error(error);
    }
}


