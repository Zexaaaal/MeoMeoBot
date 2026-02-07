const WebSocket = require('ws');

const ws = new WebSocket('wss://eventsub.wss.twitch.tv/ws');

setTimeout(() => {
    console.log('Closing socket while connecting...');
    ws.removeAllListeners();
    ws.close();
}, 10);
