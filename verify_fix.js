const WebSocket = require('ws');

const ws = new WebSocket('wss://eventsub.wss.twitch.tv/ws');

setTimeout(() => {
    console.log('Closing socket safely...');
    ws.removeAllListeners();
    ws.on('error', (err) => {
        console.log('Caught expected error:', err.message);
    });
    ws.close();
    console.log('Socket closed without crashing.');
}, 10);
