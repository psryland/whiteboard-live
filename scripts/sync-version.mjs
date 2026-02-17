// Syncs the version from package.json into appPackage/manifest.json
// and rebuilds the Teams zip. Run via: node scripts/sync-version.mjs
import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(resolve(root, 'package.json'), 'utf-8'));
const manifest_path = resolve(root, 'appPackage', 'manifest.json');
const manifest = JSON.parse(readFileSync(manifest_path, 'utf-8'));

if (manifest.version !== pkg.version) {
	console.log(`Updating manifest version: ${manifest.version} → ${pkg.version}`);
	manifest.version = pkg.version;
	writeFileSync(manifest_path, JSON.stringify(manifest, null, '\t') + '\n');
} else {
	console.log(`Manifest version already matches: ${pkg.version}`);
}

// Rebuild the Teams zip
const zip_path = resolve(root, 'whiteboard-live-teams.zip');
try {
	execSync(`powershell -Command "Remove-Item -Force '${zip_path}' -ErrorAction SilentlyContinue; Compress-Archive -Path '${resolve(root, 'appPackage')}\\*' -DestinationPath '${zip_path}' -Force"`, { stdio: 'inherit' });
	console.log(`Teams zip rebuilt: whiteboard-live-teams.zip`);
} catch (e) {
	console.error('Failed to rebuild Teams zip:', e.message);
	process.exit(1);
}
