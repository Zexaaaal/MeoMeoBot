(function () {
    'use strict';

    const STYLE_ID = 'halloween-decor-base';
    const DECOR_ID = 'halloween-decor';
    const DECOR_FG_ID = 'halloween-decor-fg';

    const BASE_CSS = `
        .hw-bat-svg, .hw-jol-svg { display: block; width: 100%; height: 100%; overflow: visible; }

        .hw-bat-wing { transform-box: fill-box; animation-duration: var(--hw-flap, 0.28s);
            animation-timing-function: ease-in-out; animation-iteration-count: infinite;
            animation-direction: alternate; }
        .hw-bat-wing-l { transform-origin: 100% 60%; animation-name: hw-flap-l; }
        .hw-bat-wing-r { transform-origin: 0% 60%;  animation-name: hw-flap-r; }
        @keyframes hw-flap-l { from { transform: rotate(22deg) scaleY(1); } to { transform: rotate(-34deg) scaleY(0.78); } }
        @keyframes hw-flap-r { from { transform: rotate(-22deg) scaleY(1); } to { transform: rotate(34deg) scaleY(0.78); } }
        .hw-bat-eye { animation: hw-eye-glow 1.6s ease-in-out infinite alternate; }
        @keyframes hw-eye-glow { from { opacity: 0.55; } to { opacity: 1; } }

        .hw-jol-glow { animation: hw-jol-pulse 2.6s ease-in-out infinite; }
        @keyframes hw-jol-pulse {
            0%, 100% { filter: drop-shadow(0 0 5px rgba(255, 140, 20, 0.55)); }
            50%      { filter: drop-shadow(0 0 14px rgba(255, 170, 30, 0.95)); }
        }
        .hw-jol-face { animation: hw-jol-flicker 2.2s steps(1, end) infinite; }
        @keyframes hw-jol-flicker {
            0%   { opacity: 1; }   7%  { opacity: 0.82; }  10% { opacity: 1; }
            34%  { opacity: 0.9; } 37% { opacity: 1; }     61% { opacity: 0.78; }
            64%  { opacity: 0.96; } 85% { opacity: 0.88; } 88% { opacity: 1; }
        }
        .hw-jol-eye { transform-box: fill-box; transform-origin: 50% 70%;
            animation: hw-jol-blink 5.5s ease-in-out infinite; }
        @keyframes hw-jol-blink { 0%, 93%, 100% { transform: scaleY(1); } 96% { transform: scaleY(0.08); } }

        @media (prefers-reduced-motion: reduce) {
            .hw-bat-wing, .hw-bat-eye, .hw-jol-glow, .hw-jol-face, .hw-jol-eye { animation: none; }
        }
    `;

    let uid = 0;

    function ensureStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = BASE_CSS;
        document.head.appendChild(style);
    }

    function batSVG() {
        const wing = 'M28 15 C21 3 9 2 1 9 C6 9 8 12 9 17 C12 14 15 14 17 18 C19 15 23 15 25 20 Z';
        return `<svg class="hw-bat-svg" viewBox="0 0 64 32" xmlns="http://www.w3.org/2000/svg">
            <g class="hw-bat-wing hw-bat-wing-l"><path d="${wing}" fill="#24163a" stroke="#9a6ad8" stroke-width="0.8" stroke-linejoin="round"/></g>
            <g class="hw-bat-wing hw-bat-wing-r"><g transform="matrix(-1 0 0 1 64 0)"><path d="${wing}" fill="#24163a" stroke="#9a6ad8" stroke-width="0.8" stroke-linejoin="round"/></g></g>
            <path d="M27 9 L28.5 2 L31 8 L33 8 L35.5 2 L37 9 Z" fill="#24163a" stroke="#9a6ad8" stroke-width="0.8" stroke-linejoin="round"/>
            <ellipse cx="32" cy="17" rx="5.2" ry="8" fill="#2d1b47" stroke="#9a6ad8" stroke-width="0.8"/>
            <circle cx="32" cy="10.5" r="4.6" fill="#2d1b47" stroke="#9a6ad8" stroke-width="0.8"/>
            <circle class="hw-bat-eye" cx="30" cy="10" r="1" fill="#ff4a3a"/>
            <circle class="hw-bat-eye" cx="34" cy="10" r="1" fill="#ff4a3a"/>
            <path d="M30.6 13 L31.2 14.6 L32 13.2 L32.8 14.6 L33.4 13" fill="none" stroke="#fff" stroke-width="0.5" stroke-linejoin="round"/>
        </svg>`;
    }

    function pumpkinSVG() {
        const id = `hwJol${++uid}`;
        return `<svg class="hw-jol-svg" viewBox="0 0 120 112" xmlns="http://www.w3.org/2000/svg">
            <defs>
                <radialGradient id="${id}" cx="50%" cy="42%" r="62%">
                    <stop offset="0" stop-color="#ffb347"/>
                    <stop offset="0.55" stop-color="#f26a0a"/>
                    <stop offset="1" stop-color="#a83a00"/>
                </radialGradient>
            </defs>
            <g class="hw-jol-glow">
                <g fill="url(#${id})" stroke="#7a2c00" stroke-width="2">
                    <ellipse cx="24" cy="64" rx="22" ry="34"/>
                    <ellipse cx="96" cy="64" rx="22" ry="34"/>
                    <ellipse cx="41" cy="63" rx="27" ry="42"/>
                    <ellipse cx="79" cy="63" rx="27" ry="42"/>
                    <ellipse cx="60" cy="62" rx="26" ry="45"/>
                </g>
                <path d="M53 22 C54 10 60 5 68 3 C66 10 69 15 68 22 Z" fill="#4f8a22" stroke="#2c4f10" stroke-width="2" stroke-linejoin="round"/>
                <path d="M68 8 C76 6 80 11 76 15" fill="none" stroke="#4f8a22" stroke-width="2" stroke-linecap="round"/>
                <g class="hw-jol-face" fill="#ffe27a">
                    <path class="hw-jol-eye" d="M33 57 L51 57 L42 41 Z"/>
                    <path class="hw-jol-eye" d="M69 57 L87 57 L78 41 Z"/>
                    <path d="M60 62 L53 73 L67 73 Z"/>
                    <path d="M29 77 L40 75 L46 85 L54 79 L60 88 L66 79 L74 85 L80 75 L91 77 Q60 106 29 77 Z"/>
                </g>
            </g>
        </svg>`;
    }

    function el(tag, className, html) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (html) node.innerHTML = html;
        return node;
    }

    function cobwebSVG() {
        return `<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" width="100%" height="100%">
            <g fill="none" stroke="#e9e2f5" stroke-width="1" stroke-linecap="round" opacity="0.7">
                <path d="M0 0 L100 0 M0 0 L92 34 M0 0 L72 72 M0 0 L34 92 M0 0 L0 100"/>
                <path d="M22 0 Q18 18 0 22 M44 0 Q36 36 0 44 M66 0 Q54 54 0 66 M88 0 Q72 72 0 88"/>
            </g>
        </svg>`;
    }

    function setChatDecor(enable) {
        const back = document.getElementById(DECOR_ID);
        const front = document.getElementById(DECOR_FG_ID);

        if (!enable) {
            if (back) back.remove();
            if (front) front.remove();
            return;
        }
        if (back) return;
        ensureStyles();

        const bg = el('div');
        bg.id = DECOR_ID;
        bg.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:0;overflow:hidden';
        bg.appendChild(el('div', 'hw-web', cobwebSVG()));
        ['hw-pumpkin hw-p-bl', 'hw-pumpkin hw-p-br', 'hw-pumpkin hw-p-bl-small'].forEach(cls => {
            bg.appendChild(el('div', cls, pumpkinSVG()));
        });
        document.body.prepend(bg);

        const fg = el('div');
        fg.id = DECOR_FG_ID;
        fg.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;overflow:hidden';

        ['hw-p-hang-1', 'hw-p-hang-2'].forEach(cls => {
            const hang = el('div', `hw-hanging ${cls}`);
            hang.appendChild(el('div', 'hw-string'));
            hang.appendChild(el('div', 'hw-pumpkin', pumpkinSVG()));
            fg.appendChild(hang);
        });

        const bats = 6;
        for (let i = 0; i < bats; i++) {
            const rtl = i % 2 === 1;
            const bat = el('div', `hw-flyer ${rtl ? 'hw-rtl' : 'hw-ltr'}`);
            bat.style.setProperty('--hw-y', `${6 + Math.random() * 78}vh`);
            bat.style.setProperty('--hw-size', `${26 + Math.random() * 30}px`);
            bat.style.setProperty('--hw-dur', `${9 + Math.random() * 9}s`);
            bat.style.setProperty('--hw-delay', `${-Math.random() * 16}s`);
            bat.style.setProperty('--hw-flap', `${0.2 + Math.random() * 0.16}s`);
            bat.appendChild(el('div', 'hw-flyer-body', batSVG()));
            fg.appendChild(bat);
        }
        document.body.appendChild(fg);
    }

    function rainBats(options) {
        ensureStyles();
        const opts = Object.assign({ duration: 5000, minSize: 44, maxSize: 120 }, options);
        const endTime = Date.now() + opts.duration;

        function spawn() {
            if (Date.now() > endTime) return;

            const size = opts.minSize + Math.pow(Math.random(), 1.6) * (opts.maxSize - opts.minSize);
            const bat = el('div', 'hw-rain-bat', batSVG());
            bat.style.cssText = `position:fixed;top:0;left:0;width:${size}px;height:${size / 2}px;`
                + 'pointer-events:none;z-index:9999;will-change:transform,opacity;'
                + 'filter:drop-shadow(0 0 8px rgba(170,90,255,0.85));';
            bat.style.setProperty('--hw-flap', `${0.16 + Math.random() * 0.14}s`);
            document.body.appendChild(bat);

            const vw = window.innerWidth;
            const vh = window.innerHeight;
            const x0 = Math.random() * (vw - size);
            const sway = 30 + Math.random() * 90;
            const dir = Math.random() < 0.5 ? -1 : 1;
            const fallTo = vh + size + 40;
            const duration = 2800 + Math.random() * 2600;
            const rot = 14 + Math.random() * 12;

            const steps = 6;
            const frames = [];
            for (let i = 0; i <= steps; i++) {
                const t = i / steps;
                const dx = Math.sin(t * Math.PI * (2 + dir)) * sway * dir;
                const tilt = Math.cos(t * Math.PI * (2 + dir)) * rot * dir;
                frames.push({
                    transform: `translate(${x0 + dx}px, ${-size + t * fallTo}px) rotate(${tilt}deg)`,
                    opacity: i === 0 ? 0 : (i === steps ? 0.2 : 1),
                    offset: t
                });
            }

            const animation = bat.animate(frames, { duration, easing: 'cubic-bezier(0.4, 0.05, 0.8, 0.9)', fill: 'forwards' });
            animation.onfinish = () => bat.remove();

            setTimeout(spawn, 35 + Math.random() * 75);
        }

        spawn();
    }

    window.HalloweenDecor = { ensureStyles, batSVG, pumpkinSVG, setChatDecor, rainBats };
})();
