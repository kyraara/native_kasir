// npm run package              → deploy/native-motor-deploy.zip (siap diunggah ke cPanel)
// npm run package -- --with-vision  → sertakan model kemiripan foto lokal (butuh ±450 MB disk & ±1 GB RAM)
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const withVision = process.argv.includes('--with-vision');
const root = process.cwd();
const stage = path.join(root, 'deploy', 'native-motor');
const zip = path.join(root, 'deploy', 'native-motor-deploy.zip');

const run = (cmd) => execSync(cmd, { stdio: 'inherit' });

console.log('▶ Build frontend & server…');
run('npm run build');

fs.rmSync(path.join(root, 'deploy'), { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true });

const copy = (rel) => fs.cpSync(path.join(root, rel), path.join(stage, rel), { recursive: true });
['dist', 'build', 'db', 'app.cjs', '.env.example', 'README.md', 'DEPLOY-CPANEL.md'].forEach(copy);
fs.rmSync(path.join(stage, 'build', 'server.mjs.map'), { force: true });
fs.rmSync(path.join(stage, 'build', 'db.mjs.map'), { force: true });

const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const pick = (names) => Object.fromEntries(names.map((n) => [n, pkg.dependencies[n]]));
const deps = pick(['express', 'mysql2', 'dotenv', '@google/genai', 'sharp']);
if (withVision) deps['@huggingface/transformers'] = pkg.dependencies['@huggingface/transformers'];

const hostingPkg = {
  name: 'native-motor',
  version: pkg.version === '0.0.0' ? '1.0.0' : pkg.version,
  private: true,
  type: 'module',
  main: 'app.cjs',
  engines: { node: '>=18' },
  scripts: {
    start: 'node app.cjs',
    'db:migrate': 'node build/db.mjs migrate',
    'db:wipe': 'node build/db.mjs wipe',
    'db:seed': 'node build/db.mjs seed',
  },
  dependencies: deps,
};
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify(hostingPkg, null, 2) + '\n');

console.log('▶ Membuat zip…');
fs.mkdirSync(path.dirname(zip), { recursive: true });
// tar bawaan Windows 10+/Linux/macOS bisa membuat .zip dengan -a
// (di Windows pakai tar.exe bawaan sistem; tar versi Git Bash salah membaca "D:" sebagai nama host)
const tar = process.platform === 'win32' ? `"${path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe')}"` : 'tar';
run(`${tar} -a -c -f "${zip}" -C "${stage}" .`);

const size = (fs.statSync(zip).size / 1024 / 1024).toFixed(1);
console.log(`\n✓ Paket deploy: ${path.relative(root, zip)} (${size} MB)`);
console.log(`  Dependensi hosting: ${Object.keys(deps).join(', ')}`);
if (!withVision) console.log('  Kemiripan foto lokal TIDAK disertakan (isi VISION_ENABLED=false di .env hosting).');
