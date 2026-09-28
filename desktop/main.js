// Pomodoro desktop app: the web app (copied into ./web at build time) in its own window.
const { app, BrowserWindow, Menu, shell, nativeTheme, dialog } = require('electron');
const http = require('http');
const path = require('path');
const fs = require('fs');

// Keep this app's data apart from the older 1.x desktop app, which used the "Pomodoro" folder.
app.setPath('userData', path.join(app.getPath('appData'), 'pomodoro-desktop'));
app.setAppUserModelId('com.nepaliapil.pomodoro');    // Windows notifications and taskbar grouping

if (!app.requestSingleInstanceLock()) app.quit();    // one window at a time

// ---------------------------------------------------------------------------
// Local page server. The page is served over http://127.0.0.1 rather than file:// because
// YouTube's embedded player refuses pages without a real origin ("Error 153"), and Google
// and Spotify sign-in need one too. The port is FIXED: saved data (tasks, history) belongs
// to the page's origin, so a port that changed every launch would lose it each restart.
// Loopback only, and it only ever serves the app's own bundled files.
// ---------------------------------------------------------------------------
const PORT = 47821;
const ORIGIN = 'http://127.0.0.1:' + PORT;
const WEB = path.join(__dirname, 'web');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.webmanifest': 'application/manifest+json', '.json': 'application/json'
};

function startServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      let rel;
      try { rel = decodeURIComponent(new URL(req.url, ORIGIN).pathname); } catch (e) { res.writeHead(400); return res.end(); }
      if (rel === '/') rel = '/index.html';
      const full = path.normalize(path.join(WEB, rel));
      if (!full.startsWith(WEB + path.sep)) { res.writeHead(403); return res.end(); }   // no ../ escapes
      fs.readFile(full, (err, data) => {
        if (err) { res.writeHead(404); return res.end('Not found'); }
        res.writeHead(200, {
          'Content-Type': MIME[path.extname(full)] || 'application/octet-stream',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Cache-Control': 'no-cache'
        });
        res.end(data);
      });
    });
    server.on('error', reject);
    server.listen(PORT, '127.0.0.1', resolve);
  });
}

// Sign-in popups must open inside the app (they report back to the page that opened them).
// Everything else, like "Find playlists", opens in the normal browser.
const AUTH_HOSTS = ['accounts.google.com', 'accounts.spotify.com'];
function hostOf(url) { try { return new URL(url).hostname; } catch (e) { return ''; } }
function openOutside(url) { if (/^https?:\/\//i.test(url)) shell.openExternal(url); }

let win = null;

async function createWindow() {
  try {
    await startServer();
  } catch (e) {
    dialog.showErrorBox('Pomodoro could not start',
      'Port ' + PORT + ' is already in use by another program. Close it and open Pomodoro again.\n\n' + e.message);
    app.quit();
    return;
  }

  win = new BrowserWindow({
    width: 1120,
    height: 820,
    minWidth: 380,
    minHeight: 560,
    title: 'Pomodoro',
    icon: path.join(WEB, 'icon-512.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0E1215' : '#F5F6F8',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,                     // keep the timer exact while minimized
      autoplayPolicy: 'no-user-gesture-required'       // lets music start with the timer
    }
  });
  Menu.setApplicationMenu(null);

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url === 'about:blank' || AUTH_HOSTS.includes(hostOf(url))) {
      return { action: 'allow', overrideBrowserWindowOptions: { width: 500, height: 720, autoHideMenuBar: true } };
    }
    openOutside(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(ORIGIN)) { event.preventDefault(); openOutside(url); }
  });

  win.loadURL(ORIGIN + '/');
  win.on('closed', () => { win = null; });
}

app.on('second-instance', () => {
  if (win) { if (win.isMinimized()) win.restore(); win.focus(); }
});
app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
