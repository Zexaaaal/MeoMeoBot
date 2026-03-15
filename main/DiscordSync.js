const https = require('https');
const log = require('./logger').tagged('DiscordSync');

function parseWebhookUrl(url) {
    const match = url.match(/discord(?:app)?\.com\/api\/webhooks\/(\d+)\/(.+?)(?:\?|$)/);
    if (!match) return null;
    return { id: match[1], token: match[2] };
}

function buildMultipartBody(boundary, imageBuffer, embedPayload) {
    const parts = [];

    parts.push(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="payload_json"\r\n` +
        `Content-Type: application/json\r\n\r\n` +
        JSON.stringify(embedPayload) + `\r\n`
    );

    parts.push(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="files[0]"; filename="planning.jpg"\r\n` +
        `Content-Type: image/jpeg\r\n\r\n`
    );

    const header = Buffer.from(parts.join(''));
    const footer = Buffer.from(`\r\n--${boundary}--\r\n`);

    return Buffer.concat([header, imageBuffer, footer]);
}

function discordRequest(method, path, body, boundary) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'discord.com',
            port: 443,
            path,
            method,
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': body.length
            }
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    try { resolve(JSON.parse(data)); }
                    catch { resolve(data); }
                } else {
                    reject(new Error(`Discord API ${res.statusCode}: ${data}`));
                }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

async function sendPlanningToDiscord(webhookUrl, imageBase64, title, existingMessageId) {
    const parsed = parseWebhookUrl(webhookUrl);
    if (!parsed) throw new Error('URL webhook Discord invalide');

    const base64Data = imageBase64.replace(/^data:image\/(png|jpeg);base64,/, '');
    const imageBuffer = Buffer.from(base64Data, 'base64');

    const boundary = `----MeoMeoBot${Date.now()}`;

    const embedPayload = {
        content: title,
        attachments: [{
            id: 0,
            filename: 'planning.jpg'
        }]
    };

    if (existingMessageId) {
        try {
            const body = buildMultipartBody(boundary, imageBuffer, embedPayload);
            const result = await discordRequest(
                'PATCH',
                `/api/webhooks/${parsed.id}/${parsed.token}/messages/${existingMessageId}`,
                body,
                boundary
            );
            log.info('DISCORD_MESSAGE_UPDATED', { messageId: result.id });
            return { success: true, messageId: result.id };
        } catch (e) {
            log.warn('DISCORD_EDIT_FAILED_CREATING_NEW', { error: e.message });
        }
    }

    try {
        const body = buildMultipartBody(boundary, imageBuffer, embedPayload);
        const result = await discordRequest(
            'POST',
            `/api/webhooks/${parsed.id}/${parsed.token}?wait=true`,
            body,
            boundary
        );

        log.info('DISCORD_MESSAGE_CREATED', { messageId: result.id });
        return { success: true, messageId: result.id };
    } catch (e) {
        log.error('DISCORD_SYNC_FAILED', { error: e.message });
        return { success: false, error: e.message };
    }
}

module.exports = { sendPlanningToDiscord };
