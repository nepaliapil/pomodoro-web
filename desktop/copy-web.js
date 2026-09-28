// Copies the web app from the project root into desktop/web before packaging,
// and the app icon into desktop/build for the installer.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FILES = [
  'index.html', 'styles.css', 'app.js', 'config.js', 'callback.html', 'sw.js',
  'manifest.webmanifest', 'icon.svg', 'icon-192.png', 'icon-512.png', 'apple-touch-icon.png'
];

const web = path.join(__dirname, 'web');
fs.rmSync(web, { recursive: true, force: true });
fs.mkdirSync(web, { recursive: true });
for (const f of FILES) fs.copyFileSync(path.join(ROOT, f), path.join(web, f));

fs.mkdirSync(path.join(__dirname, 'build'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'icon-512.png'), path.join(__dirname, 'build', 'icon.png'));

console.log('Copied ' + FILES.length + ' web files into desktop/web');
