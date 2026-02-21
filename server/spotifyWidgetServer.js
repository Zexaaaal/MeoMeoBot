const BaseWidgetServer = require('./BaseWidgetServer');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const log = require('../main/logger').tagged('Spotify');

class SpotifyWidgetServer extends BaseWidgetServer {
    constructor(bot, { defaultPort = 8090, scopes = 'user-read-currently-playing user-read-playback-state', pollInterval = 5000 } = {}) {
        super(bot, defaultPort, 'spotify');
        this.scopes = scopes;
        this.pollInterval = pollInterval;
        this.spotifyAuthState = null;
        this.spotifyPollTimer = null;
        this.currentSpotifyTrack = null;
    }

    async start() {
        this.currentSpotifyTrack = this.bot.getWidgetConfig('spotify') || null;

        await super.start();
        this.startPolling();
        return this.port;
    }

    stop() {
        super.stop();
        this.stopPolling();
    }

    transformHtml(html) {
        const htmlWithScript = super.transformHtml(html);
        const spotifyConfig = this.bot.getWidgetConfig('spotify') || {};
        const initialConfig = {
            trackTitle: spotifyConfig.trackTitle || 'Titre du morceau',
            trackArtist: spotifyConfig.trackArtist || 'Artiste',
            trackAlbum: spotifyConfig.trackAlbum || 'Album',
            coverUrl: spotifyConfig.coverUrl || '',
            isPlaying: spotifyConfig.isPlaying === undefined ? false : !!spotifyConfig.isPlaying
        };

        return htmlWithScript.replace('const INITIAL_CONFIG = {};', `const INITIAL_CONFIG = ${JSON.stringify(initialConfig)};`);
    }

    handleCustomRoutes(req, res) {
        if (req.url.startsWith('/auth/spotify/login')) {
            this.handleLogin(req, res);
            return true;
        }
        if (req.url.startsWith('/auth/spotify/callback')) {
            this.handleCallback(req, res);
            return true;
        }
        return false;
    }

    onConnection(ws) {
        const config = this.currentSpotifyTrack || this.bot.getWidgetConfig('spotify') || { isPlaying: false };
        ws.send(JSON.stringify({
            type: 'config-update',
            widget: 'spotify',
            config: config
        }));
        this.fetchCurrentTrack().then(trackData => {
            if (trackData) this.updateTrackConfig(trackData);
        }).catch(err => log.error('SPOTIFY_INIT_ERROR', err));
    }



    getCredentials() {
        const cfg = this.bot.getConfig ? this.bot.getConfig() : {};
        return {
            clientId: process.env.SPOTIFY_CLIENT_ID || cfg.spotifyClientId || '',
            clientSecret: process.env.SPOTIFY_CLIENT_SECRET || cfg.spotifyClientSecret || ''
        };
    }

    getStoredTokens() {
        const cfg = this.bot.getConfig ? this.bot.getConfig() : {};
        return {
            accessToken: cfg.spotifyAccessToken || '',
            refreshToken: cfg.spotifyRefreshToken || '',
            expiry: cfg.spotifyTokenExpiry || 0
        };
    }

    storeTokens({ accessToken, refreshToken, expiresIn }) {
        const expiry = Date.now() + (expiresIn * 1000) - 60000;
        this.bot.updateConfig({
            spotifyAccessToken: accessToken || '',
            spotifyRefreshToken: refreshToken || this.getStoredTokens().refreshToken || '',
            spotifyTokenExpiry: expiry
        });
    }

    getRedirectUri() {

        return `http://127.0.0.1:${this.port}/auth/spotify/callback`;
    }

    getLoginUrl() {
        return `http://127.0.0.1:${this.port || this.defaultPort}/auth/spotify/login`;
    }

    handleLogin(req, res) {
        const creds = this.getCredentials();
        if (!creds.clientId || !creds.clientSecret) {
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            return res.end('Spotify Client ID/Secret manquants.');
        }
        const state = crypto.randomBytes(16).toString('hex');
        this.spotifyAuthState = state;
        const redirectUri = this.getRedirectUri();
        const authUrl = `https://accounts.spotify.com/authorize?response_type=code&client_id=${encodeURIComponent(creds.clientId)}&scope=${encodeURIComponent(this.scopes)}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;
        res.writeHead(302, { Location: authUrl });
        res.end();
    }

    async handleCallback(req, res) {
        const creds = this.getCredentials();
        const urlObj = new URL(req.url, this.getRedirectUri());
        const code = urlObj.searchParams.get('code');
        const state = urlObj.searchParams.get('state');

        log.info('SPOTIFY_CALLBACK', { state });
        if (!code || !state || state !== this.spotifyAuthState) {
            log.error('SPOTIFY_INVALID_STATE', { received: state, expected: this.spotifyAuthState });
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            return res.end('Etat invalide ou code manquant.');
        }
        this.spotifyAuthState = null;

        try {
            const redirectUri = this.getRedirectUri();
            const tokenResp = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': 'Basic ' + Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')
                },
                body: new URLSearchParams({
                    grant_type: 'authorization_code',
                    code,
                    redirect_uri: redirectUri
                })
            });
            if (!tokenResp.ok) throw new Error(`HTTP ${tokenResp.status}`);
            const tokenData = await tokenResp.json();
            this.storeTokens({
                accessToken: tokenData.access_token,
                refreshToken: tokenData.refresh_token,
                expiresIn: tokenData.expires_in || 3600
            });
            log.info('SPOTIFY_AUTH_SUCCESS');
            this.startPolling();
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
                <html>
                    <body style="background: #121212; color: white; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0;">
                        <h2 style="color: #1DB954;">Connexion Spotify réussie !</h2>
                        <p>Cette fenêtre se fermera automatiquement dans 3 secondes...</p>
                        <script>
                            setTimeout(() => { window.close(); }, 3000);
                        </script>
                    </body>
                </html>
            `);
        } catch (err) {
            log.error('SPOTIFY_AUTH_ERROR', err);
            res.writeHead(500, { 'Content-Type': 'text/plain' });
            res.end('Erreur lors de la connexion Spotify.');
        }
    }

    async ensureAccessToken() {
        const creds = this.getCredentials();
        const tokens = this.getStoredTokens();
        if (!creds.clientId || !creds.clientSecret || !tokens.refreshToken) return null;
        if (tokens.accessToken && tokens.expiry && tokens.expiry > Date.now()) {
            return tokens.accessToken;
        }

        const body = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: tokens.refreshToken
        });

        const resp = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64')
            },
            body
        });
        if (!resp.ok) throw new Error(`Spotify refresh failed: ${resp.status}`);
        const data = await resp.json();
        this.storeTokens({
            accessToken: data.access_token,
            refreshToken: data.refresh_token || tokens.refreshToken,
            expiresIn: data.expires_in || 3600
        });
        return this.getStoredTokens().accessToken;
    }

    async fetchCurrentTrack() {
        let token;
        try {
            token = await this.ensureAccessToken();
        } catch (err) {
            log.error('SPOTIFY_REFRESH_ERROR', err.message);
            return { isPlaying: false, trackTitle: '', trackArtist: '', trackAlbum: '', coverUrl: '' };
        }

        if (!token) {
            log.debug('[SPOTIFY] No access token available (not logged in?)');
            return { isPlaying: false, trackTitle: '', trackArtist: '', trackAlbum: '', coverUrl: '' };
        }

        try {
            const resp = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
                headers: { Authorization: `Bearer ${token}` }
            });

            if (resp.status === 204) return { isPlaying: false, trackTitle: '', trackArtist: '', trackAlbum: '', coverUrl: '' };

            if (resp.status === 401) {
                log.warn('SPOTIFY_TOKEN_EXPIRED');
                this.bot.updateConfig({ spotifyAccessToken: '' });
                return { isPlaying: false, trackTitle: '', trackArtist: '', trackAlbum: '', coverUrl: '' };
            }

            if (!resp.ok) {
                log.warn('SPOTIFY_FETCH_FAILED', { status: resp.status });
                return { isPlaying: false, trackTitle: '', trackArtist: '', trackAlbum: '', coverUrl: '' };
            }

            const data = await resp.json();
            if (!data || !data.item) return { isPlaying: false, trackTitle: '', trackArtist: '', trackAlbum: '', coverUrl: '' };

            const track = data.item;
            return {
                isPlaying: data.is_playing !== false,
                trackTitle: track.name || 'Titre du morceau',
                trackArtist: (track.artists || []).map(a => a.name).join(', ') || 'Artiste',
                trackAlbum: (track.album && track.album.name) || 'Album',
                coverUrl: (track.album && track.album.images && track.album.images[0] && track.album.images[0].url) || ''
            };
        } catch (err) {
            log.error('SPOTIFY_FETCH_ERROR', err.message);
            return { isPlaying: false, trackTitle: '', trackArtist: '', trackAlbum: '', coverUrl: '' };
        }
    }

    updateTrackConfig(trackData) {
        if (!trackData) return;
        const current = this.bot.getWidgetConfig('spotify') || {};
        const next = { ...current, ...trackData };
        this.bot.saveWidgetConfig('spotify', next);
        this.currentSpotifyTrack = next;
        this.broadcastConfig(next);
    }

    startPolling() {
        if (this.spotifyPollTimer) clearInterval(this.spotifyPollTimer);
        const tokens = this.getStoredTokens();
        if (!tokens.refreshToken && !tokens.accessToken) return;

        const pollOnce = async () => {
            if (!this.hasActiveClients()) return;
            try {
                const track = await this.fetchCurrentTrack();
                if (track) {
                    this.updateTrackConfig(track);
                } else {
                    log.warn('SPOTIFY_NO_TRACK');
                }
            } catch (err) {
                log.warn('SPOTIFY_POLLING_ERROR', err.message);
            }
        };
        pollOnce();
        this.spotifyPollTimer = setInterval(pollOnce, this.pollInterval);
    }

    stopPolling() {
        if (this.spotifyPollTimer) clearInterval(this.spotifyPollTimer);
    }

    broadcastConfig(config) {
        this.broadcast({ type: 'config-update', widget: 'spotify', config });
    }
}

function createSpotifyWidgetServer(bot, options = {}) {
    return new SpotifyWidgetServer(bot, options);
}

module.exports = { createSpotifyWidgetServer };
