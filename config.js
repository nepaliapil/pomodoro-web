// Login settings for this deployment. Both are public IDs (not secrets), so they are
// safe to keep in this file. The README has step-by-step setup for each one.
window.POMODORO_CONFIG = {
  // "Log in with Spotify": the Client ID of an app from https://developer.spotify.com/dashboard
  // Its Redirect URI must be this site's callback.html, e.g. https://your-site.com/callback.html
  // (for local testing: http://127.0.0.1:8080/callback.html; Spotify does not accept "localhost").
  spotifyClientId: '',

  // "Log in with YouTube": the Client ID of a Google OAuth client of type "Web application",
  // with this site's origin under "Authorized JavaScript origins" and the YouTube Data API v3 enabled.
  // (The desktop app's "Desktop app" client can't be used here: Google rejects that type on websites.)
  googleClientId: '970853278807-gl21cerfa3p1uvp27vvb40lrnah54gjf.apps.googleusercontent.com'
};
