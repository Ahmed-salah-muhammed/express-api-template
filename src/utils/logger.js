import { env } from "../config/env.js";

// A level and a timestamp on every line, and nothing else: swap this file for pino or
// winston the day the logs need to go somewhere other than stdout.
const LEVELS = { silent: 0, error: 1, warn: 2, info: 3 };
const threshold = LEVELS[env.logLevel] ?? LEVELS.info;

const write = (level, stream) => (...parts) => {
    if (LEVELS[level] > threshold) return;
    stream(`${new Date().toISOString()} ${level.toUpperCase().padEnd(5)}`, ...parts);
};

export const logger = {
    error: write("error", console.error),
    warn: write("warn", console.warn),
    info: write("info", console.log),
};
