import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const client = path.join(root, 'dist/client');
const output = path.join(root, 'dist-static');
const base = process.env.AIRRUN_BASE_PATH || '/';
if (!/^\/(?:[a-zA-Z0-9_-]+\/)*$/.test(base)) throw Error('AIRRUN_BASE_PATH must be a root or slash-delimited project path.');
// Reuse the validated hosting delivery: all 22 aircraft, 403 models and motions.
if (!existsSync(path.join(client, 'models/catalog.json'))) throw Error('Run npm run build before building the standalone site.');
const delivery = JSON.parse(readFileSync(path.join(client, 'models/catalog.json'), 'utf8'));
if (delivery.assets.length !== 403 || !delivery.delivery?.allCollisionModelsPreserved) throw Error('Missing validated model delivery.');
await build({
    configFile: false,
    root: path.join(root, 'standalone'),
    base,
    publicDir: false,
    plugins: [react()],
    resolve: { alias: { 'next/image': path.join(root, 'standalone/image.tsx') } },
    css: { postcss: { plugins: [] } },
    build: { outDir: output, emptyOutDir: true, target: 'es2022' },
});
for (const item of readdirSync(path.join(root, 'public'), { withFileTypes: true })) {
    const built = path.join(client, item.name);
    if (!existsSync(built)) throw Error('Missing public delivery: ' + item.name);
    cpSync(built, path.join(output, item.name), { recursive: true });
}
writeFileSync(path.join(output, '_headers'), '/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n/assets/*\n  Cache-Control: public, max-age=31536000, immutable\n/models/*\n  Cache-Control: public, max-age=3600\n/index.html\n  Cache-Control: no-cache\n');
const files = directory => readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
const all = files(output), largest = Math.max(...all.map(p => statSync(p).size));
if (all.length > 20000 || largest > 25 * 1024 * 1024) throw Error('Cloudflare Pages CLI limits exceeded.');
mkdirSync(path.join(root, 'docs/validation'), { recursive: true });
const report = { version: '12.0.0', type: 'standalone-static', requiresServer: false, basePath: base, files: all.length, bytes: all.reduce((n,p)=>n+statSync(p).size,0), largestFileBytes: largest, models: delivery.assets.length, aircraft: delivery.delivery.highestNativeDetailAircraft, clips: delivery.delivery.clips, cloudflareWranglerLimitsPassed: true, dashboardDragDropSupported: all.length <= 1000 };
writeFileSync(path.join(root, 'docs/validation/static-delivery.json'), JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
