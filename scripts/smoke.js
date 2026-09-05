// Behavioural regression tests for the reconnect, OBS and rewards logic.
process.chdir(require('path').join(__dirname, '..'));
const assert = require('assert');

let pass = 0;
function ok(name, fn) {
    try { fn(); console.log('  ok   ' + name); pass++; }
    catch (e) { console.error('  FAIL ' + name + ': ' + e.message); process.exitCode = 1; }
}

const ObsControl = require('../main/obs-control.js');
const EventSubHandler = require('../main/EventSubHandler.js');

// --- obs-control URL matching --------------------------------------------
const obs = new ObsControl({ getConfig: () => ({}) }, (w) => ({ chat: 8087, goals: 8093 }[w] || null));

ok('matches a loopback widget URL', () => {
    const r = obs.parseWidgetUrl('http://127.0.0.1:8087/widget/chat');
    assert.strictEqual(r.widget, 'chat');
    assert.strictEqual(r.port, 8087);
});
ok('matches localhost too', () => {
    assert.strictEqual(obs.parseWidgetUrl('http://localhost:8091/widget/daily-subs').widget, 'daily-subs');
});
ok('matches the /go gateway', () => {
    assert.strictEqual(obs.parseWidgetUrl('http://127.0.0.1:8087/go/spotify').widget, 'spotify');
});
ok('keeps the query string usable for goals', () => {
    const r = obs.parseWidgetUrl('http://127.0.0.1:8093/widget/goals?id=abc');
    assert.strictEqual(r.widget, 'goals');
    r.url.port = '9999';
    assert.strictEqual(r.url.toString(), 'http://127.0.0.1:9999/widget/goals?id=abc');
});
ok('ignores non-loopback sources', () => {
    assert.strictEqual(obs.parseWidgetUrl('http://192.168.1.20:8087/widget/chat'), null);
});
ok('ignores unrelated browser sources', () => {
    assert.strictEqual(obs.parseWidgetUrl('https://streamelements.com/overlay/x'), null);
    assert.strictEqual(obs.parseWidgetUrl('not a url'), null);
    assert.strictEqual(obs.parseWidgetUrl(''), null);
});

// --- eventsub keepalive watchdog -----------------------------------------
function makeBot() {
    const EventEmitter = require('events');
    const bot = new EventEmitter();
    bot.userId = '123';
    bot.clientId = 'cid';
    bot.getConfig = () => ({ token: 'oauth:abc' });
    bot.getWidgetConfig = () => ({});
    return bot;
}

ok('welcome adopts the server keepalive timeout', () => {
    const h = new EventSubHandler(makeBot());
    h.subscribeToAllEvents = async () => { };
    const fakeWs = {};
    h.ws = fakeWs;
    h.handleMessage({
        metadata: { message_type: 'session_welcome' },
        payload: { session: { id: 'sess1', keepalive_timeout_seconds: 30 } }
    }, fakeWs);
    assert.strictEqual(h.keepaliveMs, 30000);
    assert.strictEqual(h.sessionId, 'sess1');
    assert.ok(h.keepaliveTimer, 'watchdog should be armed');
    h.close();
});

ok('watchdog fires a reconnect when traffic stops', (() => {
    return () => {
        const h = new EventSubHandler(makeBot());
        h.subscribeToAllEvents = async () => { };
        let reconnected = false;
        h.scheduleReconnect = () => { reconnected = true; };
        h.keepaliveMs = 0; // expire immediately
        h.armKeepalive();
        const t = h.keepaliveTimer;
        assert.ok(t);
        // Execute the pending timer callback directly.
        t._onTimeout();
        assert.strictEqual(reconnected, true, 'forceReconnect should have run');
        h.close();
    };
})());

ok('reconnect delay backs off and is capped', () => {
    const h = new EventSubHandler(makeBot());
    const delays = [];
    const realSetTimeout = global.setTimeout;
    global.setTimeout = (fn, ms) => { delays.push(ms); return realSetTimeout(() => { }, 0); };
    for (let i = 0; i < 10; i++) h.scheduleReconnect();
    global.setTimeout = realSetTimeout;
    assert.strictEqual(delays[0], 1000);
    assert.strictEqual(delays[1], 2000);
    assert.ok(delays[delays.length - 1] <= 60000, 'delay must be capped at 60s');
    h.close();
});

ok('close() stops reconnecting', () => {
    const h = new EventSubHandler(makeBot());
    h.closing = false;
    h.close();
    h.scheduleReconnect();
    assert.strictEqual(h.reconnectTimer, null, 'no timer after close');
});

ok('session_reconnect keeps the old socket until the new one is welcomed', () => {
    const h = new EventSubHandler(makeBot());
    h.subscribeToAllEvents = async () => { };
    const oldWs = { readyState: 99, removeAllListeners() { }, on() { }, terminate() { this.killed = true; } };
    h.ws = oldWs;

    let openedUrl = null;
    h.openSocket = (url, isReplacement) => { openedUrl = url; h.pendingWs = { tag: 'new' }; };

    h.handleMessage({
        metadata: { message_type: 'session_reconnect' },
        payload: { session: { reconnect_url: 'wss://new.example/ws' } }
    }, oldWs);

    assert.strictEqual(openedUrl, 'wss://new.example/ws');
    assert.strictEqual(h.ws, oldWs, 'old socket must still be the active one');
    assert.ok(!oldWs.killed, 'old socket must not be closed yet');
    h.close();
});

// --- chat mapper: EventSub payload -> the widgets' existing contract -----
const chatMapper = require('../main/chat-mapper');

// The widgets slice the raw text with these offsets, so replay that here.
function renderWithEmotes(text, emotes) {
    const parts = [];
    Object.keys(emotes).forEach(id => emotes[id].forEach(r => parts.push({ id, ...r })));
    parts.sort((a, b) => a.start - b.start);
    let out = '';
    let cursor = 0;
    for (const p of parts) {
        out += text.slice(cursor, p.start);
        out += '<' + p.id + ':' + text.slice(p.start, p.end + 1) + '>';
        cursor = p.end + 1;
    }
    return out + text.slice(cursor);
}

const sampleEvent = {
    broadcaster_user_id: '111',
    chatter_user_id: '222',
    chatter_user_login: 'someviewer',
    chatter_user_name: 'SomeViewer',
    message_id: 'msg-1',
    color: '#00FF7F',
    badges: [
        { set_id: 'moderator', id: '1', info: '' },
        { set_id: 'subscriber', id: '12', info: '12' }
    ],
    message: {
        text: 'hey Kappa there',
        fragments: [
            { type: 'text', text: 'hey ' },
            { type: 'emote', text: 'Kappa', emote: { id: '25' } },
            { type: 'text', text: ' there' }
        ]
    }
};

ok('badges map to the IRC-style raw string the widgets parse', () => {
    assert.strictEqual(chatMapper.badgesToRaw(sampleEvent.badges), 'moderator/1,subscriber/12');
    assert.deepStrictEqual(chatMapper.badgesToObj(sampleEvent.badges), { moderator: '1', subscriber: '12' });
});

ok('emote offsets land on the right substring', () => {
    const msg = chatMapper.toWidgetMessage(sampleEvent);
    assert.deepStrictEqual(msg.emotes, { '25': [{ start: 4, end: 8 }] });
    assert.strictEqual(msg.text.slice(4, 9), 'Kappa');
    assert.strictEqual(renderWithEmotes(msg.text, msg.emotes), 'hey <25:Kappa> there');
});

ok('offsets stay correct after an emoji (the old IRC offset bug)', () => {
    // A single emoji is 2 UTF-16 units but 1 code point. IRC counted code
    // points while the widget slices UTF-16, so emotes used to render shifted.
    const event = {
        ...sampleEvent,
        message: {
            text: 'gg 🎉 Kappa!',
            fragments: [
                { type: 'text', text: 'gg 🎉 ' },
                { type: 'emote', text: 'Kappa', emote: { id: '25' } },
                { type: 'text', text: '!' }
            ]
        }
    };
    const msg = chatMapper.toWidgetMessage(event);
    const range = msg.emotes['25'][0];
    assert.strictEqual(msg.text.slice(range.start, range.end + 1), 'Kappa');
    assert.strictEqual(renderWithEmotes(msg.text, msg.emotes), 'gg 🎉 <25:Kappa>!');
});

ok('repeated emotes each get their own range', () => {
    const event = {
        ...sampleEvent,
        message: {
            text: 'Kappa Kappa',
            fragments: [
                { type: 'emote', text: 'Kappa', emote: { id: '25' } },
                { type: 'text', text: ' ' },
                { type: 'emote', text: 'Kappa', emote: { id: '25' } }
            ]
        }
    };
    const msg = chatMapper.toWidgetMessage(event);
    assert.deepStrictEqual(msg.emotes['25'], [{ start: 0, end: 4 }, { start: 6, end: 10 }]);
});

ok('a message with no emotes yields an empty map', () => {
    const event = { ...sampleEvent, message: { text: 'plain', fragments: [{ type: 'text', text: 'plain' }] } };
    assert.deepStrictEqual(chatMapper.toWidgetMessage(event).emotes, {});
});

ok('widget payload keeps the fields the widgets read', () => {
    const msg = chatMapper.toWidgetMessage(sampleEvent);
    assert.strictEqual(msg.type, 'chat');
    assert.strictEqual(msg.platform, 'twitch');
    assert.strictEqual(msg.username, 'someviewer');
    assert.strictEqual(msg.displayName, 'SomeViewer');
    assert.strictEqual(msg.id, 'msg-1');
    assert.strictEqual(msg.color, '#00FF7F');
    assert.strictEqual(msg.roomId, '111');
    assert.strictEqual(msg.isWidgetHidden, false);
});

ok('channel-point highlighted messages stay hidden from the widget', () => {
    const msg = chatMapper.toWidgetMessage({ ...sampleEvent, channel_points_custom_reward_id: 'r1' });
    assert.strictEqual(msg.isWidgetHidden, true);
});

ok('tags keep isAuthorized() and the command handler working', () => {
    const tags = chatMapper.toTags(sampleEvent);
    assert.strictEqual(tags.username, 'someviewer');
    assert.strictEqual(tags['room-id'], '111');
    assert.strictEqual(tags.id, 'msg-1');
    assert.strictEqual(tags.mod, true);
    assert.strictEqual(tags['user-type'], 'mod');

    const broadcaster = chatMapper.toTags({
        ...sampleEvent,
        badges: [{ set_id: 'broadcaster', id: '1' }]
    });
    assert.strictEqual(broadcaster.badges.broadcaster, '1');
    assert.strictEqual(broadcaster.mod, false);
});

ok('mapper survives malformed payloads', () => {
    assert.deepStrictEqual(chatMapper.fragmentsToEmotes(undefined), {});
    assert.strictEqual(chatMapper.badgesToRaw(undefined), '');
    const msg = chatMapper.toWidgetMessage({});
    assert.strictEqual(msg.text, '');
    assert.strictEqual(msg.color, '#FFFFFF');
});

ok('only the notice types the widget showed are forwarded', () => {
    assert.strictEqual(chatMapper.shouldForwardNotice('announcement'), true);
    assert.strictEqual(chatMapper.shouldForwardNotice('viewer_milestone'), true);
    assert.strictEqual(chatMapper.shouldForwardNotice('sub'), false);
    assert.strictEqual(chatMapper.shouldForwardNotice('raid'), false);
});

// --- logger: polling noise must stay out of a normal run -----------------
const logger = require('../main/logger');

function countedLog(fn) {
    const real = console.log;
    let lines = 0;
    console.log = () => { lines++; };
    try { fn(); } finally { console.log = real; }
    return lines;
}

ok('debug logs stay silent without --dev', () => {
    const tagged = logger.tagged('Test');
    assert.strictEqual(typeof tagged.debug, 'function', 'debug() must exist');
    const lines = countedLog(() => tagged.debug('SPOTIFY_TOKEN_VALID', { expiresIn: 1 }));
    assert.strictEqual(lines, 0, 'debug() must not print in a normal run');
});

ok('info logs still print', () => {
    const tagged = logger.tagged('Test');
    const lines = countedLog(() => tagged.info('SPOTIFY_AUTH_SUCCESS'));
    assert.strictEqual(lines, 1, 'info() must still print');
});

ok('the 5s Spotify poll no longer logs at info level', () => {
    const src = require('fs').readFileSync('server/spotifyWidgetServer.js', 'utf8');
    for (const key of ['SPOTIFY_TOKEN_VALID', 'SPOTIFY_API_RESPONSE', 'SPOTIFY_204_NO_CONTENT']) {
        assert.ok(!new RegExp("log\\.info\\('" + key + "'").test(src),
            key + ' must not be logged at info level');
    }
});

// --- rewards: cooldown payload shape -------------------------------------
const cp = require('fs').readFileSync('renderer/channel_points.js', 'utf8');
ok('no-cooldown rewards never send global_cooldown_seconds: 0', () => {
    assert.ok(!/global_cooldown_seconds = 0/.test(cp), 'found a literal 0 cooldown assignment');
    assert.ok(/if \(cooldown > 0\) \{\s*\r?\n\s*data\.global_cooldown_seconds = cooldown;/.test(cp));
});

console.log(`\n${pass} assertion group(s) passed`);
