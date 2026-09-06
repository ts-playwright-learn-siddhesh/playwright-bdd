import path from 'node:path';
import fs from 'node:fs';
import winston from 'winston';
import colors from '@colors/colors/safe';

/**
 * Shared winston logger for the BDD suite.
 *
 * - Console transport: human-readable, colorized via @colors/colors SAFE mode
 *   (no String.prototype pollution). Auto-disables color on non-TTY output.
 * - File transport: one JSON-lines file per run at `<LOG_DIR>/run-<iso>.log`.
 * - Level: `LOG_LEVEL` env wins; otherwise `info` under CI, `debug` locally.
 * - `scenarioLogger(name)` returns a child logger that tags every line with
 *   the scenario name — wired into the Cucumber World as `this.log`.
 *
 * Import the shared `logger` / `scenarioLogger` anywhere; never call
 * `winston.createLogger()` again elsewhere.
 */

const LOG_DIR = process.env.LOG_DIR ?? path.join(process.cwd(), 'logs');
const LOG_LEVEL = process.env.LOG_LEVEL ?? (process.env.CI ? 'info' : 'debug');

if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR, { recursive: true });

const LEVEL_COLORS: Record<string, (s: string) => string> = {
  error: colors.red,
  warn: colors.yellow,
  info: colors.green,
  debug: colors.gray,
};

function findNestedStack(info: Record<string, unknown>): string | undefined {
  for (const value of Object.values(info)) {
    if (value instanceof Error && value.stack) return value.stack;
  }
  return undefined;
}

const consoleFormat = winston.format.printf((info) => {
  const { level, message, timestamp, stack, scenario, ...meta } = info as Record<string, unknown>;
  const colorize = LEVEL_COLORS[level as string] ?? ((s: string) => s);
  const scope = scenario ? colors.cyan(`[${scenario}] `) : '';
  const line = `${colors.gray(String(timestamp))} ${colorize(String(level).toUpperCase())} ${scope}${message}`;
  const effectiveStack = (stack as string | undefined) ?? findNestedStack(meta);
  return effectiveStack ? `${line}\n${colors.gray(effectiveStack)}` : line;
});

// Errors nested in metadata (e.g. logger.error('msg', { err })) don't survive
// JSON.stringify — Error's message/stack aren't own-enumerable. winston's
// format.errors({ stack: true }) only unwraps a *top-level* Error (passed
// directly as the log message), so metadata Errors are converted explicitly
// here via a JSON replacer.
function errorReplacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return { message: value.message, stack: value.stack };
  }
  return value;
}

function buildTransports(runId: string): winston.transport[] {
  return [
    new winston.transports.Console({
      format: consoleFormat,
    }),
    new winston.transports.File({
      filename: path.join(LOG_DIR, `run-${runId}.log`),
      format: winston.format.printf((info) => JSON.stringify(info, errorReplacer)),
    }),
  ];
}

const runId = new Date().toISOString().replace(/[:.]/g, '-');

// format.errors({ stack: true }) MUST be at the top-level createLogger call,
// not per-transport — per-transport-only placement silently drops the
// unwrapped message/stack for a top-level `logger.error(new Error(...))`.
export const logger = winston.createLogger({
  level: LOG_LEVEL,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'HH:mm:ss' }),
    winston.format.errors({ stack: true }),
  ),
  transports: buildTransports(runId),
});

export function scenarioLogger(scenarioName: string): winston.Logger {
  return logger.child({ scenario: scenarioName });
}
