# Publish Music Utilities on GitHub Pages

1. Upload the CONTENTS of this folder to the repository root (not the enclosing folder).
2. In repository Settings > Pages, choose Deploy from a branch, main, / (root), Save.
3. If the repo is private and your plan does not support Pages for private repos, change visibility to public after reviewing files.
4. Open the deployed HTTPS site and select Spotify Setlist Builder > Spotify connection.
5. Copy the exact Redirect URI shown and add it in Spotify Developer Dashboard for your app. Never publish a Spotify Client Secret.
6. Enter the Client ID and connect; verify search and playlist creation on iPad and Mac.

GitHub Pages cannot host a server-side Spotify client secret. This app uses browser-based PKCE.
