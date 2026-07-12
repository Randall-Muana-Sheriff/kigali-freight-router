import { spawn } from 'child_process';
import { appConfig } from '../config/appConfig.js';

const backupFile = process.argv[2];

if (!backupFile) {
  console.error('Usage: node ops/restore-db.js <backup-file>');
  process.exit(1);
}

const child = spawn('pg_restore', [
  '--clean',
  '--if-exists',
  '--no-owner',
  '--no-privileges',
  '--host', appConfig.db.host,
  '--port', String(appConfig.db.port),
  '--username', appConfig.db.user,
  '--dbname', appConfig.db.database,
  backupFile,
], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PGPASSWORD: appConfig.db.password,
  },
});

child.on('exit', (code) => {
  if (code === 0) {
    console.log(`Restored ${backupFile}`);
    return;
  }
  process.exitCode = code || 1;
});
