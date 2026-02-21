const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const log = require('./logger').tagged('Video');

function registerHandlers() {
    ipcMain.handle('get-videos', async (event, folderPath) => {
        if (!folderPath) return [];

        const validExtensions = ['.webp', '.mov', '.avi', '.mp4', '.mkv', '.m4v'];

        try {
            const files = await fs.promises.readdir(folderPath);
            const videos = files.filter(file =>
                validExtensions.includes(path.extname(file).toLowerCase())
            );

            const cachePath = path.join(app.getPath('userData'), 'thumbnail_cache');
            if (!fs.existsSync(cachePath)) fs.mkdirSync(cachePath);

            const videoDataPromises = videos.map(async (videoFile) => {
                const fullVideoPath = path.join(folderPath, videoFile);
                const thumbnailFileName = `${path.basename(videoFile, path.extname(videoFile))}.png`;
                const thumbnailPath = path.join(cachePath, thumbnailFileName);

                let thumbnailData = null;

                if (!fs.existsSync(thumbnailPath)) {
                    try {
                        await new Promise((resolve) => {
                            ffmpeg(fullVideoPath)
                                .on('end', resolve)
                                .on('error', (err) => {
                                    log.error("\x1b[33m%s\x1B[0m",
                                        `[AVERTISSEMENT MINIATURE] échec pour ${videoFile}: ${err.message}`);
                                    resolve();
                                })
                                .screenshots({
                                    timestamps: ['00:00:02'],
                                    filename: thumbnailFileName,
                                    folder: cachePath,
                                    size: '320x180'
                                });
                        });
                    } catch (e) {
                        log.error("\x1b[33m%s\x1b[0m",
                            `[AVERTISSEMENT MINIATURE MAJEUR] échec total pour ${videoFile}`);
                    }
                }

                if (fs.existsSync(thumbnailPath)) {
                    try {
                        thumbnailData = await fs.promises.readFile(thumbnailPath, 'base64');
                    } catch (e) {
                        thumbnailData = null;
                    }
                }

                const placeholderSvgBase64 = 'PHN2ZyB3aWR0aD0zMjAiIGhlaWdodD0xODAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgZmlsbD0iIzMzMyIvPjx0ZXh0IHg9IjUwJSIgeT0iNTAlIiBkb21pbmFudC1iYXNlbGluZT0ibWlkZGxlIiB0ZXh0LWFuY2hvcj0ibWlkZGxlIiBmb250LXNpemU9IjI0cHgiIGZpbGw9IiNmZmYiPlYgSUQnIEhBUyBUX0gVTlRTVlJPIFNWIi8+PC9zdmc+';

                const finalThumbnailData = thumbnailData
                    ? `data:image/png;base64,${thumbnailData}`
                    : `data:image/svg+xml;base64,${placeholderSvgBase64}`;

                return {
                    fileName: videoFile,
                    videoPath: fullVideoPath,
                    thumbnailData: finalThumbnailData
                };
            });

            const results = await Promise.allSettled(videoDataPromises);
            const successfulVideos = [];

            results.forEach(result => {
                if (result.status === 'fulfilled' && result.value) {
                    successfulVideos.push(result.value);
                } else if (result.status === 'rejected') {
                    log.error("\x1b[31m%s\x1b[0m", `[ERREUR MINIATURE] ${result.reason}`);
                }
            });

            return successfulVideos;

        } catch (error) {
            log.error("\x1b[31m%s\x1b[0m", "[ERREUR MAJEURE] dans get-videos:", error);
            return { error: error.message };
        }
    });
}

module.exports = { registerHandlers };
