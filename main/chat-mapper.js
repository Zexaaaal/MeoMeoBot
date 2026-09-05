/**
 * Translates EventSub `channel.chat.*` payloads into the shapes the rest of
 * the app already speaks, so migrating off IRC touches no widget code.
 *
 * Two targets:
 *   - toWidgetMessage(): what the chat/dock/emote-wall widgets consume.
 *   - toTags(): the IRC-style tag object bot.js uses internally for commands,
 *     moderation and isAuthorized().
 */

// "moderator/1,subscriber/12" - the format parseBadgesRaw() in the widgets
// already expects.
function badgesToRaw(badges) {
    if (!Array.isArray(badges)) return '';
    return badges
        .filter(b => b && b.set_id)
        .map(b => `${b.set_id}/${b.id}`)
        .join(',');
}

function badgesToObj(badges) {
    const obj = {};
    if (!Array.isArray(badges)) return obj;
    for (const b of badges) {
        if (b && b.set_id) obj[b.set_id] = String(b.id);
    }
    return obj;
}

function hasBadge(badges, setId) {
    return Array.isArray(badges) && badges.some(b => b && b.set_id === setId);
}

/**
 * Turns the fragment array into the widgets' emote map.
 *
 * IRC gave code-point offsets while the widgets slice with UTF-16 indices, so
 * any message containing an astral character (most emoji) rendered its emotes
 * at the wrong place. Walking the fragments lets us emit real UTF-16 offsets
 * and that class of bug disappears.
 *
 * Emitted as {start, end} objects, which normalizeEmotes() accepts directly.
 */
function fragmentsToEmotes(fragments) {
    const emotes = {};
    if (!Array.isArray(fragments)) return emotes;

    let cursor = 0;
    for (const fragment of fragments) {
        const text = (fragment && fragment.text) || '';
        const length = text.length; // UTF-16 units, matching String.prototype.slice

        if (fragment && fragment.type === 'emote' && fragment.emote && fragment.emote.id) {
            const id = fragment.emote.id;
            if (!emotes[id]) emotes[id] = [];
            // `end` is inclusive, as in the IRC tag format.
            emotes[id].push({ start: cursor, end: cursor + length - 1 });
        }

        cursor += length;
    }
    return emotes;
}

function toWidgetMessage(event, extra = {}) {
    const message = event.message || {};
    return {
        type: 'chat',
        platform: 'twitch',
        username: event.chatter_user_login,
        displayName: event.chatter_user_name || event.chatter_user_login,
        text: message.text || '',
        id: event.message_id,
        color: event.color || '#FFFFFF',
        badgesRaw: badgesToRaw(event.badges),
        badgesObj: badgesToObj(event.badges),
        emotes: fragmentsToEmotes(message.fragments),
        roomId: event.broadcaster_user_id || null,
        // Channel-point-highlighted messages stay out of the widget, as before.
        isWidgetHidden: !!event.channel_points_custom_reward_id,
        ...extra
    };
}

function toTags(event) {
    const badges = event.badges;
    const isMod = hasBadge(badges, 'moderator');
    return {
        'room-id': event.broadcaster_user_id || null,
        'user-id': event.chatter_user_id || null,
        id: event.message_id,
        username: event.chatter_user_login,
        'display-name': event.chatter_user_name || event.chatter_user_login,
        color: event.color || '',
        badges: badgesToObj(badges),
        'badges-raw': badgesToRaw(badges),
        mod: isMod,
        'user-type': isMod ? 'mod' : '',
        subscriber: hasBadge(badges, 'subscriber'),
        'custom-reward-id': event.channel_points_custom_reward_id || undefined
    };
}

/**
 * channel.chat.notification replaces the IRC USERNOTICE. Only the notice types
 * the chat widget used to surface are forwarded.
 */
const FORWARDED_NOTICE_TYPES = new Set([
    'announcement',
    'shared_chat_announcement',
    'viewer_milestone'
]);

function shouldForwardNotice(noticeType) {
    return FORWARDED_NOTICE_TYPES.has(noticeType);
}

function noticeToWidgetMessage(event) {
    const message = event.message || {};
    return {
        type: 'chat',
        platform: 'twitch',
        username: event.chatter_user_login,
        displayName: event.chatter_user_name || event.chatter_user_login,
        text: message.text || event.system_message || '',
        id: event.message_id,
        color: event.color || '#FFFFFF',
        badgesRaw: badgesToRaw(event.badges),
        badgesObj: badgesToObj(event.badges),
        emotes: fragmentsToEmotes(message.fragments),
        roomId: event.broadcaster_user_id || null,
        isWidgetHidden: false
    };
}

module.exports = {
    badgesToRaw,
    badgesToObj,
    hasBadge,
    fragmentsToEmotes,
    toWidgetMessage,
    toTags,
    shouldForwardNotice,
    noticeToWidgetMessage,
    FORWARDED_NOTICE_TYPES
};
