import { showNotification, createDeleteControl, ICONS, NOTIFICATIONS } from './ui.js';
import { API } from './api.js';

export async function loadCommands() {
    try {
        const { commands } = await API.commands.getAll();
        const list = document.getElementById('commandsList');
        list.innerHTML = '';

        for (const [cmd, response] of Object.entries(commands)) {
            const div = document.createElement('div');
            div.className = 'list-item command-item';

            const viewContainer = document.createElement('div');
            viewContainer.className = 'command-view-container';


            const name = document.createElement('span');
            name.className = 'command-name';
            name.textContent = cmd;
            name.style.color = 'var(--accent)';

            const resp = document.createElement('span');
            resp.className = 'command-response';
            resp.textContent = response;

            viewContainer.appendChild(name);
            viewContainer.appendChild(resp);

            const editContainer = document.createElement('div');
            editContainer.className = 'inline-edit-container';
            editContainer.style.display = 'none';

            const nameInput = document.createElement('input');
            nameInput.type = 'text';
            nameInput.className = 'inline-edit-input cmd-name';
            nameInput.value = cmd;

            const respInput = document.createElement('input');
            respInput.type = 'text';
            respInput.className = 'inline-edit-input cmd-response';
            respInput.value = response;

            editContainer.appendChild(nameInput);
            editContainer.appendChild(respInput);

            const controls = document.createElement('div');
            controls.className = 'controls';

            const editBtn = document.createElement('button');
            editBtn.className = 'control-button';
            editBtn.innerHTML = ICONS.edit;

            const saveBtn = document.createElement('button');
            saveBtn.className = 'control-button confirm-btn';
            saveBtn.style.display = 'none';
            saveBtn.innerHTML = ICONS.confirm;

            const cancelBtn = document.createElement('button');
            cancelBtn.className = 'control-button cancel-btn';
            cancelBtn.style.display = 'none';
            cancelBtn.innerHTML = ICONS.cancel;

            editBtn.onclick = () => {
                viewContainer.style.display = 'none';
                editContainer.style.display = 'contents';
                editBtn.style.display = 'none';
                deleteControl.style.display = 'none';
                saveBtn.style.display = 'flex';
                cancelBtn.style.display = 'flex';
            };

            cancelBtn.onclick = () => {
                viewContainer.style.display = 'contents';
                editContainer.style.display = 'none';
                editBtn.style.display = 'flex';
                deleteControl.style.display = 'flex';
                saveBtn.style.display = 'none';
                cancelBtn.style.display = 'none';
                nameInput.value = cmd;
                respInput.value = response;
            };

            saveBtn.onclick = async () => {
                const newCmd = nameInput.value.trim();
                const newResp = respInput.value.trim();
                if (!newCmd || !newResp) return;

                const finalCmd = newCmd.startsWith('!') ? newCmd : `!${newCmd}`;

                try {
                    if (finalCmd !== cmd) {
                        await API.commands.remove(cmd);
                    }
                    await API.commands.add(finalCmd, newResp);
                    showNotification(NOTIFICATIONS.SUCCESS.COMMAND_MODIFIED, 'success');
                    loadCommands();
                } catch (e) {
                    showNotification(NOTIFICATIONS.ERROR.GENERIC.replace('{error}', e), 'error');
                }
            };


            const deleteControl = createDeleteControl(() => removeCommand(cmd));

            controls.appendChild(editBtn);
            controls.appendChild(saveBtn);
            controls.appendChild(cancelBtn);
            controls.appendChild(deleteControl);

            div.appendChild(viewContainer);
            div.appendChild(editContainer);
            div.appendChild(controls);
            list.appendChild(div);
        }
    } catch (error) {
        console.error('Erreur chargement commandes:', error);
    }
}

export async function addCommand() {
    const cmdInput = document.getElementById('newCommand');
    const respInput = document.getElementById('commandResponse');
    const cmd = cmdInput.value.trim();
    const resp = respInput.value.trim();

    if (!cmd || !resp) {
        showNotification(NOTIFICATIONS.ERROR.MISSING_FIELDS, 'error');
        return;
    }

    const finalCmd = cmd.startsWith('!') ? cmd : `!${cmd}`;

    try {
        await API.commands.add(finalCmd, resp);
        cmdInput.value = '';
        respInput.value = '';
        loadCommands();
        showNotification(NOTIFICATIONS.COMMAND_ADDED.replace('{cmd}', finalCmd), 'success');
    } catch (error) {
        showNotification(NOTIFICATIONS.ERROR.ADD.replace('{error}', error), 'error');
    }
}

async function removeCommand(command) {
    try {
        await API.commands.remove(command);
        loadCommands();
    } catch (error) {
        showNotification(NOTIFICATIONS.ERROR.DELETE.replace('{error}', error), 'error');
    }
}
