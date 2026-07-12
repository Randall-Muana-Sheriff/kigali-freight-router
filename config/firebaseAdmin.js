import fs from 'fs';
import { cert, initializeApp } from 'firebase-admin/app';
import { appConfig } from './appConfig.js';

// Push notifications are optional. When FIREBASE_SERVICE_ACCOUNT_PATH is
// unset (or the file can't be read), callers get `null` back and should
// treat that as "push sending disabled" rather than crashing the request
// that triggered it (e.g. assigning an order should still succeed even if
// notifying the driver's phone fails).
let app = null;
let initAttempted = false;

export function getFirebaseApp() {
    if (initAttempted) return app;
    initAttempted = true;

    if (!appConfig.firebaseServiceAccountPath) {
        return null;
    }

    try {
        const raw = fs.readFileSync(appConfig.firebaseServiceAccountPath, 'utf8');
        const serviceAccount = JSON.parse(raw);
        app = initializeApp({
            credential: cert(serviceAccount),
        });
        console.log(`🔔 Firebase Admin initialized for project "${serviceAccount.project_id}" — push notifications enabled.`);
    } catch (err) {
        console.error('❌ Failed to initialize Firebase Admin (push notifications disabled):', err.message);
        app = null;
    }

    return app;
}
