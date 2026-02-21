const api = window.api;
import { showNotification, ICONS } from './ui.js';

let currentState = {
    weekStart: new Date(),
    startSunday: false,
    bgImage: null,
    title: "PLANNING",
    events: {}
};

const els = {
    prevWeekBtn: document.getElementById('planning-prev-week'),
    nextWeekBtn: document.getElementById('planning-next-week'),
    weekLabel: document.getElementById('planning-week-label'),
    titleInput: document.getElementById('planning-title-input'),
    startSundayCheck: document.getElementById('planning-start-sunday'),
    bgInput: document.getElementById('planning-bg-input'),
    bgClearBtn: document.getElementById('planning-bg-clear-btn'),
    saveTwitchBtn: document.getElementById('planning-save-twitch-btn'),
    exportBtn: document.getElementById('planning-export-btn'),
    loadPrevBtn: document.getElementById('planning-load-prev-btn'),
    dayTabs: document.querySelectorAll('.day-tab'),
    addSegmentBtn: document.getElementById('add-segment-btn'),
    segmentsList: document.getElementById('segments-list'),
    previewCard: document.getElementById('planning-preview-card'),
    previewTitle: document.getElementById('preview-title'),
    previewDates: document.getElementById('preview-dates'),
    previewGrid: document.getElementById('planning-grid'),
    previewBg: document.querySelector('.planning-card-bg'),
    timeLabelsCol: document.querySelector('.time-labels-col'),
    previewContainer: document.querySelector('.planning-main-preview')
};

const DAYS_FR = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];

export function initPlanning() {
    setupEventListeners();
    initWeek();
    loadState();
    renderAll();
    loadTwitchSchedule();
    fitPreview();
    window.addEventListener('resize', fitPreview);
}

function fitPreview() {
    if (!els.previewCard || !els.previewContainer) return;

    const containerWidth = els.previewContainer.clientWidth;
    const containerHeight = els.previewContainer.clientHeight;

    if (containerWidth === 0 || containerHeight === 0) return;

    const cardWidth = els.previewCard.offsetWidth || 1800;
    const cardHeight = els.previewCard.offsetHeight || 940;

    const scaleX = (containerWidth - 40) / cardWidth;
    const scaleY = (containerHeight - 40) / cardHeight;

    const scale = Math.min(scaleX, scaleY);

    els.previewCard.style.transform = `translate(-50%, -50%) scale(${scale})`;
}

const resizeObserver = new ResizeObserver(() => {
    fitPreview();
});
if (els.previewContainer) {
    resizeObserver.observe(els.previewContainer);
}

function setupEventListeners() {
    api.on('bot-status', (status) => {
        if (status.connected) {
            loadTwitchSchedule();
        }
    });

    els.prevWeekBtn.addEventListener('click', () => changeWeek(-7));
    els.nextWeekBtn.addEventListener('click', () => changeWeek(7));

    els.titleInput.addEventListener('input', (e) => {
        currentState.title = e.target.value;
        saveState();
        renderHeader();
    });

    els.startSundayCheck.addEventListener('change', (e) => {
        currentState.startSunday = e.target.checked;
        saveState();
        renderAll();
    });

    const stripPrefix = (path) => path ? path.replace(/^file:\/\/+/, '') : path;

    els.bgInput.style.cursor = 'pointer';
    els.bgInput.addEventListener('click', async () => {
        const path = await api.invoke('open-file-dialog', [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]);
        if (path) {
            currentState.bgImage = path;
            els.bgInput.value = stripPrefix(path);
            saveState();
            renderHeader();
        }
    });

    els.bgClearBtn.addEventListener('click', () => {
        currentState.bgImage = null;
        els.bgInput.value = '';
        saveState();
        renderHeader();
    });

    els.dayTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelector('.day-tab.active').classList.remove('active');
            tab.classList.add('active');
            renderEditor();
        });
    });

    els.addSegmentBtn.addEventListener('click', () => {
        const activeTab = document.querySelector('.day-tab.active');
        if (!activeTab) return;
        const activeDayIndex = parseInt(activeTab.dataset.day);
        const dateKey = getDateKeyForDayIndex(activeDayIndex);

        if (!currentState.events[dateKey]) currentState.events[dateKey] = [];

        currentState.events[dateKey].push({
            id: null,
            startTime: "14:00",
            endTime: null,
            category: { name: "", boxArtUrl: "" },
            title: "",
            useMiniature: false
        });

        saveState();
        renderEditor();
        renderPreviewGrid();
    });

    els.exportBtn.addEventListener('click', async () => {
        const card = els.previewCard;

        const clone = card.cloneNode(true);

        clone.style.width = '1800px';
        clone.style.height = '940px';
        clone.style.transform = 'none';
        clone.style.position = 'absolute';
        clone.style.top = '0';
        clone.style.left = '-9999px';
        clone.style.zIndex = '-1';

        document.body.appendChild(clone);

        try {
            const images = Array.from(clone.querySelectorAll('img'));
            await Promise.all(images.map(img => {
                if (img.complete) return Promise.resolve();
                return new Promise(resolve => {
                    img.onload = resolve;
                    img.onerror = resolve;
                });
            }));

            await new Promise(r => setTimeout(r, 200));

            const canvas = await html2canvas(clone, {
                backgroundColor: null,
                scale: 2,
                width: 1800,
                height: 940,
                useCORS: true,
                allowTaint: true
            });

            const dataURL = canvas.toDataURL('image/png');
            const res = await api.invoke('save-planning-base64', dataURL);

            if (res.success) {

            } else {
                showNotification(window.logger.format(window.logger.MESSAGES.NOTIF_ERROR_GENERIC, { error: res.error }), 'error');
            }
        } catch (err) {
            console.error(err);
            showNotification(window.logger.format(window.logger.MESSAGES.NOTIF_EXPORT_ERROR, { error: err.message }), 'error');
        } finally {
            document.body.removeChild(clone);
        }
    });

    els.saveTwitchBtn.addEventListener('click', syncToTwitch);

    if (els.loadPrevBtn) {
        els.loadPrevBtn.addEventListener('click', () => {
            if (els.loadPrevBtn.dataset.confirming !== 'true') {
                els.loadPrevBtn.dataset.confirming = 'true';
                els.loadPrevBtn.textContent = 'Sûr ?';
                els.loadPrevBtn.classList.add('btn-danger');
                els.loadPrevBtn.classList.remove('btn-secondary');

                setTimeout(() => {
                    if (els.loadPrevBtn.dataset.confirming === 'true') {
                        els.loadPrevBtn.dataset.confirming = 'false';
                        els.loadPrevBtn.textContent = 'Copier précédent';
                        els.loadPrevBtn.classList.remove('btn-danger');
                        els.loadPrevBtn.classList.add('btn-secondary');
                    }
                }, 3000);
                return;
            }

            els.loadPrevBtn.dataset.confirming = 'false';
            els.loadPrevBtn.textContent = 'Copier précédent';
            els.loadPrevBtn.classList.remove('btn-danger');
            els.loadPrevBtn.classList.add('btn-secondary');

            importPreviousState();
            renderAll();
        });
    }
}

function saveState() {
    localStorage.setItem('planning_state', JSON.stringify({
        startSunday: currentState.startSunday,
        bgImage: currentState.bgImage,
        title: currentState.title,
        events: currentState.events
    }));
}

function loadState(loadEvents = false) {
    const saved = localStorage.getItem('planning_state');
    if (saved) {
        try {
            const parsed = JSON.parse(saved);
            if (parsed.startSunday !== undefined) currentState.startSunday = parsed.startSunday;
            if (parsed.bgImage) {
                currentState.bgImage = parsed.bgImage;
                const stripPrefix = (path) => path ? path.replace(/^file:\/\/+/, '') : path;
                els.bgInput.value = stripPrefix(parsed.bgImage);
            }
            if (parsed.title !== undefined) {
                currentState.title = parsed.title;
                els.titleInput.value = parsed.title;
            }
            if (loadEvents && parsed.events) {
                currentState.events = parsed.events;
            }
        } catch (e) {
            console.error("Error loading state", e);
        }
    }
    els.startSundayCheck.checked = currentState.startSunday;
}

function importPreviousState() {
    const saved = localStorage.getItem('planning_state');
    if (!saved) return;




    try {
        const parsed = JSON.parse(saved);


        if (parsed.startSunday !== undefined) {
            currentState.startSunday = parsed.startSunday;
            els.startSundayCheck.checked = currentState.startSunday;
        }
        if (parsed.bgImage) {
            currentState.bgImage = parsed.bgImage;
            const stripPrefix = (path) => path ? path.replace(/^file:\/\/+/, '') : path;
            els.bgInput.value = stripPrefix(parsed.bgImage);
        }
        if (parsed.title !== undefined) {
            currentState.title = parsed.title;
            els.titleInput.value = parsed.title;
        }


        if (parsed.events) {
            const newEvents = {};
            for (const [dateStr, list] of Object.entries(parsed.events)) {


                const d = new Date(dateStr);

                const dayIndex = (d.getDay() + 6) % 7;


                const targetDateKey = getDateKeyForDayIndex(dayIndex);

                if (!newEvents[targetDateKey]) newEvents[targetDateKey] = [];


                const transposed = list.map(evt => ({
                    ...evt,
                    id: null
                }));

                newEvents[targetDateKey] = newEvents[targetDateKey].concat(transposed);
            }
            currentState.events = newEvents;
            saveState();
        }

    } catch (e) {
        console.error("Error importing previous state", e);
        showNotification(window.logger.format(window.logger.MESSAGES.NOTIF_IMPORT_ERROR, { error: e.message }), 'error');
    }
}


function initWeek() {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(now.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    currentState.weekStart = monday;
}

function changeWeek(days) {
    const newDate = new Date(currentState.weekStart);
    newDate.setDate(newDate.getDate() + days);
    currentState.weekStart = newDate;

    currentState.events = {};

    renderAll();
    loadTwitchSchedule();
}

function getDateForDayIndex(index) {
    const d = new Date(currentState.weekStart);
    d.setDate(d.getDate() + index);
    return d;
}

function getDateKeyForDayIndex(index) {
    const d = getDateForDayIndex(index);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

async function loadTwitchSchedule() {
    els.saveTwitchBtn.textContent = "⏳ Sync...";
    try {
        const schedule = await api.invoke('twitch-get-schedule');

        if (schedule && schedule.segments) {
            for (let i = 0; i < 7; i++) {
                currentState.events[getDateKeyForDayIndex(i)] = [];
            }

            schedule.segments.forEach(seg => {
                const d = new Date(seg.start_time);
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const dateKey = `${year}-${month}-${day}`;

                if (currentState.events[dateKey]) {
                    const h = d.getHours().toString().padStart(2, '0');
                    const m = d.getMinutes().toString().padStart(2, '0');


                    let endTime = null;
                    if (seg.end_time) {
                        const endD = new Date(seg.end_time);
                        const eh = endD.getHours().toString().padStart(2, '0');
                        const em = endD.getMinutes().toString().padStart(2, '0');
                        endTime = `${eh}:${em}`;
                    }

                    currentState.events[dateKey].push({
                        id: seg.id,
                        startTime: `${h}:${m}`,
                        endTime: endTime,
                        category: {
                            id: seg.category ? seg.category.id : null,
                            name: seg.category ? seg.category.name : '',
                            boxArtUrl: seg.category ? seg.category.box_art_url : ''
                        },
                        title: seg.title || "",
                        useMiniature: false,
                        showGameTitle: false
                    });
                }
            });
        }
    } catch (e) {
        console.error("Failed to load schedule", e);
    } finally {
        els.saveTwitchBtn.textContent = 'Sync Twitch';
        renderAll();
    }
}


function renderAll() {
    renderHeader();
    renderTimeLabels();
    renderEditor();
    renderPreviewGrid();
}

function scaleTwitchUrl(url, w = 600, h = 800) {
    if (!url) return 'assets/icon.png';
    if (url.includes('ttv-boxart')) {
        return url.replace('{width}', w).replace('{height}', h)
            .replace(/\d+x\d+(?=\.(jpg|png))/, `${w}x${h}`);
    }
    return url;
}

function renderHeader() {
    const start = new Date(currentState.weekStart);
    if (currentState.startSunday) {
        start.setDate(start.getDate() - 1);
    }

    const end = new Date(start);
    end.setDate(end.getDate() + 6);

    const fmt = (d) => `${d.getDate().toString().padStart(2, '0')}.${(d.getMonth() + 1).toString().padStart(2, '0')}`;
    const rangeStr = `${fmt(start)} - ${fmt(end)}`;

    els.weekLabel.textContent = rangeStr;
    els.previewDates.textContent = rangeStr;

    els.previewTitle.textContent = currentState.title;

    if (currentState.bgImage) {
        els.previewBg.style.backgroundImage = `url('file://${currentState.bgImage.replace(/\\/g, '/')}')`;
    } else {
        els.previewBg.style.backgroundImage = 'none';
        els.previewBg.style.background = 'linear-gradient(45deg, #1a1a1a, #2a2a2a)';
    }
}

function renderTimeLabels() {
    const col = els.timeLabelsCol;
    col.innerHTML = '';

    for (let h = 0; h <= 24; h += 3) {
        const div = document.createElement('div');
        div.className = 'time-label';
        div.textContent = `${h}h`;
        div.style.top = `${(h / 24) * 100}%`;
        col.appendChild(div);
    }
}

function renderPreviewGrid() {
    els.previewGrid.innerHTML = '';

    let order = [0, 1, 2, 3, 4, 5, 6];
    if (currentState.startSunday) {
        order = [6, 0, 1, 2, 3, 4, 5];
    }

    const eventsPerDay = {};
    order.forEach(dayIndex => {
        const dateKey = getDateKeyForDayIndex(dayIndex);
        const originalEvents = currentState.events[dateKey] || [];
        eventsPerDay[dayIndex] = originalEvents.map(e => ({ ...e, _isContinuation: false }));
    });

    for (let i = 0; i < order.length; i++) {
        const dayIndex = order[i];
        const dayEvents = eventsPerDay[dayIndex];

        dayEvents.sort((a, b) => a.startTime.localeCompare(b.startTime));

        const col = document.createElement('div');
        col.className = 'planning-col';

        const header = document.createElement('div');
        header.className = 'planning-col-header';
        header.textContent = DAYS_FR[dayIndex];

        const content = document.createElement('div');
        content.className = 'planning-col-content';

        for (let j = 0; j < dayEvents.length; j++) {
            const evt = dayEvents[j];
            const [sh, sm] = evt.startTime.split(':').map(Number);
            const startMinutes = sh * 60 + sm;

            let endMinutes = 24 * 60;

            if (evt.endTime) {
                const [eh, em] = evt.endTime.split(':').map(Number);
                const absoluteEnd = eh * 60 + em;

                if (absoluteEnd < startMinutes) {
                    endMinutes = 24 * 60;
                } else {
                    endMinutes = absoluteEnd;
                }
            } else {
                if (j < dayEvents.length - 1) {
                    const nextEvt = dayEvents[j + 1];
                    const [nh, nm] = nextEvt.startTime.split(':').map(Number);
                    const nextStart = nh * 60 + nm;
                    if (nextStart > startMinutes) endMinutes = nextStart;
                }
            }

            if (endMinutes > 24 * 60) endMinutes = 24 * 60;

            const durationMinutes = endMinutes - startMinutes;
            if (durationMinutes <= 0) continue;

            const topPercent = (startMinutes / (24 * 60)) * 100;
            const heightPercent = (durationMinutes / (24 * 60)) * 100;

            const card = document.createElement('div');
            card.className = 'preview-event';
            if (evt.useMiniature) card.classList.add('has-image');
            if (evt._isContinuation) card.classList.add('is-continuation');

            card.style.top = `${topPercent}%`;
            card.style.height = `${heightPercent}%`;



            const img = document.createElement('img');
            img.className = 'preview-event-image';
            img.src = scaleTwitchUrl(evt.category.boxArtUrl, 1080, 1440);
            img.onerror = () => { img.style.display = 'none'; };
            const info = document.createElement('div');
            info.className = 'preview-event-info';

            const titleDiv = document.createElement('div');
            titleDiv.className = 'preview-event-title';
            titleDiv.textContent = evt.title;

            const timeDiv = document.createElement('div');
            timeDiv.className = 'preview-event-time';
            if (evt._isContinuation) {
                timeDiv.textContent = `... - ${evt.endTime}`;
            } else {
                timeDiv.textContent = evt.startTime + (evt.endTime ? ` - ${evt.endTime}` : '');
            }

            const gameDiv = document.createElement('div');
            gameDiv.className = 'preview-event-game';
            gameDiv.textContent = evt.category.name;

            info.appendChild(titleDiv);
            info.appendChild(timeDiv);

            if (evt.showGameTitle !== false) {
                const gameDiv = document.createElement('div');
                gameDiv.className = 'preview-event-game';
                gameDiv.textContent = evt.category.name;
                info.appendChild(gameDiv);
            }

            card.appendChild(img);
            card.appendChild(info);

            content.appendChild(card);
        }

        col.appendChild(header);
        col.appendChild(content);
        els.previewGrid.appendChild(col);
    }
}

function renderEditor() {
    const activeTab = document.querySelector('.day-tab.active');
    if (!activeTab) return;
    const dayIndex = parseInt(activeTab.dataset.day);

    els.segmentsList.innerHTML = '';

    const dateKey = getDateKeyForDayIndex(dayIndex);
    const events = currentState.events[dateKey] || [];

    if (events.length === 0) {
        els.segmentsList.innerHTML = '<div class="empty-state">Aucun stream prévu ce jour.</div>';
        return;
    }

    events.forEach((evt, idx) => {
        const div = document.createElement('div');
        div.className = 'segment-item';

        const timeLabel = `${evt.startTime} à ${evt.endTime || '--:--'}`;

        div.innerHTML = `
            <button class="segment-delete-btn" title="Supprimer">${ICONS.trash}</button>
            <div class="segment-header">
                <span>Segment ${idx + 1}</span>
            </div>
            <div class="segment-time-selectors">
                <div class="time-picker-item">
                    <label>Début</label>
                    <div class="custom-picker-container">
                        <button class="custom-picker-btn start-time-btn">${evt.startTime}</button>
                        <div class="custom-picker-dropdown start-time-dropdown">
                            <div class="time-options-list"></div>
                        </div>
                    </div>
                </div>
                <div class="time-picker-item">
                    <label>Fin</label>
                    <div class="custom-picker-container">
                        <button class="custom-picker-btn end-time-btn">${evt.endTime || '--:--'}</button>
                        <div class="custom-picker-dropdown end-time-dropdown">
                            <div class="time-options-list"></div>
                        </div>
                    </div>
                </div>
            </div>
            <div class="segment-row">
                <div class="segment-game-search">
                    <input type="text" class="segment-game-input" placeholder="Jeu/Catégorie..." value="${evt.category.name}">
                    <div class="game-search-results"></div>
                </div>
                <div class="miniature-option">
                    <input type="checkbox" class="inp-mini" ${evt.useMiniature ? 'checked' : ''}>
                    <span>Miniature</span>
                </div>
                <div class="miniature-option">
                    <input type="checkbox" class="inp-show-game" ${evt.showGameTitle ? 'checked' : ''}>
                    <span>Titre</span>
                </div>
            </div>
            <input type="text" class="segment-title-input" placeholder="Titre du stream" value="${evt.title}">
        `;

        const startBtn = div.querySelector('.start-time-btn');
        const startDropdown = div.querySelector('.start-time-dropdown');
        const endBtn = div.querySelector('.end-time-btn');
        const endDropdown = div.querySelector('.end-time-dropdown');

        const inpGame = div.querySelector('.segment-game-input');
        const inpTitle = div.querySelector('.segment-title-input');
        const inpMini = div.querySelector('.inp-mini');
        const inpShowGame = div.querySelector('.inp-show-game');
        const resultsBox = div.querySelector('.game-search-results');
        const deleteBtn = div.querySelector('.segment-delete-btn');

        const hours = [];
        for (let h = 0; h < 24; h++) {
            const padH = String(h).padStart(2, '0');
            ['00', '15', '30', '45'].forEach(m => {
                hours.push(`${padH}:${m}`);
            });
        }

        const populateList = (dropdown, currentVal, isStart) => {
            const list = dropdown.querySelector('.time-options-list');
            list.innerHTML = '';
            hours.forEach(time => {
                const opt = document.createElement('div');
                opt.className = 'time-option';
                if (time === currentVal) opt.classList.add('selected');
                opt.textContent = time;
                opt.addEventListener('click', () => {
                    if (isStart) {
                        evt.startTime = time;
                    } else {
                        evt.endTime = time;
                    }
                    saveState();
                    renderEditor();
                    renderPreviewGrid();
                });
                list.appendChild(opt);
            });

            if (!isStart) {
                const clearOpt = document.createElement('div');
                clearOpt.className = 'time-option';
                clearOpt.style.color = 'var(--danger)';
                clearOpt.textContent = '--:--';
                clearOpt.addEventListener('click', () => {
                    evt.endTime = null;
                    saveState();
                    renderEditor();
                    renderPreviewGrid();
                });
                list.prepend(clearOpt);
            }

            const selected = list.querySelector('.selected');
            if (selected) selected.scrollIntoView({ block: 'center' });
        };

        const setupToggle = (btn, dropdown, isStart) => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const wasActive = dropdown.classList.contains('active');

                document.querySelectorAll('.custom-picker-dropdown.active').forEach(d => d.classList.remove('active'));
                document.querySelectorAll('.custom-picker-btn.active').forEach(b => b.classList.remove('active'));

                if (!wasActive) {
                    dropdown.classList.add('active');
                    btn.classList.add('active');
                    populateList(dropdown, isStart ? evt.startTime : evt.endTime, isStart);
                }
            });
        };

        setupToggle(startBtn, startDropdown, true);
        setupToggle(endBtn, endDropdown, false);

        inpTitle.addEventListener('input', (e) => {
            evt.title = e.target.value;
            saveState();
            renderPreviewGrid();
        });

        inpMini.addEventListener('change', (e) => {
            evt.useMiniature = e.target.checked;
            saveState();
            renderPreviewGrid();
        });

        inpShowGame.addEventListener('change', (e) => {
            evt.showGameTitle = e.target.checked;
            saveState();
            renderPreviewGrid();
        });

        deleteBtn.addEventListener('click', () => {
            currentState.events[dateKey].splice(idx, 1);
            saveState();
            renderEditor();
            renderPreviewGrid();
        });

        let searchTimer;
        inpGame.addEventListener('input', (e) => {
            const query = e.target.value;
            evt.category.name = query;

            clearTimeout(searchTimer);
            if (query.length < 3) {
                resultsBox.classList.remove('active');
                return;
            }

            searchTimer = setTimeout(async () => {
                const results = await api.invoke('twitch-search-categories', query);

                resultsBox.innerHTML = '';
                if (results && results.length > 0) {
                    results.forEach(game => {
                        const r = document.createElement('div');
                        r.className = 'game-result-item';
                        const boxUrl = scaleTwitchUrl(game.box_art_url, 300, 400);
                        r.innerHTML = `<img src="${boxUrl}" class="game-result-img"><span class="game-result-name">${game.name}</span>`;

                        r.addEventListener('click', async () => {
                            evt.category.id = game.id;
                            evt.category.name = game.name;
                            evt.category.boxArtUrl = game.box_art_url;
                            inpGame.value = game.name;
                            resultsBox.classList.remove('active');
                            renderPreviewGrid();

                            const highResUrl = await api.invoke('twitch-get-steamgriddb-image', game.name);
                            if (highResUrl) {
                                evt.category.boxArtUrl = highResUrl;
                                renderPreviewGrid();
                            }
                        });

                        resultsBox.appendChild(r);
                    });
                    resultsBox.classList.add('active');
                } else {
                    resultsBox.classList.remove('active');
                }
            }, 300);
        });

        document.addEventListener('click', (e) => {
            if (!div.contains(e.target)) {
                resultsBox.classList.remove('active');
                startDropdown.classList.remove('active');
                startBtn.classList.remove('active');
                endDropdown.classList.remove('active');
                endBtn.classList.remove('active');
            }
        });

        els.segmentsList.appendChild(div);
    });
}


async function syncToTwitch() {
    const btn = els.saveTwitchBtn;

    if (btn.dataset.confirming !== 'true') {
        btn.dataset.confirming = 'true';
        btn.textContent = 'Sûr ?';
        btn.classList.add('btn-danger');
        btn.classList.remove('btn-primary');

        setTimeout(() => {
            if (btn.dataset.confirming === 'true') {
                btn.dataset.confirming = 'false';
                btn.textContent = 'Sync Twitch';
                btn.classList.remove('btn-danger');
                btn.classList.add('btn-primary');
            }
        }, 3000);
        return;
    }

    btn.dataset.confirming = 'false';
    btn.classList.remove('btn-danger');
    btn.classList.remove('btn-secondary');
    btn.classList.add('btn-primary');

    btn.disabled = true;
    btn.textContent = 'Sync...';

    try {
        const schedule = await api.invoke('twitch-get-schedule');
        const existingSegments = schedule ? schedule.segments : [];

        const existingMap = new Map();
        existingSegments.forEach(s => existingMap.set(s.id, s));

        const processedIds = new Set();

        for (let i = 0; i < 7; i++) {
            const dateKey = getDateKeyForDayIndex(i);
            const events = currentState.events[dateKey] || [];

            for (const evt of events) {
                const fullStartTime = new Date(`${dateKey}T${evt.startTime}:00`);

                if (!evt.id && fullStartTime < new Date()) {
                    console.warn(`Skipping event ${evt.title} (past)`);
                    continue;
                }


                let duration = 60;
                if (evt.endTime) {
                    const startMin = parseInt(evt.startTime.split(':')[0]) * 60 + parseInt(evt.startTime.split(':')[1]);
                    const endMin = parseInt(evt.endTime.split(':')[0]) * 60 + parseInt(evt.endTime.split(':')[1]);
                    duration = endMin - startMin;
                    if (duration < 0) duration += 24 * 60;
                } else {
                    duration = 120;
                }

                const payload = {
                    start_time: fullStartTime.toISOString(),
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
                    duration: duration.toString(),
                    category_id: evt.category.id,
                    title: evt.title,
                    is_recurring: false
                };

                if (evt.id && existingMap.has(evt.id)) {
                    await api.invoke('twitch-update-schedule-segment', evt.id, payload);
                    processedIds.add(evt.id);
                } else {
                    await api.invoke('twitch-create-schedule-segment', payload);
                }
            }
        }

        const weekStart = getDateForDayIndex(0);
        const weekEnd = getDateForDayIndex(6);
        weekEnd.setHours(23, 59, 59, 999);


        for (const seg of existingSegments) {
            const segDate = new Date(seg.start_time);
            if (segDate >= weekStart && segDate <= weekEnd) {
                if (!processedIds.has(seg.id)) {
                    await api.invoke('twitch-delete-schedule-segment', seg.id);
                }
            }
        }

        loadTwitchSchedule();
    } catch (e) {
        console.error("Sync failed", e);
        showNotification(window.logger.format(window.logger.MESSAGES.NOTIF_SYNC_ERROR, { error: e.message }), 'error');
    } finally {
        els.saveTwitchBtn.disabled = false;
        els.saveTwitchBtn.innerHTML = 'Sync Twitch';
    }
}
