const LOG_MESSAGES = {
    // BOT
    BOT_CHAT_CLEARED: "Tchat nettoyé",
    BOT_MESSAGE_DELETED: "Message supprimé : {id}",
    BOT_USER_NOTICE: "UserNotice reçu: {id} de {username}",
    BOT_CONNECTION_ERROR: "Erreur de connexion : {error}",
    BOT_NEW_STREAM: "Nouveau stream (commencé à {time}). Reset des subs quotidiens.",
    BOT_STREAM_LIVE: "Live en cours, daily subs déjà suivis.",
    BOT_DAILY_SUBS_RESET: "Reset des subs quotidiens (début du stream)",
    BOT_TOKEN_GEN: "Génération d'un nouveau App Access Token Twitch...",
    BOT_DEBUG_CONFIG: "Vérification de la configuration - ClientID: {clientId}, AppToken: {appToken}, Secret: {clientSecret}",
    BOT_DEBUG_VALUES: "Valeurs - ID: {id}, Token: {token}",
    BOT_BADGES_WARN: "Badges désactivés : fournissez TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET dans .env ou twitchClientId/twitchAppToken dans la config.",
    BOT_ERROR_DELETE_COMMAND: "Erreur suppression commande : {error}",
    BOT_CLIP_ERROR: "Erreur : {error}",
    BOT_MISSING_CONFIG: "Configuration de connexion manquante (canal, bot, token).",
    BOT_DISCONNECT_ERROR: "Erreur déconnexion : {error}",
    BOT_APP_TOKEN_ERROR: "Erreur App Token : {error}",
    BOT_RFSH_DEL_ERROR: "Erreur suppression commande !rfsh : {error}",
    BOT_OON_DEL_ERROR: "Erreur suppression commande !oon : {error}",
    BOT_STREAM_STATUS_ERROR: "Erreur vérification statut stream : {error}",

    BOT_DEBUG_CONFIG_CHECK: "[DEBUG] Config Check - ClientID: {clientId}, AppToken: {configAppToken}, Secret: {clientSecret}",
    BOT_DEBUG_CONFIG_VALUES: "[DEBUG] Config Values - ID: {idStatus}, Token: {tokenStatus}",
    BOT_BADGES_DISABLED: "Badges désactivés : fournissez TWITCH_CLIENT_ID/TWITCH_CLIENT_SECRET dans .env ou twitchClientId/twitchAppToken dans la config.",
    BOT_NEW_APP_TOKEN: "Génération d'un nouveau App Access Token Twitch...",
    BOT_NEW_STREAM_DETECTED: "New stream detected (started at {startedAt}). Resetting daily subs.",
    BOT_STREAM_ALREADY_TRACKED: "Stream is live, but daily subs already tracked for this session.",

    // IPC
    IPC_GET_CONFIG_CALLED: "get-config called",
    IPC_RETURNING_CONFIG_KEYS: "returning config keys: {keys}",

    // EVENTSUB
    EVENTSUB_CONNECTING: "Connexion à {url}...",
    EVENTSUB_DISCONNECTED: "Déconnecté (code: {code}). Reconnexion dans 5s...",
    EVENTSUB_SESSION_WELCOME: "Session {sessionId}",
    EVENTSUB_NOTIFICATION_RECEIVED: "Notification : {type}",
    EVENTSUB_RECONNECT_REQUESTED: "Reconnexion demandée vers {url}",
    EVENTSUB_SUBSCRIPTION_SENT: "Souscription envoyée : {type}",

    // MAIN APP
    MAIN_MSG_DELETED: "Message supprimé : {messageId}",
    MAIN_CHAT_CLEARED: "Tchat nettoyé",
    MAIN_REFRESH_WIDGETS: "Actualisation des widgets via commande admin",
    MAIN_TOGGLE_WIDGETS: "Affichage des widgets : {visible}",
    MAIN_SERVERS_STARTED: "Tous les serveurs de widgets ont démarré.",
    MAIN_SERVERS_ERR: "Erreur démarrage des serveurs de widgets : {error}",
    MAIN_UPDATE_CHECK: "Lancement de la vérification de mise à jour initiale...",
    MAIN_IPC_REGISTER: "Enregistrement des gestionnaires IPC...",
    MAIN_IPC_REGISTERED: "IPC handlers registered.",
    MAIN_FONTS_ERR: "Erreur chargement des polices système : {error}",
    MAIN_THEME_ERR: "Erreur rechargement du contenu du thème : {error}",
    MAIN_WINDOW_CLOSED: "Fenêtre principale fermée",

    // SERVER / WIDGETS
    SERVER_START: "Serveur lancé sur le port {port}",
    SERVER_PORT_IN_USE: "Port {port} déjà utilisé, chargement d'un port aléatoire...",
    SERVER_ERROR: "Erreur serveur :",
    SERVER_REQUEST: "Requête : {method} {url}",
    SERVER_TTS_PROXY: 'Proxy TTS pour : "{text}"',
    SERVER_TTS_FAILED: "Google TTS failed with status: {status}",
    SERVER_TTS_REQ_ERR: "Erreur requête proxy TTS",
    SERVER_BLOCKED_FILE: "Type de fichier restreint : {path}",
    SERVER_FILE_NOT_FOUND: "Fichier local non trouvé : {path}",
    SERVER_LOAD_ERR: "Erreur chargement fichier : {path}",
    SERVER_WS_BROADCAST: "Diffusion : {data} à {count} clients",
    SERVER_STOPPING: "Arrêt du serveur.",
    SERVER_CLOSE_ERR: "Erreur arrêt serveur :",

    WIDGET_CONNECTED: "Connecté au serveur",
    WIDGET_DISCONNECTED: "Déconnecté. Reconnexion dans 3s...",
    WIDGET_WS_ERROR: "Erreur WS : {error}",
    WIDGET_NO_SOCKET: "Requête impossible, socket non ouvert",

    TWITCH_AUTH_ERR: "Erreur validation token:",
    TWITCH_MOD_BAN_SUCCESS: "Bannissement/Timeout Helix réussi",
    TWITCH_MOD_BAN_ERR: "Erreur Bannissement/Timeout:",
    TWITCH_MOD_DEL_SUCCESS: "Suppression Helix réussie",
    TWITCH_MOD_DEL_ERR: "Erreur suppression Helix:",
    TWITCH_CLIP_SUCCESS: "Clip créé:",
    TWITCH_CLIP_ERR: "Erreur création clip:",
    TWITCH_SUB_COUNT_ERR: "Erreur récupération nombre de subs:",
    TWITCH_EMOTES_NO_USER: "fetchChannelEmotes échoué : userId est null",
    TWITCH_EMOTES_MOCK: "(DEV) Emotes mock",
    TWITCH_EMOTES_NO_TOKEN: "fetchChannelEmotes échoué : Aucun token valide (App ou User) disponible",
    TWITCH_EMOTES_401: "fetchChannelEmotes a reçu 401. Invalidation du Token App et nouvelle tentative...",
    TWITCH_EMOTES_FETCHING_GLOBAL: "Aucun emote de la trouvée, récupération des emotes globales...",
    TWITCH_EMOTES_ERR: "Erreur récupération emotes :",
    TWITCH_SEARCH_CAT_ERR: "Erreur recherche catégories :",
    TWITCH_SGDB_ERR: "SGDB Error:",
    TWITCH_STREAM_INFO_ERR: "Erreur récupération infos stream :",
    TWITCH_SCHEDULE_ERR: "Erreur récupération planning :",
    TWITCH_SEGMENT_CRE_ERR: "Erreur création segment :",
    TWITCH_SEGMENT_UPD_ERR: "Erreur mise à jour segment :",
    TWITCH_SEGMENT_DEL_ERR: "Erreur suppression segment :",

    THEME_CREATE_ERR: "Erreur création thème :",
    THEME_DEL_ERR: "Erreur suppression thème :",
    THEME_IMPORT_ERR: "Erreur importation thème :",

    REWARDS_MOCK_RET: "(DEV) Retour des récompenses personnalisées factices",
    REWARDS_FETCH_ERR: "Erreur récupération récompenses :",
    REWARDS_MOCK_CRE: "(DEV) Création récompense factice :",
    REWARDS_CRE_ERR: "Erreur création récompense :",
    REWARDS_MOCK_UPD: "(DEV) Mise à jour récompense factice :",
    REWARDS_UPD_ERR: "Erreur mise à jour récompense :",
    REWARDS_MOCK_DEL: "(DEV) Suppression récompense factice :",
    REWARDS_DEL_ERR: "Erreur suppression récompense :",
    REWARDS_REDEMPTION: "Récompense reçue ! ID: {id}, User : {user}",
    REWARDS_BINDINGS: "Bindings disponibles : {bindings}",
    REWARDS_FUNC: "Fonction pour cette récompense: '{func}'",
    REWARDS_MOCK_RAIN: "(DEV) Déclenchement pluie d'emotes factice",
    REWARDS_MOCK_RAIN_ERR: "Erreur déclenchement pluie d'emotes factice :",
    REWARDS_RAIN: "Déclenchement pluie d'emotes pour récompense : {id}",
    REWARDS_RAIN_EMOTES: "Récupération de {count} emotes pour la pluie",
    REWARDS_RAIN_ERR: "Erreur déclenchement pluie d'emotes :",

    MEDIA_FFMPEG_MISSING: "Binaires FFmpeg non trouvé dans node_modules",
    MEDIA_MP4_ERR: "Erreur stream MP4 : {error}",
    MEDIA_TRANSCODE_ERR: "Erreur transcodage : {error}",
    MEDIA_SETUP_ERR: "Erreur configuration transcodage : {error}",
    MEDIA_STARTED: "Serveur media démarré sur le port {port}",

    STREAMLABS_NO_TOKEN: "Pas de token configuré.",
    STREAMLABS_STARTING: "Démarrage avec token (fin): ...{tokenEnd}",
    STREAMLABS_CONNECTED: "Connecté au socket API.",
    STREAMLABS_EVENT: "Event reçu:",
    STREAMLABS_DISCONNECTED: "Déconnecté. Raison: {reason}",
    STREAMLABS_CONN_ERROR: "Erreur de connexion:",
    STREAMLABS_CHECK_TOKEN: "Vérifiez votre Socket Token !",
    STREAMLABS_INIT_ERROR: "Erreur d'initialisation:",
    STREAMLABS_DONATION: "Donation reçue de {name}: {amount}",

    SPOTIFY_INIT_ERROR: "Erreur initial fetch :",
    SPOTIFY_CALLBACK: "Callback reçu avec état : {state}",
    SPOTIFY_INVALID_STATE: "State invalide ou code manquant",
    SPOTIFY_AUTH_SUCCESS: "Authentification réussie, démarrage du polling...",
    SPOTIFY_AUTH_ERROR: "Erreur callback",
    SPOTIFY_REFRESH_ERROR: "Erreur refresh token :",
    SPOTIFY_TOKEN_EXPIRED: "Token expiré ou invalide (401), nettoyage du token mis en cache",
    SPOTIFY_FETCH_FAILED: "Erreur récupération track actuel",
    SPOTIFY_FETCH_ERROR: "Erreur récupération track actuel :",
    SPOTIFY_NO_TRACK: "Aucun track récupéré ou erreur d'authentification",
    SPOTIFY_POLLING_ERROR: "Erreur polling",

    ALERTS_CLIENT_CONN: "Client connecté",
    ALERTS_FINISHED: "Alerte terminée",
    ALERTS_PARSE_ERR: "Erreur parsing message :",
    ALERTS_ADDED_QUEUE: "Ajouté à la file d'attente : {type}",
    ALERTS_SAFETY_TIMEOUT: "Safety timeout triggered - forcing next alert",

    // CONFIG
    CONFIG_STORE_PATH: "Chemin de stockage : {path}",

    // API / SYSTEM
    API_CONNECTED: "API Connectée",
    API_ERROR: "Erreur API : {error}",
    SYSTEM_FONT_ERROR: "Erreur chargement polices système : {error}",

    // UI NOTIFICATIONS
    NOTIF_SUCCESS_SAVED: "Sauvegardé",
    NOTIF_SUCCESS_CLEARED: "Liste vidée",
    NOTIF_SUCCESS_CONNECTED: "Bot connecté",
    NOTIF_SUCCESS_DISCONNECTED: "Bot déconnecté",
    NOTIF_SUCCESS_GIVEAWAY_STARTED: "Giveaway démarré",
    NOTIF_SUCCESS_GIVEAWAY_STOPPED: "Giveaway fermé",
    NOTIF_SUCCESS_COMMAND_MODIFIED: "Commande modifiée avec succès",
    NOTIF_SUCCESS_THEME_DELETED: "Thème supprimé",
    NOTIF_SUCCESS_THEME_APPLIED: "Thème réinitialisé et appliqué",
    NOTIF_SUCCESS_THEME_RELOADED: "Thème rechargé et appliqué",
    NOTIF_SUCCESS_RESET: "Réinitialisé",
    NOTIF_SUCCESS_CONFIG_RESET: "Configuration réinitialisée",

    NOTIF_ERROR_SAVE: "Erreur lors de la sauvegarde",
    NOTIF_ERROR_DELETE: "Erreur lors de la suppression",
    NOTIF_ERROR_ADD: "Erreur lors de l'ajout : {error}",
    NOTIF_ERROR_CLEAR: "Erreur au vidage : {error}",
    NOTIF_ERROR_LOAD: "Erreur de chargement : {error}",
    NOTIF_ERROR_START: "Erreur au lancement : {error}",
    NOTIF_ERROR_STOP: "Erreur à l'arrêt : {error}",
    NOTIF_ERROR_CONNECT: "Erreur de connexion : {error}",
    NOTIF_ERROR_GENERIC: "Erreur : {error}",
    NOTIF_ERROR_MISSING_FIELDS: "Veuillez remplir correctement les champs.",

    NOTIF_BANNED_WORD_ADDED: "Mot ajouté : {word}",
    NOTIF_BANNED_WORD_REMOVED: "Mot retiré : {word}",
    NOTIF_GIVEAWAY_WINNER: "Vainqueur : {winner}",
    NOTIF_GIVEAWAY_NO_PARTICIPANT: "Aucun participant à tirer au sort",
    NOTIF_COMMAND_ADDED: "Commande {cmd} ajoutée",
    NOTIF_THEME_CREATED: 'Thème "{name}" créé avec succès !',
    NOTIF_THEME_IMPORT_ERROR: "Erreur lors de l'importation : {error}",
    NOTIF_API_ERROR: "Erreur API : {error}",
    NOTIF_CURRENT_COUNT: "Nombre actuel récupéré : {count}",
    NOTIF_EXPORT_ERROR: "Erreur export : {error}",
    NOTIF_IMPORT_ERROR: "Erreur lors de l'import : {error}",
    NOTIF_SYNC_ERROR: "Erreur lors de la synchro : {error}",
    NOTIF_UPDATE_SUCCESS: "Mise à jour réussie",
    NOTIF_DEMO_MODE: "Mode démo : Affilié/Partenaire requis chez Twitch",
};

function formatMessage(messageId, params = {}) {
    let msg = LOG_MESSAGES[messageId] || messageId;
    for (const [key, value] of Object.entries(params)) {
        msg = msg.replace(`{${key}}`, value);
    }
    return msg;
}

function emit(tag, msgStr, ...args) {
    const prefix = `[${tag}]`;
    console.log(prefix, msgStr, ...args);
}

function tagged(tag) {
    return {
        info: (messageId, params = {}, ...args) => {
            const msgStr = typeof params === 'object' && params !== null && !Array.isArray(params)
                ? formatMessage(messageId, params)
                : formatMessage(messageId);

            if (typeof params !== 'object' || Array.isArray(params) || params === null) {
                emit(tag, msgStr, params, ...args);
            } else {
                emit(tag, msgStr, ...args);
            }
        },
        error: (messageId, params = {}, ...args) => {
            const msgStr = typeof params === 'object' && params !== null && !Array.isArray(params)
                ? formatMessage(messageId, params)
                : formatMessage(messageId);

            if (typeof params !== 'object' || Array.isArray(params) || params === null) {
                console.error(`[${tag}]`, msgStr, params, ...args);
            } else {
                console.error(`[${tag}]`, msgStr, ...args);
            }
        },
        warn: (messageId, params = {}, ...args) => {
            const msgStr = typeof params === 'object' && params !== null && !Array.isArray(params)
                ? formatMessage(messageId, params)
                : formatMessage(messageId);

            if (typeof params !== 'object' || Array.isArray(params) || params === null) {
                console.warn(`[${tag}]`, msgStr, params, ...args);
            } else {
                console.warn(`[${tag}]`, msgStr, ...args);
            }
        }
    };
}

const defaultLogger = tagged('Main');

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        ...defaultLogger,
        tagged,
        LOG_MESSAGES,
        formatMessage
    };
}

if (typeof window !== 'undefined') {
    window.logger = {
        ...defaultLogger,
        tagged,
        MESSAGES: LOG_MESSAGES,
        format: formatMessage
    };
}

