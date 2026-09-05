#!/usr/bin/env node
/**
 * Dependency-free project check. Run with `npm test`.
 *
 *  1. Syntax-checks every JavaScript file in the project.
 *  2. Keeps the three IPC allowlists in sync. preload.js gates every channel,
 *     so a handler added in main/ without its allowlist entry fails only at
 *     runtime, in the one code path nobody clicks during development.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', '.github', 'portable_data', 'scripts']);

const problems = [];
function fail(msg) { problems.push(msg); }

function walk(dir, out = []) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) {
            if (SKIP_DIRS.has(entry.name)) continue;
            walk(path.join(dir, entry.name), out);
        } else {
            out.push(path.join(dir, entry.name));
        }
    }
    return out;
}

const allFiles = walk(ROOT);
const jsFiles = allFiles.filter(f => f.endsWith('.js'));
const htmlFiles = allFiles.filter(f => f.endsWith('.html'));

// --- 1. syntax ------------------------------------------------------------
let checked = 0;
for (const file of jsFiles) {
    const res = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (res.status !== 0) {
        fail(`Syntax error in ${path.relative(ROOT, file)}\n${(res.stderr || '').trim()}`);
    }
    checked++;
}
console.log(`  syntax: ${checked} file(s) checked`);

// --- 2. IPC allowlists ----------------------------------------------------
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const matchAll = (src, re) => [...src.matchAll(re)].map(m => m[1]);

const preload = read('preload.js');

function allowlist(name) {
    const block = preload.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\];`));
    if (!block) {
        fail(`preload.js: could not find ${name}`);
        return new Set();
    }
    return new Set(matchAll(block[1], /'([^']+)'/g));
}

const allowedInvoke = allowlist('ALLOWED_INVOKE_CHANNELS');
const allowedSend = allowlist('ALLOWED_SEND_CHANNELS');
const allowedOn = allowlist('ALLOWED_ON_CHANNELS');

// Channels the main process actually implements / emits.
const mainSources = jsFiles
    .filter(f => f.includes(`${path.sep}main${path.sep}`) || path.basename(f) === 'main.js')
    .map(f => fs.readFileSync(f, 'utf8'))
    .join('\n');

const handled = new Set([
    ...matchAll(mainSources, /ipcMain\.handle\(\s*'([^']+)'/g),
    ...matchAll(mainSources, /ipcMain\.on\(\s*'([^']+)'/g)
]);
const emitted = new Set([
    ...matchAll(mainSources, /webContents\.send\(\s*'([^']+)'/g),
    // main.js funnels most events through a safeSend() wrapper.
    ...matchAll(mainSources, /safeSend\(\s*'([^']+)'/g)
]);

// Channels the renderer actually uses.
const rendererSources = [
    ...jsFiles.filter(f => f.includes(`${path.sep}renderer${path.sep}`)),
    ...htmlFiles
].map(f => fs.readFileSync(f, 'utf8')).join('\n');

const invoked = new Set(matchAll(rendererSources, /invoke\(\s*'([^']+)'/g));
const listened = new Set(matchAll(rendererSources, /(?:api|window\.api)\.on\(\s*'([^']+)'/g));
const sent = new Set(matchAll(rendererSources, /(?:api|window\.api)\.send\(\s*'([^']+)'/g));

for (const ch of invoked) {
    if (!allowedInvoke.has(ch)) fail(`IPC: renderer invokes '${ch}' but preload ALLOWED_INVOKE_CHANNELS does not list it`);
    else if (!handled.has(ch)) fail(`IPC: '${ch}' is invoked and allowed, but no ipcMain.handle registers it`);
}
for (const ch of sent) {
    if (!allowedSend.has(ch)) fail(`IPC: renderer sends '${ch}' but preload ALLOWED_SEND_CHANNELS does not list it`);
}
for (const ch of listened) {
    if (!allowedOn.has(ch)) fail(`IPC: renderer listens to '${ch}' but preload ALLOWED_ON_CHANNELS does not list it`);
    else if (!emitted.has(ch)) fail(`IPC: '${ch}' is listened to, but the main process never sends it`);
}
for (const ch of allowedInvoke) {
    if (!handled.has(ch)) fail(`IPC: preload allows invoke '${ch}' but nothing handles it (dead entry)`);
}

console.log(`  ipc:    ${invoked.size} invoke, ${listened.size} listener, ${sent.size} send channel(s) verified`);

// --- report ---------------------------------------------------------------
if (problems.length) {
    console.error(`\n${problems.length} problem(s):\n`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
}
console.log('\nAll checks passed.');
