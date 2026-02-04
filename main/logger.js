const isDev = process.argv.includes('--dev');

const log = (...args) => {
    console.log(...args);
};

const warn = (...args) => {
    console.warn(...args);
};

const error = (...args) => {
    console.error(...args);
};

const info = (...args) => {
    console.info(...args);
};

module.exports = { log, warn, error, info, isDev };
