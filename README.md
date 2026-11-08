# Music Utilities

A collection of browser-based music tools for Mac and iPad.

## Applications

| Application | Version | Folder | Launch |
| --- | --- | --- | --- |
| Jazz Chart Studio | **0.7.0** | `jazz-chart-studio/` | [Open Jazz Chart Studio](./jazz-chart-studio/index.html) |
| Spotify Setlist Builder | **0.1** | `spotify-setlist-builder/` | [Open Spotify Setlist Builder](./spotify-setlist-builder/index.html) |

Open [Music Utilities](https://danfoley.github.io/music-utilties/) to choose an application. Each app has a navigation menu to return home or switch apps.

## Versioning

Each application has its own version number, maintained in the app and in `music-utilities-manifest.json`. Folder names stay stable when an app's version changes. Git commit history preserves older versions; no separate versioned folders are required.

## Deployment

The static apps are published from the repository's `main` branch using GitHub Pages. Spotify Setlist Builder uses Authorization Code with PKCE; register the exact HTTPS URL of `spotify-setlist-builder/index.html` as a Spotify redirect URI.

## Storage

GitHub contains the current application source. Project backups and master packages belong in Google Drive `/ChatGPT/Apps/`.
