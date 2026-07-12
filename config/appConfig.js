import dotenv from 'dotenv';

dotenv.config();

function required(name) {
    const value = process.env[name];
    if (!value || !String(value).trim()) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return String(value).trim();
}

function optional(name, fallback = '') {
    const value = process.env[name];
    return value === undefined ? fallback : String(value).trim();
}

function parsePort(value, fallback) {
    const parsed = Number.parseInt(value ?? `${fallback}`, 10);
    if (Number.isNaN(parsed) || parsed <= 0 || parsed > 65535) {
        throw new Error(`Invalid port value for ${value ?? fallback}`);
    }
    return parsed;
}

function parseOrigins(value, fallback) {
    return String(value ?? fallback)
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
}

function parseBooleanFlag(value) {
    return String(value ?? '0').trim() === '1';
}

export const appConfig = {
    port: parsePort(process.env.PORT, 5000),
    corsOrigins: parseOrigins(process.env.CORS_ORIGIN, 'http://localhost:5173,http://127.0.0.1:5173'),
    db: {
        user: required('DB_USER'),
        password: required('DB_PASSWORD'),
        host: required('DB_HOST'),
        port: parsePort(process.env.DB_PORT, 5432),
        database: required('DB_DATABASE'),
    },
    jwtSecret: required('JWT_SECRET'),
    simulatorSharedSecret: optional('SIMULATOR_SHARED_SECRET'),
    telegramBotToken: optional('TELEGRAM_BOT_TOKEN'),
    telegramChatId: optional('TELEGRAM_CHAT_ID'),
    alertWebhookUrl: optional('ALERT_WEBHOOK_URL'),
    allowDestructiveBaseline: parseBooleanFlag(process.env.ALLOW_DESTRUCTIVE_BASELINE),
    // Optional: when set, enables horizontal scaling (shared rate-limit state,
    // shared live-fleet/geofence state, a durable telemetry queue, and the
    // Socket.IO cross-instance adapter). Falls back to safe in-process,
    // single-instance behavior when unset (local dev / tests).
    redisUrl: optional('REDIS_URL'),
    // Optional: absolute path to a Firebase service account JSON file. When
    // set, enables server-side push notifications (order assignments, etc.)
    // via Firebase Cloud Messaging. Push sending is a no-op (logged, not
    // fatal) when unset.
    firebaseServiceAccountPath: optional('FIREBASE_SERVICE_ACCOUNT_PATH'),
};
