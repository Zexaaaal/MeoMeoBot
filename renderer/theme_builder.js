import { BUILDER_SCHEMA, FONTS, setFonts } from './theme_builder_schema.js';

let systemFontsLoaded = false;

export async function loadSystemFonts() {
    if (systemFontsLoaded) return;
    try {
        const fonts = await window.api.invoke('get-system-fonts');
        if (fonts && fonts.length > 0) {
            setFonts(fonts);
            systemFontsLoaded = true;
        }
    } catch (e) {
        console.error('Failed to load system fonts:', e);
    }
}

let currentValues = {};
let baseThemeCSS = '';
let themeValues = {};
let onChangeCallback = null;

export function setBaseThemeCSS(css) {
    baseThemeCSS = css || '';
}

export function getBaseThemeCSS() {
    return baseThemeCSS;
}

export function snapshotThemeValues() {
    themeValues = { ...currentValues };
}

export function resetToTheme() {
    currentValues = { ...themeValues };
}

export function initBuilder(container, widgetName, onChange) {
    onChangeCallback = onChange;
    container.innerHTML = '';

    document.addEventListener('click', () => {
        document.querySelectorAll('.custom-picker-dropdown.active').forEach(d => d.classList.remove('active'));
        document.querySelectorAll('.custom-picker-btn.active').forEach(b => b.classList.remove('active'));
    }, { once: false });

    const schema = BUILDER_SCHEMA[widgetName];
    if (!schema) {
        container.innerHTML = '<p class="tb-empty">Aucun builder disponible pour ce widget.</p>';
        return;
    }

    schema.forEach((section, sIdx) => {
        const accordion = createAccordion(section, sIdx);
        container.appendChild(accordion);
    });
}

export function generateCSS(widgetName) {
    const schema = BUILDER_SCHEMA[widgetName];
    if (!schema) return baseThemeCSS;

    const keyframes = new Set();
    let css = '';
    if (baseThemeCSS) {
        css += baseThemeCSS + '\n\n/* === Builder Overrides === */\n\n';
    }

    schema.forEach(section => {
        const declarations = [];

        section.props.forEach(prop => {
            const key = section.selector + '|' + prop.key;
            const val = currentValues[key];
            if (val === undefined || val === null) return;

            if (baseThemeCSS) {
                const themeVal = themeValues[key];
                if (String(val) === String(themeVal)) return;
                if (themeVal === undefined && val === prop.default) return;
                if (themeVal === undefined && String(val) === String(prop.default)) return;
            }

            if (prop.type === 'toggle') {
                if (val && prop.key === '--user-color-bg') {
                    declarations.push('background: var(--user-color-soft)');
                }
                return;
            }

            if (prop.type === 'blur') {
                if (val > 0) {
                    const cssProp = prop.key === 'filter' ? 'filter' : 'backdrop-filter';
                    declarations.push(`${cssProp}: blur(${val}px)`);
                }
                return;
            }

            if (prop.type === 'gradient') {
                if (val) declarations.push(`background: ${val}`);
                return;
            }

            if (prop.type === 'box-shadow') {
                if (val && val !== 'none') declarations.push(`box-shadow: ${val}`);
                return;
            }

            if (prop.type === 'text-shadow') {
                if (val && val !== 'none') declarations.push(`text-shadow: ${val}`);
                return;
            }

            if (prop.key === 'animation-name') {
                if (val && val !== 'none') {
                    keyframes.add(val);
                    const dur = currentValues[section.selector + '|animation-duration'] || 0.3;
                    declarations.push(`animation: ${val} ${dur}s ease-out forwards`);
                }
                return;
            }
            if (prop.key === 'animation-duration') return;

            if (prop.type === 'spacing') {
                if (val) declarations.push(`${prop.key}: ${val}`);
                return;
            }

            if (prop.key === 'color' && prop.useUserColor) {
                const useUC = currentValues[section.selector + '|--use-user-color'];
                if (useUC) {
                    declarations.push('color: var(--user-color)');
                    return;
                }
            }
            if ((prop.key === 'border-width' || prop.key === 'border-color') &&
                currentValues[section.selector + '|border-style'] === 'none') {
                return;
            }

            const unit = prop.unit || '';
            if (prop.type === 'slider') {
                declarations.push(`${prop.key}: ${val}${unit}`);
            } else if (prop.type === 'color' || prop.type === 'color-alpha') {
                declarations.push(`${prop.key}: ${val}`);
            } else if (prop.type === 'font') {
                declarations.push(`${prop.key}: ${val}`);
            } else if (prop.type === 'select') {
                declarations.push(`${prop.key}: ${val}`);
            }
        });

        if (declarations.length > 0) {
            css += `${section.selector} {\n`;
            declarations.forEach(d => { css += `    ${d};\n`; });
            css += '}\n\n';
        }
    });

    const badgeW = currentValues['.badge-img|width'];
    if (badgeW !== undefined) {
        css = css.replace(
            /\.badge-img \{([^}]*width:\s*\d+px;)/,
            `.badge-img {$1\n    height: ${badgeW}px;`
        );
    }

    keyframes.forEach(name => {
        css += getKeyframes(name);
    });

    return css;
}

export function parseCSS(css, widgetName) {
    const schema = BUILDER_SCHEMA[widgetName];
    if (!schema || !css) return;

    schema.forEach(section => {
        const re = new RegExp(
            escapeRegex(section.selector) + '\\s*\\{([^}]*?)\\}',
            'gs'
        );
        let match;
        let lastMatch = null;
        while ((match = re.exec(css)) !== null) {
            lastMatch = match;
        }
        if (!lastMatch) return;

        const block = lastMatch[1];

        section.props.forEach(prop => {
            if (prop.type === 'toggle') {
                if (prop.key === '--user-color-bg') {
                    currentValues[section.selector + '|' + prop.key] =
                        /var\(--user-color-soft\)/.test(block);
                }
                return;
            }

            if (prop.key === 'animation-name') {
                const animMatch = block.match(/animation:\s*(\S+)\s+([\d.]+)s/);
                if (animMatch) {
                    currentValues[section.selector + '|animation-name'] = animMatch[1];
                    currentValues[section.selector + '|animation-duration'] = parseFloat(animMatch[2]);
                }
                return;
            }
            if (prop.key === 'animation-duration') return;

            if (prop.type === 'blur') {
                const cssProp = prop.key === 'filter' ? 'filter' : 'backdrop-filter';
                const blurMatch = block.match(new RegExp(cssProp + ':\\s*blur\\((\\d+)px\\)'));
                currentValues[section.selector + '|' + prop.key] = blurMatch ? parseInt(blurMatch[1]) : 0;
                return;
            }

            if (prop.type === 'gradient') {
                const gradMatch = block.match(/background:\s*(linear-gradient\([^;]+\))/);
                currentValues[section.selector + '|' + prop.key] = gradMatch ? gradMatch[1].trim() : prop.default;
                return;
            }

            if (prop.type === 'box-shadow') {
                const shadowMatch = block.match(/box-shadow:\s*([^;]+)/);
                currentValues[section.selector + '|' + prop.key] = shadowMatch ? shadowMatch[1].trim() : 'none';
                return;
            }

            if (prop.type === 'text-shadow') {
                const tsMatch = block.match(/text-shadow:\s*([^;]+)/);
                currentValues[section.selector + '|' + prop.key] = tsMatch ? tsMatch[1].trim() : 'none';
                return;
            }

            if (prop.key === 'color' && prop.useUserColor) {
                if (/color:\s*var\(--user-color\)/.test(block)) {
                    currentValues[section.selector + '|--use-user-color'] = true;
                    currentValues[section.selector + '|color'] = prop.default;
                    return;
                }
            }

            const propMatch = block.match(
                new RegExp(escapeRegex(prop.key) + ':\\s*([^;]+)')
            );
            if (propMatch) {
                let val = propMatch[1].trim();
                if (prop.type === 'slider') {
                    val = parseFloat(val);
                }
                currentValues[section.selector + '|' + prop.key] = val;
            }
        });
    });

    refreshControls(widgetName);
}

export function setDefaults(widgetName) {
    const schema = BUILDER_SCHEMA[widgetName];
    if (!schema) return;

    currentValues = {};
    schema.forEach(section => {
        section.props.forEach(prop => {
            if (prop.default !== undefined) {
                currentValues[section.selector + '|' + prop.key] = prop.default;
            }
        });
    });
}

function createAccordion(section, index) {
    const wrapper = document.createElement('div');
    wrapper.className = 'tb-accordion';

    const header = document.createElement('button');
    header.className = 'tb-accordion-header';
    header.innerHTML = `
        <span>${section.label}</span>
        <svg class="tb-accordion-arrow" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="3,4.5 6,7.5 9,4.5"></polyline>
        </svg>
    `;

    const content = document.createElement('div');
    content.className = 'tb-accordion-content';
    if (index === 0) {
        wrapper.classList.add('open');
    }

    section.props.forEach(prop => {
        const control = createControl(section.selector, prop);
        if (control) content.appendChild(control);
    });

    header.addEventListener('click', () => {
        const isOpen = wrapper.classList.contains('open');
        const parent = wrapper.parentElement;
        if (parent) {
            parent.querySelectorAll('.tb-accordion.open').forEach(a => a.classList.remove('open'));
        }
        if (!isOpen) wrapper.classList.add('open');
    });

    wrapper.appendChild(header);
    wrapper.appendChild(content);
    return wrapper;
}

function createControl(selector, prop) {
    const row = document.createElement('div');
    row.className = 'tb-control';
    row.dataset.controlKey = selector + '|' + prop.key;

    const label = document.createElement('label');
    label.className = 'tb-label';
    label.textContent = prop.label;
    row.appendChild(label);

    const controlWrap = document.createElement('div');
    controlWrap.className = 'tb-control-input';

    switch (prop.type) {
        case 'slider': createSlider(controlWrap, selector, prop); break;
        case 'color': createColorPicker(controlWrap, selector, prop); break;
        case 'color-alpha': createColorAlpha(controlWrap, selector, prop); break;
        case 'font': createFontSelect(controlWrap, selector, prop); break;
        case 'select': createSelect(controlWrap, selector, prop); break;
        case 'blur': createSlider(controlWrap, selector, { ...prop, key: prop.key, min: 0, max: prop.max || 30, unit: 'px', step: 1 }); break;
        case 'toggle': createToggle(controlWrap, selector, prop); break;
        case 'text-shadow': createTextShadow(controlWrap, selector, prop); break;
        case 'box-shadow': createBoxShadow(controlWrap, selector, prop); break;
        case 'spacing': createSpacing(controlWrap, selector, prop); break;
        case 'gradient': createGradient(controlWrap, selector, prop); break;
        default:
            controlWrap.textContent = `Type "${prop.type}" non implémenté`;
    }

    row.appendChild(controlWrap);

    if (prop.useUserColor) {
        const ucRow = createUserColorToggle(selector, prop);
        const fragment = document.createDocumentFragment();
        fragment.appendChild(row);
        fragment.appendChild(ucRow);
        return fragment;
    }

    return row;
}

function createSlider(parent, selector, prop) {
    const key = selector + '|' + prop.key;
    const val = currentValues[key] ?? prop.default ?? prop.min ?? 0;

    const range = document.createElement('input');
    range.type = 'range';
    range.className = 'tb-range';
    range.min = prop.min ?? 0;
    range.max = prop.max ?? 100;
    range.step = prop.step ?? 1;
    range.value = val;

    const num = document.createElement('input');
    num.type = 'number';
    num.className = 'tb-number';
    num.min = range.min;
    num.max = range.max;
    num.step = range.step;
    num.value = val;

    const unit = document.createElement('span');
    unit.className = 'tb-unit';
    unit.textContent = prop.unit || '';

    currentValues[key] = parseFloat(val);

    range.addEventListener('input', () => {
        num.value = range.value;
        currentValues[key] = parseFloat(range.value);
        emitChange();
    });

    num.addEventListener('input', () => {
        range.value = num.value;
        currentValues[key] = parseFloat(num.value);
        emitChange();
    });

    parent.appendChild(range);
    parent.appendChild(num);
    if (prop.unit) parent.appendChild(unit);
}

function createColorPicker(parent, selector, prop) {
    const key = selector + '|' + prop.key;
    const val = currentValues[key] ?? prop.default ?? '#ffffff';

    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'tb-color';
    input.value = toHex6(val);

    const hex = document.createElement('input');
    hex.type = 'text';
    hex.className = 'tb-hex';
    hex.value = val;
    hex.maxLength = 9;

    currentValues[key] = val;

    input.addEventListener('input', () => {
        hex.value = input.value;
        currentValues[key] = input.value;
        emitChange();
    });

    hex.addEventListener('change', () => {
        input.value = toHex6(hex.value);
        currentValues[key] = hex.value;
        emitChange();
    });

    parent.appendChild(input);
    parent.appendChild(hex);
}

function createColorAlpha(parent, selector, prop) {
    const key = selector + '|' + prop.key;
    const val = currentValues[key] ?? prop.default ?? 'rgba(0,0,0,0.5)';

    const parsed = parseRgba(val);

    const input = document.createElement('input');
    input.type = 'color';
    input.className = 'tb-color';
    input.value = rgbToHex(parsed.r, parsed.g, parsed.b);

    const alpha = document.createElement('input');
    alpha.type = 'range';
    alpha.className = 'tb-range tb-range-alpha';
    alpha.min = 0;
    alpha.max = 1;
    alpha.step = 0.05;
    alpha.value = parsed.a;

    const alphaLabel = document.createElement('span');
    alphaLabel.className = 'tb-alpha-val';
    alphaLabel.textContent = Math.round(parsed.a * 100) + '%';

    currentValues[key] = val;

    const update = () => {
        const hex = input.value;
        const r = parseInt(hex.slice(1, 3), 16);
        const g = parseInt(hex.slice(3, 5), 16);
        const b = parseInt(hex.slice(5, 7), 16);
        const a = parseFloat(alpha.value);
        alphaLabel.textContent = Math.round(a * 100) + '%';
        currentValues[key] = `rgba(${r}, ${g}, ${b}, ${a})`;
        emitChange();
    };

    input.addEventListener('input', update);
    alpha.addEventListener('input', update);

    parent.appendChild(input);
    parent.appendChild(alpha);
    parent.appendChild(alphaLabel);
}



function buildCustomSelect(options, currentVal, onChange, isFont = false) {
    const container = document.createElement('div');
    container.className = 'custom-picker-container';

    const btn = document.createElement('button');
    btn.className = 'custom-picker-btn';
    if (isFont) {
        btn.style.fontFamily = currentVal;
    }


    let btnLabel = currentVal;
    options.forEach(o => {
        const optVal = typeof o === 'object' ? o.value : String(o);
        if (optVal === String(currentVal)) {
            btnLabel = typeof o === 'object' ? o.label : String(o);
        }
    });
    btn.textContent = btnLabel;

    const dropdown = document.createElement('div');
    dropdown.className = 'custom-picker-dropdown';
    dropdown.style.maxHeight = '250px';
    dropdown.style.overflowY = 'auto';

    options.forEach(o => {
        const optVal = typeof o === 'object' ? o.value : String(o);
        const optLabel = typeof o === 'object' ? o.label : String(o);

        const optDiv = document.createElement('div');
        optDiv.className = 'custom-picker-option';
        if (optVal === String(currentVal)) optDiv.classList.add('selected');
        optDiv.textContent = optLabel;
        optDiv.dataset.value = optVal;

        if (isFont) {
            optDiv.style.fontFamily = optVal;
        }

        optDiv.addEventListener('click', (e) => {
            e.stopPropagation();
            dropdown.querySelectorAll('.custom-picker-option').forEach(el => el.classList.remove('selected'));
            optDiv.classList.add('selected');
            btn.textContent = optLabel;
            if (isFont) btn.style.fontFamily = optVal;
            dropdown.classList.remove('active');
            btn.classList.remove('active');
            onChange(optVal);
        });

        dropdown.appendChild(optDiv);
    });

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const isActive = dropdown.classList.contains('active');
        document.querySelectorAll('.custom-picker-dropdown.active').forEach(d => d.classList.remove('active'));
        document.querySelectorAll('.custom-picker-btn.active').forEach(b => b.classList.remove('active'));
        if (!isActive) {
            dropdown.classList.add('active');
            btn.classList.add('active');
            const selected = dropdown.querySelector('.selected');
            if (selected) selected.scrollIntoView({ block: 'center' });
        }
    });

    container.appendChild(btn);
    container.appendChild(dropdown);
    return container;
}

function createFontSelect(parent, selector, prop) {
    const key = selector + '|' + prop.key;
    const val = currentValues[key] ?? prop.default ?? 'sans-serif';
    const options = prop.options || FONTS;

    currentValues[key] = val;

    const selectEl = buildCustomSelect(options, val, (newVal) => {
        currentValues[key] = newVal;
        emitChange();
    }, true);

    parent.appendChild(selectEl);
}

function createSelect(parent, selector, prop) {
    const key = selector + '|' + prop.key;
    const val = currentValues[key] ?? prop.default;

    currentValues[key] = String(val);

    const selectEl = buildCustomSelect(prop.options, String(val), (newVal) => {
        currentValues[key] = newVal;
        emitChange();
    });

    parent.appendChild(selectEl);
}

function createToggle(parent, selector, prop) {
    const key = selector + '|' + prop.key;
    const val = currentValues[key] ?? prop.default ?? false;

    const label = document.createElement('label');
    label.className = 'tb-toggle-wrapper';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'tb-toggle';
    input.checked = val;

    const slider = document.createElement('span');
    slider.className = 'tb-toggle-slider';

    currentValues[key] = val;

    input.addEventListener('change', () => {
        currentValues[key] = input.checked;
        emitChange();
    });

    label.appendChild(input);
    label.appendChild(slider);
    parent.appendChild(label);
}

function createUserColorToggle(selector, prop) {
    const ucKey = selector + '|--use-user-color';
    const row = document.createElement('div');
    row.className = 'tb-control';
    row.dataset.controlKey = ucKey;

    const lbl = document.createElement('label');
    lbl.className = 'tb-label';
    lbl.textContent = 'Utiliser couleur du pseudo';
    row.appendChild(lbl);

    const wrap = document.createElement('div');
    wrap.className = 'tb-control-input';

    const label = document.createElement('label');
    label.className = 'tb-toggle-wrapper';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'tb-toggle';
    input.checked = currentValues[ucKey] ?? false;

    const slider = document.createElement('span');
    slider.className = 'tb-toggle-slider';

    currentValues[ucKey] = input.checked;

    input.addEventListener('change', () => {
        currentValues[ucKey] = input.checked;
        emitChange();
    });

    label.appendChild(input);
    label.appendChild(slider);
    wrap.appendChild(label);
    row.appendChild(wrap);
    return row;
}

function createTextShadow(parent, selector, prop) {
    const key = selector + '|' + prop.key;
    const val = currentValues[key] ?? prop.default ?? 'none';

    const enableCb = document.createElement('input');
    enableCb.type = 'checkbox';
    enableCb.className = 'tb-toggle-sm';
    enableCb.checked = val !== 'none';

    const controls = document.createElement('div');
    controls.className = 'tb-shadow-controls';
    controls.style.display = enableCb.checked ? 'flex' : 'none';

    const parsed = parseShadow(val);

    const xInput = createMiniSlider('X', -20, 20, parsed.x);
    const yInput = createMiniSlider('Y', -20, 20, parsed.y);
    const blurInput = createMiniSlider('Flou', 0, 30, parsed.blur);

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'tb-color tb-color-sm';
    colorInput.value = toHex6(parsed.color);

    controls.appendChild(xInput.wrap);
    controls.appendChild(yInput.wrap);
    controls.appendChild(blurInput.wrap);
    controls.appendChild(colorInput);

    const update = () => {
        if (!enableCb.checked) {
            currentValues[key] = 'none';
        } else {
            const x = xInput.input.value;
            const y = yInput.input.value;
            const b = blurInput.input.value;
            const c = colorInput.value;
            currentValues[key] = `${x}px ${y}px ${b}px ${c}`;
        }
        emitChange();
    };

    enableCb.addEventListener('change', () => {
        controls.style.display = enableCb.checked ? 'flex' : 'none';
        update();
    });

    [xInput.input, yInput.input, blurInput.input, colorInput].forEach(el => {
        el.addEventListener('input', update);
    });

    currentValues[key] = val;

    parent.appendChild(enableCb);
    parent.appendChild(controls);
}

function createBoxShadow(parent, selector, prop) {
    const key = selector + '|' + prop.key;
    const val = currentValues[key] ?? prop.default ?? 'none';

    const enableCb = document.createElement('input');
    enableCb.type = 'checkbox';
    enableCb.className = 'tb-toggle-sm';
    enableCb.checked = val !== 'none';

    const controls = document.createElement('div');
    controls.className = 'tb-shadow-controls';
    controls.style.display = enableCb.checked ? 'flex' : 'none';

    const parsed = parseShadow(val);

    const xInput = createMiniSlider('X', -30, 30, parsed.x);
    const yInput = createMiniSlider('Y', -30, 30, parsed.y);
    const blurInput = createMiniSlider('Flou', 0, 50, parsed.blur);
    const spreadInput = createMiniSlider('Étendue', -20, 40, parsed.spread || 0);

    const colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.className = 'tb-color tb-color-sm';
    colorInput.value = toHex6(parsed.color);

    controls.appendChild(xInput.wrap);
    controls.appendChild(yInput.wrap);
    controls.appendChild(blurInput.wrap);
    controls.appendChild(spreadInput.wrap);
    controls.appendChild(colorInput);

    const update = () => {
        if (!enableCb.checked) {
            currentValues[key] = 'none';
        } else {
            currentValues[key] = `${xInput.input.value}px ${yInput.input.value}px ${blurInput.input.value}px ${spreadInput.input.value}px ${colorInput.value}`;
        }
        emitChange();
    };

    enableCb.addEventListener('change', () => {
        controls.style.display = enableCb.checked ? 'flex' : 'none';
        update();
    });

    [xInput.input, yInput.input, blurInput.input, spreadInput.input, colorInput].forEach(el => {
        el.addEventListener('input', update);
    });

    currentValues[key] = val;

    parent.appendChild(enableCb);
    parent.appendChild(controls);
}

function createSpacing(parent, selector, prop) {
    const key = selector + '|' + prop.key;
    const val = currentValues[key] ?? prop.default ?? '10px';

    const parts = val.replace(/px/g, '').split(/\s+/).map(Number);
    const top = parts[0] || 0;
    const right = parts[1] ?? top;
    const bottom = parts[2] ?? top;
    const left = parts[3] ?? right;

    const tInput = createMiniSlider('Haut', 0, 60, top);
    const rInput = createMiniSlider('Droite', 0, 60, right);
    const bInput = createMiniSlider('Bas', 0, 60, bottom);
    const lInput = createMiniSlider('Gauche', 0, 60, left);

    currentValues[key] = val;

    const update = () => {
        currentValues[key] = `${tInput.input.value}px ${rInput.input.value}px ${bInput.input.value}px ${lInput.input.value}px`;
        emitChange();
    };

    [tInput, rInput, bInput, lInput].forEach(s => {
        s.input.addEventListener('input', update);
    });

    const grid = document.createElement('div');
    grid.className = 'tb-spacing-grid';
    grid.appendChild(tInput.wrap);
    grid.appendChild(rInput.wrap);
    grid.appendChild(bInput.wrap);
    grid.appendChild(lInput.wrap);

    parent.appendChild(grid);
}

function createGradient(parent, selector, prop) {
    const key = selector + '|' + prop.key;
    const val = currentValues[key] ?? prop.default ?? 'linear-gradient(90deg, #ff00cc, #333399)';

    const parsed = parseGradient(val);

    const angleInput = createMiniSlider('Angle', 0, 360, parsed.angle);

    const color1 = document.createElement('input');
    color1.type = 'color';
    color1.className = 'tb-color tb-color-sm';
    color1.value = toHex6(parsed.color1);

    const arrow = document.createElement('span');
    arrow.className = 'tb-unit';
    arrow.textContent = '→';

    const color2 = document.createElement('input');
    color2.type = 'color';
    color2.className = 'tb-color tb-color-sm';
    color2.value = toHex6(parsed.color2);

    currentValues[key] = val;

    const update = () => {
        currentValues[key] = `linear-gradient(${angleInput.input.value}deg, ${color1.value}, ${color2.value})`;
        emitChange();
    };

    angleInput.input.addEventListener('input', update);
    color1.addEventListener('input', update);
    color2.addEventListener('input', update);

    parent.appendChild(color1);
    parent.appendChild(arrow);
    parent.appendChild(color2);
    parent.appendChild(angleInput.wrap);
}

function createMiniSlider(label, min, max, value) {
    const wrap = document.createElement('div');
    wrap.className = 'tb-mini-slider';

    const lbl = document.createElement('span');
    lbl.className = 'tb-mini-label';
    lbl.textContent = label;

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'tb-number tb-number-sm';
    input.min = min;
    input.max = max;
    input.value = value;

    wrap.appendChild(lbl);
    wrap.appendChild(input);
    return { wrap, input };
}

function emitChange() {
    if (onChangeCallback) onChangeCallback();
}

function refreshControls(widgetName) {
    const schema = BUILDER_SCHEMA[widgetName];
    if (!schema) return;

    document.querySelectorAll('.tb-control').forEach(row => {
        const key = row.dataset.controlKey;
        if (!key) return;
        const val = currentValues[key];
        if (val === undefined) return;

        const customPickerContainer = row.querySelector('.custom-picker-container');
        if (customPickerContainer) {
            const btn = customPickerContainer.querySelector('.custom-picker-btn');
            const dropdown = customPickerContainer.querySelector('.custom-picker-dropdown');
            if (btn && dropdown) {
                let newLabel = String(val);
                dropdown.querySelectorAll('.custom-picker-option').forEach(opt => {
                    opt.classList.remove('selected');
                    if (opt.dataset.value === String(val)) {
                        opt.classList.add('selected');
                        newLabel = opt.textContent;
                    }
                });
                btn.textContent = newLabel;
                if (btn.style.fontFamily) {
                    btn.style.fontFamily = String(val);
                }
            }
        }

        const inputs = row.querySelectorAll('input, select');
        inputs.forEach(input => {
            if (input.type === 'checkbox') {
                input.checked = !!val;
            } else if (input.type === 'range' || input.type === 'number') {
                input.value = typeof val === 'number' ? val : parseFloat(val) || 0;
            } else if (input.type === 'color') {
                input.value = toHex6(String(val));
            } else if (input.tagName === 'SELECT') {
                input.value = String(val);
            } else if (input.type === 'text') {
                input.value = String(val);
            }
        });
    });
}

function toHex6(val) {
    if (!val || val === 'none') return '#000000';
    if (val.startsWith('#') && val.length >= 7) return val.slice(0, 7);
    if (val.startsWith('#') && val.length === 4) {
        return '#' + val[1] + val[1] + val[2] + val[2] + val[3] + val[3];
    }
    if (val.startsWith('rgb')) {
        const m = val.match(/(\d+)/g);
        if (m) return rgbToHex(+m[0], +m[1], +m[2]);
    }
    return '#000000';
}

function rgbToHex(r, g, b) {
    return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

function parseRgba(val) {
    if (!val || val === 'none') return { r: 0, g: 0, b: 0, a: 1 };
    const m = val.match(/([\d.]+)/g);
    if (m && m.length >= 3) {
        return { r: +m[0], g: +m[1], b: +m[2], a: m[3] !== undefined ? +m[3] : 1 };
    }
    if (val.startsWith('#')) {
        const hex = toHex6(val);
        return {
            r: parseInt(hex.slice(1, 3), 16),
            g: parseInt(hex.slice(3, 5), 16),
            b: parseInt(hex.slice(5, 7), 16),
            a: 1
        };
    }
    return { r: 0, g: 0, b: 0, a: 1 };
}

function parseGradient(val) {
    if (!val) return { angle: 90, color1: '#ff00cc', color2: '#333399' };
    const angleMatch = val.match(/(\d+)deg/);
    const colors = val.match(/#[0-9a-fA-F]{3,8}/g) || [];
    return {
        angle: angleMatch ? parseInt(angleMatch[1]) : 90,
        color1: colors[0] || '#ff00cc',
        color2: colors[1] || '#333399'
    };
}

function parseShadow(val) {
    if (!val || val === 'none') return { x: 0, y: 2, blur: 4, spread: 0, color: '#000000' };
    const parts = val.match(/([-\d.]+)px/g) || [];
    const colorMatch = val.match(/(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))/);
    return {
        x: parts[0] ? parseInt(parts[0]) : 0,
        y: parts[1] ? parseInt(parts[1]) : 2,
        blur: parts[2] ? parseInt(parts[2]) : 4,
        spread: parts[3] ? parseInt(parts[3]) : 0,
        color: colorMatch ? colorMatch[1] : '#000000'
    };
}

function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getKeyframes(name) {
    const keyframesMap = {
        slideInBottom: `@keyframes slideInBottom {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
}\n\n`,
        slideInTop: `@keyframes slideInTop {
    from { opacity: 0; transform: translateY(-20px); }
    to { opacity: 1; transform: translateY(0); }
}\n\n`,
        slideInLeft: `@keyframes slideInLeft {
    from { opacity: 0; transform: translateX(-30px); }
    to { opacity: 1; transform: translateX(0); }
}\n\n`,
        slideInRight: `@keyframes slideInRight {
    from { opacity: 0; transform: translateX(30px); }
    to { opacity: 1; transform: translateX(0); }
}\n\n`,
        fadeIn: `@keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
}\n\n`,
        zoomIn: `@keyframes zoomIn {
    from { opacity: 0; transform: scale(0.8); }
    to { opacity: 1; transform: scale(1); }
}\n\n`,
        bounceIn: `@keyframes bounceIn {
    0% { opacity: 0; transform: scale(0.3); }
    50% { opacity: 1; transform: scale(1.05); }
    70% { transform: scale(0.95); }
    100% { transform: scale(1); }
}\n\n`
    };
    return keyframesMap[name] || '';
}
