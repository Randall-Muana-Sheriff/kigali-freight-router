import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { appConfig } from '../config/appConfig.js';

const outputDir = process.argv[2] || 'backups';
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const outputPath = path.resolve(outputDir, `${appConfig.db.database}-${timestamp}.dump`);

fs.mkdirSync(path.dirname(outputPath), { recursive: true });

const child = spawn('pg_dump', [
  '--format=custom',
  '--no-owner',
  '--no-privileges',
  '--host', appConfig.db.host,
  '--port', String(appConfig.db.port),
  '--username', appConfig.db.user,
  '--file', outputPath,
  appConfig.db.database,
], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PGPASSWORD: appConfig.db.password,
  },
});

child.on('exit', (code) => {
  if (code === 0) {
    console.log(`Backup written to ${outputPath}`);
    return;
  }
  process.exitCode = code || 1;
});
