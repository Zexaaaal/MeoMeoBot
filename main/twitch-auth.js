const DEFAULT_CALLBACK_PORT = 8087;

function getRedirectUri(port) {
    // Twitch compares this string literally, so it must match the value
    // registered in the dev console exactly. `localhost` (not 127.0.0.1) is
    // the host Twitch allows over plain http.
    return `http://localhost:${port || DEFAULT_CALLBACK_PORT}/twitch/callback`;
}

/**
 * Builds the Twitch authorize URL for the implicit flow. Implicit is used
 * rather than authorization_code because the packaged app ships no client
 * secret.
 *
 * Returns { url, redirectUri } or { error }.
 */
function buildAuthUrl(bot, port) {
    const config = bot.getConfig();
    const clientId = config.twitchClientId || process.env.TWITCH_CLIENT_ID || '';

    if (!clientId) {
        return { error: 'Renseigne le Client ID Twitch avant de te connecter.' };
    }
    if (!port) {
        return { error: 'Le serveur widget n\'est pas démarré.' };
    }

    const redirectUri = getRedirectUri(port);
    const url = 'https://id.twitch.tv/oauth2/authorize'
        + '?response_type=token'
        + `&client_id=${encodeURIComponent(clientId)}`
        + `&redirect_uri=${encodeURIComponent(redirectUri)}`
        + `&scope=${encodeURIComponent(bot.getRequiredScopes().join(' '))}`
        + '&force_verify=true';

    return { url, redirectUri };
}

module.exports = { buildAuthUrl, getRedirectUri, DEFAULT_CALLBACK_PORT };
