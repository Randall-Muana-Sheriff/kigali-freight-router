import fs from 'fs';
import path from 'path';

const targetDir = process.argv[2] || 'backups';
const retentionDays = Number.parseInt(process.argv[3] || '14', 10);

if (!fs.existsSync(targetDir)) {
    console.log(`No backup directory found at ${targetDir}`);
    process.exit(0);
}

const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
const cutoff = Date.now() - retentionMs;
const removed = [];

for (const entry of fs.readdirSync(targetDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue;

    const filePath = path.join(targetDir, entry.name);
    const stat = fs.statSync(filePath);
    if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
        removed.push(entry.name);
    }
}

console.log(JSON.stringify({
    targetDir,
    retentionDays,
    removedCount: removed.length,
    removed,
}));
