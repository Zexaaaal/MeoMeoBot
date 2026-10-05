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
        this.localCoverCache = new Map();
        this.spotifyApiFailCount = 0;
        this.fallbackToWindow = false;
    }

    async start() {
        this.currentSpotifyTrack = this.bot.getWidgetConfig('spotify') || null;
        this.spotifyApiFailCount = 0;
        this.fallbackToWindow = false;

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
        log.info('SPOTIFY_CLIENT_CONNECTED');
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
        const isDev = !require('electron').app.isPackaged;
        if (isDev) {
            return {
                clientId: process.env.SPOTIFY_CLIENT_ID || cfg.spotifyClientId || '',
                clientSecret: process.env.SPOTIFY_CLIENT_SECRET || cfg.spotifyClientSecret || ''
            };
        }
        return {
            clientId: cfg.spotifyClientId || '',
            clientSecret: cfg.spotifyClientSecret || ''
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
            this.spotifyApiFailCount = 0;
            this.fallbackToWindow = false;
            log.info('SPOTIFY_AUTH_SUCCESS');
            this.bot.emit('auth-restored', { service: 'spotify' });
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
        if (!creds.clientId || !creds.clientSecret || !tokens.refreshToken) {
            log.debug('SPOTIFY_MISSING_CREDENTIALS_OR_TOKEN', {
                hasClientId: !!creds.clientId,
                hasClientSecret: !!creds.clientSecret,
                hasRefreshToken: !!tokens.refreshToken
            });
            return null;
        }
        if (tokens.accessToken && tokens.expiry && tokens.expiry > Date.now()) {
            const expiresIn = Math.round((tokens.expiry - Date.now()) / 1000);
            log.debug('SPOTIFY_TOKEN_VALID', { expiresIn });
            return tokens.accessToken;
        }

        log.info('SPOTIFY_REFRESHING_TOKEN');
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
        if (!resp.ok) {
            const body = await resp.text().catch(() => '');
            // invalid_grant means the refresh token was revoked or expired:
            // polling can never recover on its own, the user must re-authorise.
            if (resp.status === 400 || resp.status === 401) {
                log.error('SPOTIFY_REAUTH_REQUIRED', { status: resp.status });
                this.bot.updateConfig({ spotifyAccessToken: '', spotifyRefreshToken: '' });
                this.stopPolling();
                this.bot.emit('auth-expired', { service: 'spotify' });
            }
            throw new Error(`Spotify refresh failed: ${resp.status} ${body}`);
        }
        const data = await resp.json();
        this.storeTokens({
            accessToken: data.access_token,
            refreshToken: data.refresh_token || tokens.refreshToken,
            expiresIn: data.expires_in || 3600
        });
        log.info('SPOTIFY_REFRESH_SUCCESS');
        return this.getStoredTokens().accessToken;
    }

    async fetchCoverFromSources(artist, track) {
        const query = artist ? `${artist} ${track}`.trim() : (track || '').trim();
        if (!query) return { coverUrl: '', albumName: '' };

        const cacheKey = query.toLowerCase();
        if (this.localCoverCache.has(cacheKey)) {
            return this.localCoverCache.get(cacheKey);
        }

        let coverUrl = '';
        let albumName = '';

        try {
            const itunesUrl = `https://itunes.apple.com/search?term=${encodeURIComponent(query)}&entity=song&limit=1`;
            const res = await fetch(itunesUrl);
            if (res.ok) {
                const data = await res.json();
                if (data && data.results && data.results[0]) {
                    const item = data.results[0];
                    if (item.artworkUrl100) {
                        coverUrl = item.artworkUrl100.replace('100x100bb.jpg', '600x600bb.jpg');
                    }
                    if (item.collectionName) {
                        albumName = item.collectionName;
                    }
                }
            }
        } catch (e) {
        }

        if (!coverUrl) {
            try {
                const deezerUrl = `https://api.deezer.com/search?q=${encodeURIComponent(query)}&limit=1`;
                const res = await fetch(deezerUrl);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.data && data.data[0]) {
                        const item = data.data[0];
                        if (item.album) {
                            coverUrl = item.album.cover_xl || item.album.cover_big || item.album.cover_medium || '';
                            if (!albumName && item.album.title) {
                                albumName = item.album.title;
                            }
                        }
                    }
                }
            } catch (e) {
            }
        }

        if (!coverUrl && artist && track) {
            try {
                const deezerTrackUrl = `https://api.deezer.com/search?q=${encodeURIComponent(track)}&limit=1`;
                const res = await fetch(deezerTrackUrl);
                if (res.ok) {
                    const data = await res.json();
                    if (data && data.data && data.data[0] && data.data[0].album) {
                        const album = data.data[0].album;
                        coverUrl = album.cover_xl || album.cover_big || album.cover_medium || '';
                        if (!albumName && album.title) {
                            albumName = album.title;
                        }
                    }
                }
            } catch (e) {
            }
        }

        const result = { coverUrl, albumName };
        if (coverUrl) {
            this.localCoverCache.set(cacheKey, result);
        }
        return result;
    }

    getLocalTrackFromWindow() {
        return new Promise((resolve) => {
            const isWin = process.platform === 'win32';
            if (!isWin) {
                return resolve({ isPlaying: false, trackTitle: '', trackArtist: '', trackAlbum: '', coverUrl: '' });
            }

            const { execFile } = require('child_process');
            execFile('tasklist.exe', ['/v', '/fi', 'imagename eq spotify.exe', '/fo', 'csv'], { encoding: 'buffer' }, async (err, stdout) => {
                let title = '';
                if (!err && stdout) {
                    const raw = stdout.toString('utf8');
                    const lines = raw.split(/\r?\n/).filter(l => l.trim().length > 0);
                    const ignoreList = ['spotify', 'spotify free', 'spotify premium', 'n/a', 'olemainthreadwndname', 'angle hidden window', 'default ime', 'msctls_statusbar32'];

                    for (const line of lines) {
                        if (!line.includes('","')) continue;
                        const parts = line.split('","').map(p => p.replace(/^"+|"+$/g, '').trim());
                        if (!parts[0].toLowerCase().includes('spotify')) continue;
                        const candidate = (parts[parts.length - 1] || '').replace(/^"+|"+$/g, '').trim();
                        if (!candidate) continue;
                        const lower = candidate.toLowerCase();
                        if (ignoreList.includes(lower)) continue;
                        title = candidate;
                        break;
                    }
                }

                if (!title) {
                    const args = [
                        '-NoProfile',
                        '-ExecutionPolicy', 'Bypass',
                        '-Command',
                        `[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Process -Name Spotify -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle } | Select-Object -ExpandProperty MainWindowTitle`
                    ];
                    return execFile('powershell.exe', args, { encoding: 'buffer' }, async (psErr, psStdout) => {
                        if (psErr || !psStdout) {
                            return resolve({ isPlaying: false, trackTitle: '', trackArtist: '', trackAlbum: '', coverUrl: '' });
                        }
                        const psTitle = psStdout.toString('utf8').trim();
                        if (!psTitle || ['spotify', 'spotify free', 'spotify premium'].includes(psTitle.toLowerCase())) {
                            return resolve({ isPlaying: false, trackTitle: '', trackArtist: '', trackAlbum: '', coverUrl: '' });
                        }
                        await this.resolveTrackFromTitle(psTitle, resolve);
                    });
                }

                await this.resolveTrackFromTitle(title, resolve);
            });
        });
    }

    async resolveTrackFromTitle(title, resolve) {
        const separatorIndex = title.indexOf(' - ');
        let artist = '';
        let track = title;

        if (separatorIndex !== -1) {
            artist = title.substring(0, separatorIndex).trim();
            track = title.substring(separatorIndex + 3).trim();
        }

        try {
            const { coverUrl, albumName } = await this.fetchCoverFromSources(artist, track);
            resolve({
                isPlaying: true,
                trackTitle: track,
                trackArtist: artist,
                trackAlbum: albumName || 'Spotify Local',
                coverUrl: coverUrl || ''
            });
        } catch (e) {
            resolve({
                isPlaying: true,
                trackTitle: track,
                trackArtist: artist,
                trackAlbum: 'Spotify Local',
                coverUrl: ''
            });
        }
    }

    async fetchCurrentTrack() {
        if (this.fallbackToWindow) {
            return this.getLocalTrackFromWindow();
        }

        let token;
        try {
            token = await this.ensureAccessToken();
        } catch (err) {
            log.error('SPOTIFY_REFRESH_ERROR', err.message);
            return this.getLocalTrackFromWindow();
        }

        if (!token) {
            log.debug('SPOTIFY_NO_TOKEN');
            return this.getLocalTrackFromWindow();
        }

        try {
            const resp = await fetch('https://api.spotify.com/v1/me/player/currently-playing', {
                headers: { Authorization: `Bearer ${token}` }
            });

            log.debug('SPOTIFY_API_RESPONSE', { status: resp.status, statusText: resp.statusText });

            if (resp.status === 204) {
                this.spotifyApiFailCount = 0;
                log.debug('SPOTIFY_204_NO_CONTENT');
                return this.getLocalTrackFromWindow();
            }

            if (resp.status === 401) {
                log.warn('SPOTIFY_TOKEN_EXPIRED');
                this.bot.updateConfig({ spotifyAccessToken: '' });
                return this.getLocalTrackFromWindow();
            }

            if (!resp.ok) {
                log.warn('SPOTIFY_FETCH_FAILED', { status: resp.status });
                if (resp.status === 403) {
                    this.spotifyApiFailCount++;
                    this.fallbackToWindow = true;
                    return this.getLocalTrackFromWindow();
                }
                return { isPlaying: false, trackTitle: '', trackArtist: '', trackAlbum: '', coverUrl: '' };
            }

            this.spotifyApiFailCount = 0;
            const data = await resp.json();
            if (!data || !data.item) {
                log.debug('SPOTIFY_DATA_NO_ITEM');
                return this.getLocalTrackFromWindow();
            }

            const track = data.item;
            let coverUrl = (track.album && track.album.images && track.album.images[0] && track.album.images[0].url) || '';
            const trackTitle = track.name || 'Titre du morceau';
            const trackArtist = (track.artists || []).map(a => a.name).join(', ') || 'Artiste';
            const trackAlbum = (track.album && track.album.name) || 'Album';

            if (!coverUrl) {
                const fallbackCover = await this.fetchCoverFromSources(trackArtist, trackTitle);
                if (fallbackCover && fallbackCover.coverUrl) {
                    coverUrl = fallbackCover.coverUrl;
                }
            }

            return {
                isPlaying: data.is_playing !== false,
                trackTitle: trackTitle,
                trackArtist: trackArtist,
                trackAlbum: trackAlbum,
                coverUrl: coverUrl
            };
        } catch (err) {
            log.error('SPOTIFY_FETCH_ERROR', err.message);
            return this.getLocalTrackFromWindow();
        }
    }

    updateTrackConfig(trackData) {
        if (!trackData) return;
        const current = this.bot.getWidgetConfig('spotify') || {};
        const next = { ...current, ...trackData };
        this.bot.saveWidgetConfig('spotify', next);

        const trackChanged = !this.currentSpotifyTrack ||
            this.currentSpotifyTrack.trackTitle !== next.trackTitle ||
            this.currentSpotifyTrack.isPlaying !== next.isPlaying;

        if (trackChanged) {
            log.info('SPOTIFY_TRACK_UPDATED', { title: next.trackTitle, artist: next.trackArtist, isPlaying: next.isPlaying });
        }

        this.currentSpotifyTrack = next;
        this.broadcastConfig(next);
    }

    startPolling() {
        if (this.spotifyPollTimer) clearInterval(this.spotifyPollTimer);
        const tokens = this.getStoredTokens();
        if (!tokens.refreshToken && !tokens.accessToken && process.platform !== 'win32') return;

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
        this.spotifyPollTimer = null;
    }

    broadcastConfig(config) {
        this.broadcast({ type: 'config-update', widget: 'spotify', config });
    }
}

function createSpotifyWidgetServer(bot, options = {}) {
    return new SpotifyWidgetServer(bot, options);
}

module.exports = { createSpotifyWidgetServer };
