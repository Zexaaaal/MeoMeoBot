module.exports = {
    config: {
        channel: "",
        username: "",
        token: "",
        autoMessageInterval: 40,
        autoMessage: "",
        giveawayCommand: "!giveaway",
        giveawayStartMessage: "Giveaway ouvert ! Utilise !giveaway pour participer !",
        giveawayStopMessage: "Giveaway fermé ! Merci à tous les participants !",
        giveawayWinMessage: "Felicitations @{winner}, tu as gagné le giveaway !",
        bannedWords: [],
        castFolderPath: "",
        clipCooldown: 60,
        widgetPort: 8087,
        rouletteWidgetPort: 8092,
        alertsWidgetPort: 8097,
        spotifyWidgetPort: 8090,
        spotifyClientId: "",
        spotifyClientSecret: "",
        spotifyAccessToken: "",
        spotifyRefreshToken: "",
        spotifyTokenExpiry: 0
    },
    widgets: {
        chat: {
            customCSS: "#chat-container {\n    max-height: 500px; \n    font-size: 16px;\n}\n\n.message {\n    padding: 10px;\n    border-radius: 8px;\n}\n\n.username {\n    font-weight: bold;\n    text-shadow: none;\n}",
            maxMessages: 10,
            badgePrefs: {
                moderator: true,
                vip: true,
                subscriber: true,
                founder: true,
                partner: true,
                staff: true,
                premium: true
            }
        },
        spotify: {
            customCSS: `#spotify-wrapper {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100vw;
    height: 100vh;
    background: transparent;
}

.spotify-card {
    display: grid;
    grid-template-columns: 140px 1fr;
    gap: 12px;
    padding: 14px;
    border-radius: 16px;
    background: rgba(0,0,0,0.35);
    border: 1px solid rgba(255,255,255,0.08);
    box-shadow: 0 15px 40px rgba(0,0,0,0.45);
    backdrop-filter: blur(8px);
    color: #f5f7fb;
    font-family: "Inter", "Segoe UI", sans-serif;
    max-width: 520px;
}

.spotify-cover {
    width: 140px;
    height: 140px;
    border-radius: 12px;
    object-fit: cover;
    box-shadow: 0 10px 25px rgba(0,0,0,0.4);
    background: #111;
}

.spotify-infos {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.spotify-title {
    font-size: 20px;
    font-weight: 700;
    line-height: 1.2;
}

.spotify-artist {
    font-size: 16px;
    color: #9fb4d1;
}

.spotify-album {
    font-size: 14px;
    color: #6f7c92;
}

.pill {
    align-self: flex-start;
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(255,255,255,0.08);
    font-size: 12px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    color: #d3deef;
}
`,
            trackTitle: "Mon titre",
            trackArtist: "Artiste",
            trackAlbum: "Album",
            coverUrl: "https://en.wikipedia.org/wiki/Choke_Enough#/media/File:Oklou_-_Choke_Enough.jpg"
        },
        roulette: {
            customCSS: "",
            choices: ["Choix 1", "Choix 2", "Choix 3", "Choix 4", "Choix 5"]
        }
    },
    commands: {
        "!discord": "Rejoins notre discord: https://discord.gg/example",
        "!twitter": "Suis-nous sur Twitter: https://twitter.com/example"
    },
    giveaway: {
        isActive: false,
        participants: []
    }
};
