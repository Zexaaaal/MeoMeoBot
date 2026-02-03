const isDev = process.argv.includes('--dev');

const log = (...args) => {
    if (isDev) console.log(...args);
};

const warn = (...args) => {
    if (isDev) console.warn(...args);
};

const error = (...args) => {
    console.error(...args);
};

const info = (...args) => {
    if (isDev) console.info(...args);
};

module.exports = { log, warn, error, info, isDev };
