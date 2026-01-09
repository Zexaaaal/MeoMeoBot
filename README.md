<p align="center">
  <img src="./assets/icon.png" alt="MeoMeoBot Icon" width="100"/>
</p>

<div align="center">
  <span style="font-size: 1.1em; font-weight: bold;">
    Développé pour <a href="https://www.twitch.tv/soo_meo">Soo_Meo</a> <br/>
    Basé sur Electron pour modérer, gérer les commandes + giveaway et chromecast.
  </span>
</div>
</br>

## Fonctionnalités :
- **Commandes** : permet d'input n'importe quelle commande avec une réponse directe dans le tchat Twitch.
> ⚠️ Publie directement le message via le compte Twitch connecté
- **Giveaway** : gère l'ouverture, la fermeture et le tirage au sort des participants avec possibilité d'envoi de message dans le tchat.
- **Chromecast** : permet aux utilisateurs de cast des vidéos
- **Mise à jour auto** : recherche les nouvelles versions sur les *Releases* publiques de ce dépôt

## Cast & Flux
- **Transcodage FFmpeg :** pour transcoder le flux à la volée
- **Codecs Cibles :** vidéo au codec **H.264** et audio au codec **AAC**
- **Stabilité :** débit binaire est optimisé à *500 kbps* pour le streaming à faible latence
> ⚠️ Si la diffusion ne démarre pas, vérifiez que le **Pare-feu Windows** autorise l'exécutable principal du bot à ouvrir des ports réseau (règle de trafic entrant/sortant)

## Connexion & Sécurité
- **Canal Twitch** : nom de chaîne
- **Nom du bot** : nom du compte Twitch utilisé
- **Token OAuth** : Access Token à générer [ici](https://twitchtokengenerator.com/)

Pour les badges de tchat : 
- **Twitch Client ID** : votre App ID ([Website Intégration](https://dev.twitch.tv/console/apps))
- **Twitch App Access Token** : à générer via Powershell
```
$cid    = "AppID"
$secret = "AppSecret"
iwr -Method Post "https://id.twitch.tv/oauth2/token?client_id=$cid&client_secret=$secret&grant_type=client_credentials" | Select-Object -ExpandProperty Content
```
Pour le plugin Spotify :
- **Spotify Client ID** : depuis le [Dashboard Spotify](https://developer.spotify.com/dashboard)
- **Spotify Client Secret** : également depuis le dashboard
Puis Widgets > Spotify > Connexion OAuth

## Stockage des configs
Toutes vos configurations personnalisées (commandes, mots bannis, etc.) sont stockées **localement** sur votre machine par `electron-store`. </br>
La mise à jour de l'application n'écrase jamais ces données.

## Build l'app
Incrémenter la version dans `package.json` et ajouter le `GH_TOKEN` dans l'env.</br>
`set GH_TOKEN=VOTRE_JETON && npm run publish` dans une invite de commande.
