import pool from '../config/db.js';
import { getFirebaseApp } from '../config/firebaseAdmin.js';
import { getMessaging } from 'firebase-admin/messaging';

// FCM error codes that mean "this token will never work again" — safe to
// delete from the DB so we stop trying it. Other errors (rate limits,
// transient network issues) are logged but the token is kept.
const UNREGISTERED_ERROR_CODES = new Set([
    'messaging/registration-token-not-registered',
    'messaging/invalid-registration-token',
]);

export async function registerPushToken(username, fcmToken, platform = 'unknown') {
    if (!username || !fcmToken) return;
    await pool.query(
        `INSERT INTO push_tokens (username, fcm_token, platform, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (fcm_token)
         DO UPDATE SET username = EXCLUDED.username, platform = EXCLUDED.platform, updated_at = NOW()`,
        [username, fcmToken, platform]
    );
}

async function removeTokens(tokens) {
    if (tokens.length === 0) return;
    await pool.query('DELETE FROM push_tokens WHERE fcm_token = ANY($1)', [tokens]);
}

// Sends a push notification to every device registered for `username`.
// Best-effort: failures are logged, never thrown, so a notification problem
// never breaks the request that triggered it (e.g. assigning an order).
export async function sendPushToUser(username, { title, body, data = {} } = {}) {
    if (!username) return;

    const app = getFirebaseApp();
    if (!app) return; // Push notifications disabled (no service account configured).

    try {
        const result = await pool.query('SELECT fcm_token FROM push_tokens WHERE username = $1', [username]);
        const tokens = result.rows.map((row) => row.fcm_token);
        if (tokens.length === 0) return;

        const messaging = getMessaging(app);
        const response = await messaging.sendEachForMulticast({
            tokens,
            notification: { title, body },
            data: Object.fromEntries(Object.entries(data).map(([key, value]) => [key, String(value)])),
            android: { priority: 'high' },
        });

        const deadTokens = [];
        response.responses.forEach((res, index) => {
            if (!res.success && UNREGISTERED_ERROR_CODES.has(res.error?.code)) {
                deadTokens.push(tokens[index]);
            } else if (!res.success) {
                console.error(`❌ Push send failed for ${username}:`, res.error?.message);
            }
        });
        await removeTokens(deadTokens);
    } catch (err) {
        console.error(`❌ Push notification failed for ${username}:`, err.message);
    }
}
