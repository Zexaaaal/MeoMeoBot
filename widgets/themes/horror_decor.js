(function () {
    'use strict';

    let canvas = null;
    let ctx = null;
    let animId = null;
    let cycleTimer = null;
    let pollTimer = null;
    let isRunning = false;
    let activeCycle = null;
    let lastTime = 0;

    const BLOOD_PALETTES = [
        {
            core: '#990818',
            dark: '#5e020b',
            base: '#280003',
            trace: 'rgba(135, 6, 16, ',
            glint: 'rgba(255, 195, 200, 0.5)'
        },
        {
            core: '#7a0510',
            dark: '#480108',
            base: '#1e0002',
            trace: 'rgba(105, 4, 12, ',
            glint: 'rgba(240, 175, 180, 0.4)'
        },
        {
            core: '#5c030c',
            dark: '#330105',
            base: '#140002',
            trace: 'rgba(78, 2, 8, ',
            glint: 'rgba(225, 155, 160, 0.35)'
        },
        {
            core: '#400207',
            dark: '#220003',
            base: '#0c0001',
            trace: 'rgba(52, 2, 6, ',
            glint: 'rgba(205, 140, 145, 0.28)'
        },
        {
            core: '#660412',
            dark: '#3b0108',
            base: '#180003',
            trace: 'rgba(88, 3, 11, ',
            glint: 'rgba(235, 165, 170, 0.38)'
        }
    ];

    function createCanvas() {
        if (canvas) return;
        canvas = document.createElement('canvas');
        canvas.id = 'horror-blood-canvas';
        canvas.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:10;';
        document.body.appendChild(canvas);
        ctx = canvas.getContext('2d');
        resize();
        window.addEventListener('resize', resize);
    }

    function removeCanvas() {
        if (cycleTimer) { clearTimeout(cycleTimer); cycleTimer = null; }
        if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
        if (animId) { cancelAnimationFrame(animId); animId = null; }
        window.removeEventListener('resize', resize);
        if (canvas) {
            canvas.remove();
            canvas = null;
            ctx = null;
        }
        activeCycle = null;
        isRunning = false;
    }

    function resize() {
        if (!canvas) return;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }

    function getChatBoxes() {
        const groups = Array.from(document.querySelectorAll('#chat-container .msg-group'));
        const list = [];
        for (const g of groups) {
            const box = g.querySelector('.msg-messages') || g;
            const rect = box.getBoundingClientRect();
            if (rect.height > 10 && rect.width > 10) {
                list.push({ el: box, rect });
            }
        }
        list.sort((a, b) => a.rect.top - b.rect.top);
        return list;
    }

    function hasReachedTop(boxes) {
        if (!boxes || boxes.length < 2) return false;
        const container = document.getElementById('chat-container');
        const containerRect = container ? container.getBoundingClientRect() : { top: 0, height: window.innerHeight };
        return boxes[0].rect.top <= (containerRect.top + 65);
    }

    function drawDrop(c, x, y, r, stretch, angle, color, alpha) {
        c.save();
        c.globalAlpha = alpha;
        c.translate(x, y);
        if (angle) c.rotate(angle);

        c.beginPath();
        c.moveTo(0, -r * stretch);
        c.quadraticCurveTo(r * 0.95, -r * stretch * 0.25, r, 0);
        c.arc(0, 0, r, 0, Math.PI, false);
        c.quadraticCurveTo(-r * 0.95, -r * stretch * 0.25, 0, -r * stretch);
        c.closePath();

        const grad = c.createRadialGradient(-r * 0.2, r * 0.15, r * 0.05, 0, 0, r * 1.1);
        grad.addColorStop(0, color.core);
        grad.addColorStop(0.55, color.dark);
        grad.addColorStop(1, color.base);
        c.fillStyle = grad;
        c.fill();

        c.beginPath();
        c.ellipse(-r * 0.25, r * 0.15, r * 0.2, r * 0.3, -Math.PI / 4, 0, Math.PI * 2);
        c.fillStyle = color.glint;
        c.fill();
        c.restore();
    }

    function drawForming(c, x, y, r, prog, color, alpha) {
        c.save();
        c.globalAlpha = alpha;
        const bulbR = r * (0.6 + prog * 0.5);
        const hangY = y + bulbR * (0.8 + prog * 1.5);
        const neckW = r * (0.85 - prog * 0.25);

        c.beginPath();
        c.moveTo(x - neckW, y);
        c.bezierCurveTo(x - neckW, y + (hangY - y) * 0.4, x - bulbR, hangY - bulbR * 0.6, x - bulbR, hangY);
        c.arc(x, hangY, bulbR, Math.PI, 0, true);
        c.bezierCurveTo(x + bulbR, hangY - bulbR * 0.6, x + neckW, y + (hangY - y) * 0.4, x + neckW, y);
        c.closePath();

        const grad = c.createRadialGradient(x - bulbR * 0.25, hangY + bulbR * 0.15, 1, x, hangY, bulbR * 1.2);
        grad.addColorStop(0, color.core);
        grad.addColorStop(0.6, color.dark);
        grad.addColorStop(1, color.base);
        c.fillStyle = grad;
        c.fill();

        c.beginPath();
        c.arc(x - bulbR * 0.25, hangY + bulbR * 0.15, bulbR * 0.22, 0, Math.PI * 2);
        c.fillStyle = color.glint;
        c.fill();
        c.restore();
    }

    function drawTrail(c, trail, alpha) {
        if (trail.points.length < 2) return;
        c.save();

        const curAlpha = trail.alpha * alpha;
        if (curAlpha > 0.02) {
            c.beginPath();
            for (let i = 0; i < trail.points.length; i++) {
                const p = trail.points[i];
                if (i === 0) c.moveTo(p.x, p.y);
                else c.lineTo(p.x, p.y);
            }
            c.lineWidth = trail.width * 1.2;
            c.lineCap = 'round';
            c.lineJoin = 'round';
            c.strokeStyle = trail.color.trace + (curAlpha * 0.45) + ')';
            c.stroke();

            c.beginPath();
            for (let i = 0; i < trail.points.length; i++) {
                const p = trail.points[i];
                if (i === 0) c.moveTo(p.x, p.y);
                else c.lineTo(p.x, p.y);
            }
            c.lineWidth = Math.max(0.6, trail.width * 0.55);
            c.strokeStyle = trail.color.trace + (curAlpha * 0.8) + ')';
            c.stroke();
        }

        for (const m of trail.microDroplets) {
            if (m.life <= 0) continue;
            c.beginPath();
            c.arc(m.x, m.y, m.radius, 0, Math.PI * 2);
            c.fillStyle = trail.color.trace + (m.life * alpha * 0.85) + ')';
            c.fill();
            if (m.radius > 1.2) {
                c.beginPath();
                c.arc(m.x - 0.3, m.y - 0.3, 0.4, 0, Math.PI * 2);
                c.fillStyle = trail.color.glint;
                c.fill();
            }
        }

        c.restore();
    }

    function createStream(boxes, xRatio, delay) {
        const sizeProfiles = [
            { rMin: 1.8, rMax: 2.6, speedMin: 115, speedMax: 150, grav: 560 },
            { rMin: 2.8, rMax: 3.8, speedMin: 160, speedMax: 205, grav: 660 },
            { rMin: 4.0, rMax: 5.2, speedMin: 215, speedMax: 270, grav: 750 }
        ];
        const profile = sizeProfiles[Math.floor(Math.random() * sizeProfiles.length)];
        const radius = profile.rMin + Math.random() * (profile.rMax - profile.rMin);
        const speed = profile.speedMin + Math.random() * (profile.speedMax - profile.speedMin);
        const trailWidth = 0.9 + (radius - 1.8) * 0.45;
        const color = BLOOD_PALETTES[Math.floor(Math.random() * BLOOD_PALETTES.length)];

        return {
            xRatio,
            delay,
            started: false,
            boxIndex: 0,
            state: 'forming',
            x: 0,
            y: 0,
            vx: 0,
            vy: 35,
            formProgress: 0,
            trickleY: 0,
            trickleStartX: 0,
            trickleTargetX: 0,
            trickleWaves: 1.5 + Math.random() * 2.0,
            trickleAmp: 2.0 + Math.random() * 3.5,
            trickleSeed: Math.random() * 50,
            lastMicroY: 0,
            currentTrail: null,
            radius,
            trailWidth,
            speed,
            gravity: profile.grav,
            color
        };
    }

    function startCycle() {
        const boxes = getChatBoxes();
        if (!hasReachedTop(boxes)) {
            pollTimer = setTimeout(checkAndStart, 1000);
            return;
        }

        const count = 3 + Math.floor(Math.random() * 4);
        const step = 0.76 / count;
        const slots = [];
        for (let i = 0; i < count; i++) {
            const minR = 0.12 + i * step;
            const maxR = minR + step * 0.85;
            slots.push(minR + Math.random() * (maxR - minR));
        }
        slots.sort(() => Math.random() - 0.5);

        const streams = [];
        for (let i = 0; i < count; i++) {
            const delay = i === 0 ? 0 : 0.12 + Math.random() * (i * 0.22 + 0.15);
            streams.push(createStream(boxes, slots[i], delay));
        }

        activeCycle = {
            startTime: performance.now(),
            streams,
            trails: [],
            phase: 'running',
            fadeTimer: 0,
            fadeAlpha: 1.0
        };

        if (!animId) {
            lastTime = performance.now();
            animId = requestAnimationFrame(loop);
        }
    }

    function loop(now) {
        if (!isRunning) return;
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;

        const curW = window.innerWidth;
        const curH = window.innerHeight;
        if (canvas && (canvas.width !== curW || canvas.height !== curH)) {
            canvas.width = curW;
            canvas.height = curH;
        }

        if (ctx && canvas) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }

        if (activeCycle) {
            updateCycle(dt);
        }

        if (activeCycle) {
            animId = requestAnimationFrame(loop);
        } else {
            animId = null;
        }
    }

    function updateCycle(dt) {
        const cycle = activeCycle;
        const boxes = getChatBoxes();

        if (boxes.length === 0) {
            activeCycle = null;
            pollTimer = setTimeout(checkAndStart, 1000);
            return;
        }

        const container = document.getElementById('chat-container');
        const bottomLimit = Math.max(window.innerHeight, container ? container.getBoundingClientRect().bottom : window.innerHeight) + 30;

        for (let i = cycle.trails.length - 1; i >= 0; i--) {
            const tr = cycle.trails[i];
            if (tr.fading) {
                tr.alpha -= dt * 0.42;
                let activeMicros = 0;
                for (const m of tr.microDroplets) {
                    m.life -= dt * 0.32;
                    if (m.life > 0) activeMicros++;
                }
                if (tr.alpha <= 0 && activeMicros === 0) {
                    cycle.trails.splice(i, 1);
                    continue;
                }
            }
            drawTrail(ctx, tr, cycle.fadeAlpha);
        }

        let allFinished = true;

        for (const s of cycle.streams) {
            if (s.delay > 0) {
                s.delay -= dt;
                allFinished = false;
                continue;
            }

            if (!s.started) {
                s.started = true;
                const b0 = boxes[0];
                s.x = b0.rect.left + b0.rect.width * s.xRatio;
                s.y = b0.rect.bottom;
            }

            if (s.state !== 'finished') {
                allFinished = false;
            }

            if (s.boxIndex >= boxes.length && s.state !== 'finished') {
                s.state = 'falling';
            }

            const currentBox = boxes[s.boxIndex] || null;

            if (s.state === 'forming') {
                if (currentBox) {
                    const rect = currentBox.el.getBoundingClientRect();
                    s.y = rect.bottom;
                    s.formProgress += dt * 2.0;
                    drawForming(ctx, s.x, s.y, s.radius, s.formProgress, s.color, cycle.fadeAlpha);
                    if (s.formProgress >= 1) {
                        s.state = 'falling';
                        s.vy = 40;
                        s.vx = (Math.random() - 0.5) * 45;
                        s.formProgress = 0;
                    }
                } else {
                    s.state = 'finished';
                }
            } else if (s.state === 'falling') {
                s.vy += s.gravity * dt;
                s.y += s.vy * dt;
                s.x += s.vx * dt;

                const curBoxRect = currentBox ? currentBox.el.getBoundingClientRect() : null;
                const minX = curBoxRect ? curBoxRect.left + 22 : 22;
                const maxX = curBoxRect ? curBoxRect.right - 22 : window.innerWidth - 22;
                s.x = Math.max(minX, Math.min(maxX, s.x));

                const stretch = Math.min(2.4, 1.2 + (s.vy / 500));
                const angle = Math.atan2(s.vx, s.vy);
                drawDrop(ctx, s.x, s.y, s.radius, stretch, angle, s.color, cycle.fadeAlpha);

                const nextBox = boxes[s.boxIndex + 1];
                if (nextBox) {
                    const nextRect = nextBox.el.getBoundingClientRect();
                    if (s.y >= nextRect.top) {
                        s.boxIndex++;
                        s.state = 'trickling';
                        const landX = Math.max(nextRect.left + 24, Math.min(nextRect.right - 24, s.x));
                        s.x = landX;
                        s.trickleStartX = landX;
                        const slant = (Math.random() - 0.5) * 55;
                        s.trickleTargetX = Math.max(nextRect.left + 24, Math.min(nextRect.right - 24, landX + slant));
                        s.trickleWaves = 1.5 + Math.random() * 2.0;
                        s.trickleAmp = 2.0 + Math.random() * 3.5;
                        s.trickleSeed = Math.random() * 50;
                        s.trickleY = nextRect.top;
                        s.lastMicroY = nextRect.top;

                        const newTrail = {
                            boxEl: nextBox.el,
                            color: s.color,
                            width: s.trailWidth,
                            alpha: 1.0,
                            fading: false,
                            points: [{ x: s.x, y: s.y }],
                            microDroplets: []
                        };
                        s.currentTrail = newTrail;
                        cycle.trails.push(newTrail);
                    }
                } else {
                    if (s.y >= bottomLimit) {
                        s.state = 'finished';
                    }
                }
            } else if (s.state === 'trickling') {
                if (currentBox) {
                    const rect = currentBox.el.getBoundingClientRect();
                    s.trickleY += s.speed * dt;
                    const totalH = Math.max(1, rect.bottom - rect.top);
                    const progress = Math.min(1, Math.max(0, (s.trickleY - rect.top) / totalH));

                    const baseX = s.trickleStartX + (s.trickleTargetX - s.trickleStartX) * progress;
                    const meander = Math.sin(progress * Math.PI * s.trickleWaves + s.trickleSeed) * s.trickleAmp;
                    s.x = Math.max(rect.left + 20, Math.min(rect.right - 20, baseX + meander));
                    s.y = s.trickleY;

                    if (s.currentTrail) {
                        s.currentTrail.points.push({ x: s.x, y: s.y });
                        if (s.trickleY - s.lastMicroY > 24) {
                            s.currentTrail.microDroplets.push({
                                x: s.x + (Math.random() - 0.5) * 3,
                                y: s.y,
                                radius: 0.8 + Math.random() * 0.8,
                                life: 1.0
                            });
                            s.lastMicroY = s.trickleY;
                        }
                    }

                    drawDrop(ctx, s.x, s.y, s.radius * 0.92, 1.15, 0, s.color, cycle.fadeAlpha);

                    if (s.trickleY >= rect.bottom) {
                        s.state = 'forming';
                        s.formProgress = 0;
                        s.y = rect.bottom;
                        if (s.currentTrail) {
                            s.currentTrail.fading = true;
                            s.currentTrail = null;
                        }
                    }
                } else {
                    s.state = 'finished';
                }
            }
        }

        if (cycle.phase === 'running' && allFinished) {
            cycle.phase = 'fading';
            cycle.fadeTimer = 0;
        }

        if (cycle.phase === 'fading') {
            cycle.fadeTimer += dt;
            cycle.fadeAlpha = Math.max(0, 1 - cycle.fadeTimer / 1.2);
            if (cycle.fadeAlpha <= 0) {
                activeCycle = null;
                if (ctx && canvas) ctx.clearRect(0, 0, canvas.width, canvas.height);
                cycleTimer = setTimeout(checkAndStart, 10000);
            }
        }
    }

    function checkAndStart() {
        if (!isRunning) return;
        const boxes = getChatBoxes();
        if (hasReachedTop(boxes)) {
            startCycle();
        } else {
            pollTimer = setTimeout(checkAndStart, 1200);
        }
    }

    function setChatDecor(enable) {
        if (enable) {
            if (isRunning) return;
            isRunning = true;
            createCanvas();
            checkAndStart();
        } else {
            removeCanvas();
        }
    }

    window.HorrorDecor = { setChatDecor };
})();
