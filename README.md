# Pomodoro (web)

The web version of the Pomodoro desktop app (v1.4.1). It is plain HTML, CSS and JavaScript,
with no framework, no build step and no dependencies. It is also an installable PWA that works offline.

## Install it as a desktop or phone app

Open https://nepaliapil.github.io/pomodoro-web/ and click **Install app** in the header.

- **Chrome or Edge** (Windows, Mac, Linux, Chromebook, Android): the browser's install dialog opens. The app gets
  its own window and a Start menu / Dock / home screen icon.
- **iPhone and iPad (Safari):** Share button, then **Add to Home Screen**.
- **Mac Safari 17+:** **File → Add to Dock**.

The installed app works offline and updates itself whenever a new version is published.

## Windows desktop installer

The `desktop/` folder packages the same web app with Electron into a Windows installer.

```bash
cd desktop
npm install
npm run dist
```

The installer appears at `desktop/dist/Pomodoro-Setup-<version>.exe`. Use `npm start` to try the app without
installing it. Bump `version` in `desktop/package.json` for each new release.

The desktop app serves its page from `http://127.0.0.1:47821`. The port is fixed so saved data survives restarts.
For logins inside the desktop app, add `http://127.0.0.1:47821` to the Google client's Authorized JavaScript origins,
and `http://127.0.0.1:47821/callback.html` to the Spotify app's Redirect URIs.

## Run it locally

```bash
npx http-server . -p 8080 -c-1
```

Then open http://localhost:8080. You can also double-click `index.html`, but offline
support and "Install app" need it served over http(s).

## Deploy

Upload the folder as-is to any static host (GitHub Pages, Netlify, Vercel, Cloudflare Pages).
It must be served over HTTPS for the service worker, notifications and installing to work.

**GitHub Pages:** in this repo go to **Settings → Pages**, set **Source** to *Deploy from a branch*,
pick `main` and `/ (root)`, and save. The site appears at `https://<user>.github.io/pomodoro-web/`.
Then add `https://<user>.github.io` to the Google client's Authorized JavaScript origins, and
`https://<user>.github.io/pomodoro-web/callback.html` to the Spotify app's Redirect URIs.

## Set up the logins

Both logins need a public Client ID in `config.js`. Neither uses a client secret.

### YouTube (Google)

The desktop app's Client ID is a "Desktop app" type, and Google blocks that type on websites.
Make a second client in the same Google Cloud project:

1. Open https://console.cloud.google.com/apis/credentials and select the Pomodoro project.
2. Click **Create credentials → OAuth client ID**. For **Application type**, choose **Web application**.
3. Under **Authorized JavaScript origins**, add every address you open the app from:
   `http://localhost:8080`, `http://127.0.0.1:8080`, and your real site (for example `https://pomodoro.example.com`).
   Leave **Authorized redirect URIs** empty.
4. Click **Create**, then copy the Client ID into `googleClientId` in `config.js`.

The YouTube Data API and the consent screen are already set up in that project for the desktop app.
While the consent screen is in "Testing" mode, only Google accounts listed under **Test users** can log in.

### Spotify

1. Open https://developer.spotify.com/dashboard and click **Create app**.
2. Under **Redirect URIs**, add `http://127.0.0.1:8080/callback.html` for local use (Spotify does not accept `localhost`),
   plus `https://<your-site>/callback.html` once the app is online. Under **APIs used**, tick **Web API**.
3. Save, then copy the **Client ID** into `spotifyClientId` in `config.js`.

A new Spotify app starts in Development mode, where only accounts added under **User Management** can log in.
Locally, open the app at **http://127.0.0.1:8080**, because Spotify sends you back there after login.
That address keeps separate data from `localhost:8080`, so use **Settings → Download backup / Restore backup** to move your data between them.

## Files

| File | What it is |
| --- | --- |
| `index.html` | Page markup (same views as the desktop app) |
| `styles.css` | Styles, including light and dark themes |
| `app.js` | All app logic |
| `config.js` | Spotify and Google Client IDs for the logins |
| `callback.html` | Where Spotify sends the login popup back to |
| `sw.js` | Service worker: offline cache and notification clicks |
| `manifest.webmanifest` | PWA metadata |
| `icon.svg` | App icon (favicon, install icon, notifications) |

## What changed from the desktop app

| Desktop (Electron) | Web |
| --- | --- |
| Local 127.0.0.1 server so YouTube embeds get a referrer | Not needed: a real web origin already sends one |
| YouTube sign-in through a loopback server with a client secret, refresh token encrypted on disk | Google Identity Services token flow in the browser. It needs no secret. The token lasts one hour and is kept in sessionStorage |
| `backgroundThrottling: false` keeps the timer accurate | Ticks come from a Web Worker, which background tabs don't throttle |
| Notifications allowed automatically | Opt-in checkbox in Settings. The browser asks for permission |
| Single-instance lock | A banner appears if the app is open in two tabs |
| — | The running timer survives a reload or closing the tab |
| — | Backup and restore as JSON, plus importing the history CSV |
| Window and taskbar | Installable PWA with its own window, offline support |

Data uses the same `pomodoro-v2` localStorage format as the desktop app, so backups work in both.
