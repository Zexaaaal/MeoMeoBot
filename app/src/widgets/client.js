function connectWidget(onMessage, customUrl) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const isDock = window.location.pathname.includes('/widget/dock');
    const isPreview = new URLSearchParams(window.location.search).get('mode') === 'preview';
    let ws;

    function applyCustomCss(css) {
        let style = document.getElementById('dynamic-custom-css');
        if (!style) {
            style = document.createElement('style');
            style.id = 'dynamic-custom-css';
            document.head.appendChild(style);
        }
        style.textContent = css;
    }

    if (isPreview) {
        const noScroll = document.createElement('style');
        noScroll.textContent = 'html, body { overflow: hidden !important; }';
        document.head.appendChild(noScroll);
        const fit = () => {
            document.documentElement.style.zoom = '';
            const ratio = window.innerWidth / document.documentElement.scrollWidth;
            if (ratio < 1) document.documentElement.style.zoom = ratio;
        };
        window.addEventListener('load', fit);
        window.addEventListener('resize', fit);
        new MutationObserver(() => requestAnimationFrame(fit)).observe(document.documentElement, { childList: true, subtree: true });
        window.addEventListener('message', (event) => {
            if (event.data && event.data.type === 'preview-css') applyCustomCss(event.data.css);
        });
    }

    function connect() {
        ws = new WebSocket(customUrl || `${protocol}//${window.location.host}`);
        ws.onopen = () => {
            if (isPreview) ws.send(JSON.stringify({ type: 'register-preview' }));
        };

        window.sendMessage = (type, payload) => {
            if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type, ...payload }));
        };

        ws.onmessage = (event) => {
            let data;
            try {
                data = JSON.parse(event.data);
            } catch (e) {
                return;
            }

            if (data.type === 'handshake') {
                const lastRunId = sessionStorage.getItem('widget_run_id');
                sessionStorage.setItem('widget_run_id', data.runId);
                if (!isDock && lastRunId && lastRunId !== data.runId) {
                    window.location.reload();
                    return;
                }
                ws.send(JSON.stringify({ type: 'get-config' }));
            }
            if (data.type === 'reload') {
                if (!isDock) window.location.reload();
                return;
            }
            if (data.config && typeof data.config.customCSS === 'string') applyCustomCss(data.config.customCSS);
            if (data.type === 'visibility') document.body.style.display = data.visible ? '' : 'none';
            if (onMessage) onMessage(data);
        };

        ws.onclose = () => setTimeout(connect, 3000);
        ws.onerror = () => ws.close();
    }

    connect();

    return {
        send: (data) => {
            if (isPreview && String(data).includes('alert-finished')) return;
            if (ws && ws.readyState === WebSocket.OPEN) ws.send(data);
        }
    };
}
