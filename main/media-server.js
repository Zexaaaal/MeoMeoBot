const http = require('http');
const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const { app } = require('electron');
const log = require('./logger').tagged('Media');


let ffmpegPath;
let ffprobePath;

if (app.isPackaged) {
    ffmpegPath = path.join(process.resourcesPath, 'ffmpeg.exe');
    ffprobePath = path.join(process.resourcesPath, 'ffprobe.exe');
} else {
    try {
        ffmpegPath = require('@ffmpeg-installer/ffmpeg').path;
        ffprobePath = require('@ffprobe-installer/ffprobe').path;
    } catch (e) {
        log.error('MEDIA_FFMPEG_MISSING', e);
    }
}

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
if (ffprobePath) ffmpeg.setFfprobePath(ffprobePath);


let mediaServer = null;
let currentlyPlayingPath = null;

function getCurrentPath() {
    return currentlyPlayingPath;
}

function setCurrentPath(videoPath) {
    currentlyPlayingPath = videoPath;
}


function start() {
    mediaServer = http.createServer(async (req, res) => {
        if (req.url === '/media' && currentlyPlayingPath) {
            const ext = path.extname(currentlyPlayingPath).toLowerCase();

            if (ext === '.mp4') {
                try {
                    const stat = await fs.promises.stat(currentlyPlayingPath);
                    const range = req.headers.range;

                    if (range) {
                        const parts = range.replace(/bytes=/, "").split("-");
                        const start = parseInt(parts[0], 10);
                        const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
                        const chunkSize = (end - start) + 1;
                        res.writeHead(206, {
                            'Content-Range': `bytes ${start}-${end}/${stat.size}`,
                            'Accept-Ranges': 'bytes',
                            'Content-Length': chunkSize,
                            'Content-Type': 'video/mp4',
                        });
                        fs.createReadStream(currentlyPlayingPath, { start, end }).pipe(res);
                    } else {
                        res.writeHead(200, {
                            'Content-Length': stat.size,
                            'Content-Type': 'video/mp4',
                            'Accept-Ranges': 'bytes'
                        });
                        fs.createReadStream(currentlyPlayingPath).pipe(res);
                    }
                } catch (e) {
                    log.error('MEDIA_MP4_ERR', { error: e.message });
                    res.writeHead(404);
                    res.end();
                }
            } else {
                try {
                    res.writeHead(200, { 'Content-Type': 'video/mp4', 'Transfer-Encoding': 'chunked' });
                    ffmpeg(currentlyPlayingPath)
                        .format('mp4')
                        .videoCodec('libx264')
                        .audioCodec('aac')
                        .outputOptions(['-movflags', 'frag_keyframe+empty_moov', '-preset', 'ultrafast'])
                        .on('error', (err) => {
                            log.error('MEDIA_TRANSCODE_ERR', { error: err.message });
                            if (!res.writableEnded) res.end();
                        })
                        .pipe(res, { end: true });
                } catch (e) {
                    log.error('MEDIA_SETUP_ERR', { error: e.message });
                    if (!res.headersSent) res.writeHead(404);
                    res.end();
                }
            }
        } else {
            res.writeHead(404);
            res.end();
        }
    });

    mediaServer.listen(0, () => {
        log.info('MEDIA_STARTED', { port: mediaServer.address().port });
    });

    return mediaServer;
}

function getServer() {
    return mediaServer;
}


function stop() {
    if (mediaServer) {
        mediaServer.close();
        mediaServer = null;
    }
}

module.exports = {
    start,
    stop,
    getServer,
    getCurrentPath,
    setCurrentPath
};
