import fs from 'fs';
import { spawn } from 'child_process';

const backupFile = process.argv[2];

if (!backupFile) {
    console.error('Usage: node ops/verify-backup.js <backup-file>');
    process.exit(1);
}

if (!fs.existsSync(backupFile)) {
    console.error(`Backup file not found: ${backupFile}`);
    process.exit(1);
}

const child = spawn('pg_restore', ['--list', backupFile], { stdio: 'inherit' });

child.on('exit', (code) => {
    if (code === 0) {
        console.log(`Backup verified: ${backupFile}`);
        return;
    }
    process.exitCode = code || 1;
});
