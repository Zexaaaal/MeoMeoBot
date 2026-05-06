const { app, net } = require('electron');
app.whenReady().then(() => {
    net.fetch('https://kick.com/api/v2/channels/zexaaal', {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
    }).then(r=>r.text()).then(t => {
        console.log("NET_FETCH_RESULT", t.substring(0, 100));
        app.quit();
    }).catch(e => {
        console.error(e);
        app.quit();
    });
});
