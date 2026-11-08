(() => {
        "use strict";
        const $ = (id) => document.getElementById(id),
          htmlEsc = (s) =>
            String(s ?? "").replace(
              /[&<>"']/g,
              (c) =>
                ({
                  "&": "&amp;",
                  "<": "&lt;",
                  ">": "&gt;",
                  '"': "&quot;",
                  "'": "&#39;",
                })[c],
            );

        const DEBUG_STORE = "setlist_debug_enabled_v1";
        let debugOn = localStorage.getItem(DEBUG_STORE) === "true",
          debugEntries = [],
          debugHandle = null,
          debugWrite = Promise.resolve();
        function scrubLog(v) {
          let s = String(v ?? "");
          s = s
            .replace(/(Bearer\s+)[^\s"'<>]+/gi, "$1[REDACTED]")
            .replace(
              /((?:access_token|refresh_token|client_secret|code_verifier|code_challenge|client_id|authorization|state|code)=)[^&\s"'<>]+/gi,
              "$1[REDACTED]",
            )
            .replace(
              /("(?:access_token|refresh_token|client_secret|code_verifier|code_challenge|client_id|authorization|state|code)"\s*:\s*")[^"]+/gi,
              "$1[REDACTED]",
            )
            .replace(
              /([?&](?:code|state|client_id|code_challenge)=)[^&\s]+/gi,
              "$1[REDACTED]",
            );
          return s.slice(0, 1600);
        }
        function logEvent(type, detail = "") {
          if (!debugOn) return;
          const entry = {
            at: new Date().toISOString(),
            type: scrubLog(type),
            detail: scrubLog(detail),
          };
          debugEntries.push(entry);
          if (debugEntries.length > 2500) debugEntries.shift();
          const preview = document.getElementById("debugPreview");
          if (preview)
            preview.textContent = debugEntries
              .slice(-12)
              .map((x) => `${x.at} ${x.type} ${x.detail}`)
              .join("\n");
          if (debugHandle) queueDebugWrite();
        }
        function debugText() {
          return (
            "# Spotify Setlist Builder diagnostics\n# Tokens, authorization codes and client IDs intentionally omitted\n" +
            debugEntries.map((e) => JSON.stringify(e)).join("\n") +
            "\n"
          );
        }
        function queueDebugWrite() {
          debugWrite = debugWrite
            .then(async () => {
              if (!debugHandle) return;
              const writable = await debugHandle.createWritable();
              await writable.write(debugText());
              await writable.close();
            })
            .catch((e) => {
              debugHandle = null;
              const x = document.getElementById("debugStatus");
              if (x)
                x.textContent =
                  "Automatic file writing stopped: " +
                  e.message +
                  ". Use Download log.";
            });
        }
        function refreshDebug() {
          const t = document.getElementById("debugToggle"),
            status = document.getElementById("debugStatus");
          if (t)
            t.textContent = debugOn
              ? "Disable debug logging"
              : "Enable debug logging";
          if (status)
            status.textContent = debugOn
              ? debugHandle
                ? "Logging enabled — automatically writing to selected file"
                : "Logging enabled — choose Save log file for continuous local writing"
              : "Debug mode off";
        }
        async function saveDebugFile() {
          if (!debugOn) {
            debugOn = true;
            localStorage.setItem(DEBUG_STORE, "true");
          }
          if (window.showSaveFilePicker) {
            try {
              debugHandle = await showSaveFilePicker({
                suggestedName: "spotify-setlist-debug.log",
                types: [
                  {
                    description: "Log file",
                    accept: { "text/plain": [".log", ".txt"] },
                  },
                ],
              });
              logEvent("debug", "file selected");
              queueDebugWrite();
              refreshDebug();
              return;
            } catch (e) {
              if (e.name === "AbortError") return;
              logEvent("debug-file-error", e.message);
            }
          }
          downloadDebug();
          refreshDebug();
        }
        function downloadDebug() {
          const blob = new Blob([debugText()], { type: "text/plain" }),
            url = URL.createObjectURL(blob),
            a = document.createElement("a");
          a.href = url;
          a.download = "spotify-setlist-debug.log";
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 2000);
        }
        window.addEventListener("error", (e) =>
          logEvent(
            "javascript-error",
            `${e.message} at ${e.filename?.split("/").pop()}:${e.lineno}`,
          ),
        );
        window.addEventListener("unhandledrejection", (e) =>
          logEvent("promise-error", e.reason?.message || String(e.reason)),
        );

        const STORE = "setlist_studio_v1",
          TOKEN = "setlist_spotify_token_v1",
          PKCE = "setlist_pkce_v1";
        let app = {
          raw: "",
          songs: [],
          selected: {},
          index: 0,
          stage: 0,
          clientId: "",
          susanTracks: [],
          susanNames: [],
          susanLoaded: false,
          playlistName: "",
        };
        let token = null,
          results = [],
          candidate = null,
          view = "main",
          busy = false,
          searchSerial = 0;
        function save() {
          localStorage.setItem(
            STORE,
            JSON.stringify({
              ...app,
              susanTracks: [],
              susanLoaded: false,
              susanNames: [],
            }),
          );
        }
        function restore() {
          try {
            let o = JSON.parse(localStorage.getItem(STORE) || "null");
            if (o && Array.isArray(o.songs))
              app = {
                ...app,
                ...o,
                susanTracks: [],
                susanLoaded: false,
                susanNames: [],
              };
            token = JSON.parse(sessionStorage.getItem(TOKEN) || "null");
          } catch {}
        }
        function flash(t, type = "warning") {
          let d = document.createElement("div");
          d.className = "notice " + type;
          d.textContent = t;
          $("messages").replaceChildren(d);
          window.scrollTo({ top: 0, behavior: "smooth" });
          if (type === "success")
            setTimeout(() => {
              if (d.isConnected) d.remove();
            }, 7000);
        }
        function clearFlash() {
          $("messages").replaceChildren();
        }
        const { parse, rank } = window.SpotifySetlistCore;
        const trackArtist = (t) =>
            (t.artists || []).map((x) => x.name).join(", "),
          trackUrl = (t) =>
            t.external_urls?.spotify ||
            "https://open.spotify.com/track/" + encodeURIComponent(t.id),
          trackUri = (t) => t.uri || "spotify:track:" + t.id;
        function showStage(stage) {
          logEvent("navigation", `stage=${stage} songIndex=${app.index}`);
          app.stage = stage;
          save();
          view = "main";
          ["setupPanel", "matchPanel", "reviewPanel", "settingsPanel"].forEach(
            (id, i) => $(id).classList.toggle("hidden", i !== stage),
          );
          document
            .querySelectorAll(".step")
            .forEach((el) =>
              el.classList.toggle("active", +el.dataset.step === stage),
            );
          $("sideCount").textContent = app.songs.length
            ? `${Object.values(app.selected).filter((x) => x && x !== "skip").length} selected of ${app.songs.length} songs`
            : "Paste a list to begin";
          $("sideProgress").style.width =
            (app.songs.length
              ? (100 * Object.keys(app.selected).length) / app.songs.length
              : 0) + "%";
          if (stage === 1) renderSong();
          if (stage === 2) renderReview();
        }
        function showSettings() {
          logEvent("navigation", "settings");
          view = "settings";
          ["setupPanel", "matchPanel", "reviewPanel"].forEach((id) =>
            $(id).classList.add("hidden"),
          );
          $("settingsPanel").classList.remove("hidden");
          $("clientId").value = app.clientId;
          $("redirectUri").value = redirectUri();
          $("modeNotice").textContent = isLocalServer()
            ? "This page is running from an HTTPS website or a supported local server. Register the exact redirect URI below, then connect."
            : "You opened the HTML file directly. All offline features work, but Spotify sign-in requires HTTPS hosting or the included Mac launcher (http://127.0.0.1).";
          $("susanStatus").textContent = app.susanLoaded
            ? `${app.susanNames.length} Susan playlists indexed; ${app.susanTracks.length} tracks`
            : "Susan playlists will be indexed when connected.";
        }
        function isLocalServer() {
          return (
            location.protocol === "https:" ||
            (location.protocol === "http:" &&
              ["127.0.0.1", "[::1]"].includes(location.hostname))
          );
        }
        function redirectUri() {
          return isLocalServer()
            ? location.origin + location.pathname
            : "http://127.0.0.1:8765/spotify-setlist-builder/index.html";
        }
        function setBadge() {
          const c = !!token?.access_token;
          $("headerConnectBtn").className = "status" + (c ? " connected" : "");
          $("headerConnectBtn").lastElementChild.textContent = c
            ? "Spotify connected · Test"
            : "Spotify disconnected · Connect";
          $("connectPrompt").classList.toggle("hidden", c);
          $("connectionDetail").textContent = c
            ? "Spotify authorization saved. Click Test Spotify connection to verify account access."
            : "Not connected. Follow the setup instructions below, then test the connection.";
        }
        async function testConnection() {
          logEvent("connection-test", "started");
          $("connectionDetail").textContent =
            "Checking Spotify account access…";
          if (!token) {
            setBadge();
            flash(
              "Not connected. Enter your Client ID and choose Connect with Spotify.",
              "warning",
            );
            return;
          }
          try {
            const me = await api("/me");
            $("connectionDetail").textContent =
              "Connected as " +
              (me.display_name || me.id) +
              " (" +
              me.id +
              "). Spotify API verified.";
            setBadge();
            $("connectionDetail").textContent =
              "✓ Spotify API verified. Signed in as " +
              (me.display_name || me.id) +
              ".";
            logEvent("connection-test", "passed");
            flash("Spotify connection verified.", "success");
          } catch (e) {
            $("connectionDetail").textContent =
              "Connection test failed: " + e.message;
            logEvent("connection-test", "failed: " + e.message);
            flash("Spotify connection test failed: " + e.message, "error");
          }
        }
        function renderPreview() {
          let p = parse($("setlistText").value);
          $("parsedPreview").classList.remove("hidden");
          $("parsedCount").textContent = `${p.main} main · ${p.extras} extras`;
          $("parsedItems").innerHTML =
            p.songs
              .map(
                (s, i) =>
                  `<div class="item"><span class="muted">${i + 1}.</span><span>${htmlEsc(s.title)}</span>${s.extra ? '<span class="pill">Extra</span>' : ""}</div>`,
              )
              .join("") || "<p>No songs found</p>";
          $("startBtn").disabled = !p.songs.length;
          return p;
        }
        function current() {
          return app.songs[app.index];
        }
        function renderSong() {
          searchSerial++;
          busy = false;
          $("searchBtn").disabled = false;
          $("searchBtn").textContent = "Search Spotify";
          const song = current();
          if (!song) return showStage(2);
          $("songPosition").textContent =
            `Song ${app.index + 1} of ${app.songs.length}`;
          $("currentSongTitle").textContent = song.title;
          $("currentSongSubtitle").textContent = song.extra
            ? "Extra · appended at end of set list"
            : "Select a recording, or skip this song.";
          $("matchProgress").style.width =
            (100 * (app.index + 1)) / app.songs.length + "%";
          $("searchTerm").value = song.title;
          $("manualLink").value = "";
          results = [];
          candidate = app.selected[app.index] || null;
          $("backSongBtn").disabled = app.index === 0;
          $("nextSongBtn").disabled = !(candidate && candidate !== "skip");
          $("nextSongBtn").textContent =
            app.index === app.songs.length - 1
              ? "Confirm & review →"
              : "Use this recording →";
          $("matchSource").textContent = token
            ? "Live Spotify"
            : "Spotify disconnected";
          $("resultsNote").textContent = token
            ? "Press Search to query Spotify."
            : "Connect Spotify to search for recordings.";
          $("results").replaceChildren();
          if (candidate === "skip") {
            $("resultsNote").textContent =
              "Previously skipped. Search to choose a recording, or skip again.";
          }
          // Wait for the user to search; never populate recordings from a built-in catalog.
        }
        function renderResults() {
          let root = $("results");
          root.replaceChildren();
          let sorted = [...results].sort(
            (a, b) =>
              rank(b, $("searchTerm").value) - rank(a, $("searchTerm").value),
          );
          $("resultsNote").textContent = sorted.length
            ? `${sorted.length} matching recordings · Spotify search`
            : "No matching recordings. Try another artist, title or Spotify track URL.";
          for (const t of sorted) {
            const selected = candidate && candidate.id === t.id;
            const div = document.createElement("div");
            div.className = "result" + (selected ? " selected" : "");
            let img = t.album?.images?.[0]?.url;
            div.innerHTML = `<span class="radio" aria-hidden="true"></span>${img ? `<img alt="" src="${htmlEsc(img)}">` : '<div style="width:58px;height:58px;background:#2c3d49;display:grid;place-items:center;border-radius:7px">♫</div>'}<div class="info"><div class="title">${htmlEsc(t.name)}</div><div>${htmlEsc(trackArtist(t))}</div><div class="meta">${htmlEsc(t.album?.name || "")}</div>${t.susanNames?.length ? `<div class="tag">★ Susan: ${htmlEsc(t.susanNames.join(", "))}</div>` : ""}</div>`;
            div.onclick = () => {
              candidate = t;
              $("nextSongBtn").disabled = false;
              renderResults();
            };
            let a = document.createElement("a");
            a.href = trackUrl(t);
            a.target = "_blank";
            a.rel = "noopener noreferrer";
            a.className = "btn sm ghost";
            a.textContent = "Listen on Spotify ↗";
            a.onclick = (e) => e.stopPropagation();
            div.append(a);
            root.append(div);
          }
        }
        async function searchTracks(term, initial = false) {
          logEvent(
            "search",
            `song=${app.index + 1} query=${term}; Spotify limit=10`,
          );
          const request = ++searchSerial,
            songIndex = app.index;
          busy = true;
          $("searchBtn").disabled = true;
          $("searchBtn").innerHTML = '<span class="loading"></span> Searching';
          $("resultsNote").textContent = token
            ? "Searching Spotify catalog…"
            : "Connect Spotify to search for recordings.";
          try {
            let found = [];
            if (token) {
              const data = await api(
                "/search?" +
                  new URLSearchParams({ q: term, type: "track", limit: "10" }),
              );
              found = data.tracks?.items || [];
              // Only add Susan tracks that match the SONG, not unrelated artist search terms.
              const songTitle = (current()?.title || "").toLowerCase();
              const local = app.susanTracks.filter(
                (t) =>
                  t.name.toLowerCase().includes(songTitle) ||
                  songTitle.includes(t.name.toLowerCase()),
              );
              const dict = new Map(
                [...found, ...local].filter((t) => t?.id).map((t) => [t.id, t]),
              );
              const susanMap = new Map(
                app.susanTracks.map((t) => [t.id, t.susanNames || []]),
              );
              found = [...dict.values()].map((t) => ({
                ...t,
                susanNames: susanMap.get(t.id) || [],
              }));
            } else {
              // No offline catalog: results must come from an authenticated Spotify search.
              found = [];
            }
            if (request !== searchSerial || songIndex !== app.index) return;
            results = found;
            if (
              candidate &&
              candidate !== "skip" &&
              !results.some((t) => t.id === candidate.id)
            )
              results.unshift(candidate);
            renderResults();
            if (!token) {
              $("resultsNote").textContent = "Connect Spotify to search for recordings.";
            }
          } catch (e) {
            if (request !== searchSerial) return;
            $("resultsNote").textContent = "Search failed: " + e.message;
            flash("Spotify search failed: " + e.message, "error");
          } finally {
            if (request === searchSerial) {
              busy = false;
              $("searchBtn").disabled = false;
              $("searchBtn").textContent = "Search Spotify";
            }
          }
        }
        function renderReview() {
          const root = $("reviewItems");
          root.replaceChildren();
          app.songs.forEach((s, i) => {
            const t = app.selected[i];
            const row = document.createElement("div");
            row.className = "review-row";
            row.innerHTML = `<span class="index">${i + 1}.</span><div class="main"><b>${htmlEsc(s.title)}</b><div class="small">${t && t !== "skip" ? `${htmlEsc(t.name)} · ${htmlEsc(trackArtist(t))}` : "Skipped"}</div></div>${s.extra ? '<span class="pill">Extra</span>' : ""}`;
            const change = document.createElement("button");
            change.className = "btn sm ghost";
            change.textContent = "Edit";
            change.onclick = () => {
              app.index = i;
              showStage(1);
            };
            row.append(change);
            root.append(row);
          });
          $("playlistName").value = app.playlistName || "";
          $("createdLink").classList.add("hidden");
          $("createBtn").disabled = !token;
        }
        function tokenValid() {
          return (
            token && token.access_token && Date.now() < token.expires_at - 45000
          );
        }
        async function refresh() {
          if (!token?.refresh_token)
            throw Error("Spotify session expired. Connect again.");
          const body = new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: token.refresh_token,
            client_id: app.clientId,
          });
          const r = await fetch("https://accounts.spotify.com/api/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body,
          });
          const d = await r.json();
          logEvent("oauth-token-response", `HTTP ${r.status} success=${r.ok}`);
          if (!r.ok)
            throw Error(
              d.error_description || "Could not refresh Spotify authorization",
            );
          token = {
            ...token,
            ...d,
            refresh_token: d.refresh_token || token.refresh_token,
            expires_at: Date.now() + d.expires_in * 1000,
          };
          sessionStorage.setItem(TOKEN, JSON.stringify(token));
          setBadge();
        }
        async function api(path, opts = {}) {
          logEvent(
            "spotify-request",
            `${opts.method || "GET"} ${path.split("?")[0]}`,
          );
          if (!token?.access_token)
            throw Error("Connect Spotify in settings first.");
          if (!tokenValid()) await refresh();
          let response = await fetch("https://api.spotify.com/v1" + path, {
            ...opts,
            headers: {
              Authorization: "Bearer " + token.access_token,
              ...(opts.body ? { "Content-Type": "application/json" } : {}),
              ...(opts.headers || {}),
            },
          });
          if (response.status === 429) {
            let seconds = Number(response.headers.get("Retry-After") || 0);
            throw Error(
              `Spotify rate limit reached. Retry after ${seconds || "a few"} seconds.`,
            );
          }
          logEvent(
            "spotify-response",
            `${opts.method || "GET"} ${path.split("?")[0]} HTTP ${response.status}`,
          );
          const content = await response.text();
          let data;
          try {
            data = content ? JSON.parse(content) : {};
          } catch {
            data = { message: content };
          }
          if (!response.ok)
            throw Error(
              data.error?.message ||
                data.message ||
                `Spotify API HTTP ${response.status}`,
            );
          return data;
        }
        async function sha256(s) {
          let bytes = new TextEncoder().encode(s);
          let digest = await crypto.subtle.digest("SHA-256", bytes);
          return btoa(String.fromCharCode(...new Uint8Array(digest)))
            .replace(/\+/g, "-")
            .replace(/\//g, "_")
            .replace(/=+$/, "");
        }
        function randomString(n) {
          const b = crypto.getRandomValues(new Uint8Array(n));
          return Array.from(
            b,
            (x) =>
              "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~"[
                x % 66
              ],
          ).join("");
        }
        async function connect() {
          logEvent(
            "oauth",
            "connect clicked; local=" +
              isLocalServer() +
              " redirect=" +
              redirectUri(),
          );
          if (!isLocalServer())
            return flash(
              "Use the included desktop launcher for Spotify login. A file:// HTML page cannot complete Spotify OAuth.",
              "warning",
            );
          const id = $("clientId").value.trim();
          if (!/^[0-9a-f]{32}$/i.test(id))
            return flash(
              "Enter the 32-character Spotify Client ID from your developer dashboard.",
              "warning",
            );
          app.clientId = id;
          save();
          const verifier = randomString(96),
            state = randomString(28),
            challenge = await sha256(verifier),
            redirect = redirectUri();
          sessionStorage.setItem(
            PKCE,
            JSON.stringify({ verifier, state, redirect }),
          );
          let url =
            "https://accounts.spotify.com/authorize?" +
            new URLSearchParams({
              client_id: id,
              response_type: "code",
              redirect_uri: redirect,
              scope:
                "playlist-read-private playlist-read-collaborative playlist-modify-private playlist-modify-public",
              code_challenge_method: "S256",
              code_challenge: challenge,
              state,
              show_dialog: "false",
            });
          logEvent("oauth", "redirecting to Spotify authorization");
          location.assign(url);
        }
        async function authCallback() {
          logEvent(
            "oauth-callback",
            `code-present=${new URLSearchParams(location.search).has("code")} error-present=${new URLSearchParams(location.search).has("error")}`,
          );
          let params = new URLSearchParams(location.search);
          if (params.has("error")) {
            flash(
              "Spotify authorization declined: " + params.get("error"),
              "error",
            );
            history.replaceState(null, "", location.pathname);
            return;
          }
          if (!params.has("code")) return;
          let info = JSON.parse(sessionStorage.getItem(PKCE) || "null");
          if (!info || info.state !== params.get("state")) {
            flash(
              "Spotify login could not be validated (state mismatch). Retry Connect.",
              "error",
            );
            return;
          }
          try {
            const body = new URLSearchParams({
              grant_type: "authorization_code",
              code: params.get("code"),
              redirect_uri: info.redirect,
              client_id: app.clientId,
              code_verifier: info.verifier,
            });
            const r = await fetch("https://accounts.spotify.com/api/token", {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body,
            });
            const d = await r.json();
            logEvent(
              "oauth-token-response",
              `HTTP ${r.status} success=${r.ok}`,
            );
            if (!r.ok)
              throw Error(
                d.error_description || d.error || "Token exchange failed",
              );
            token = { ...d, expires_at: Date.now() + d.expires_in * 1000 };
            sessionStorage.setItem(TOKEN, JSON.stringify(token));
            sessionStorage.removeItem(PKCE);
            history.replaceState(null, "", location.pathname);
            setBadge();
            await testConnection();
            flash("Spotify authorized. Loading Susan playlists…", "success");
            await loadSusan();
          } catch (e) {
            logEvent("oauth-error", e.message);
            flash("Could not finish Spotify sign-in: " + e.message, "error");
          }
        }
        async function loadSusan() {
          app.susanTracks = [];
          app.susanNames = [];
          app.susanLoaded = false;
          try {
            let next = "/me/playlists?limit=50",
              playlists = [];
            for (let i = 0; next && i < 25; i++) {
              let d = await api(next);
              playlists.push(...(d.items || []));
              next = d.next
                ? new URL(d.next).pathname.replace("/v1", "") +
                  new URL(d.next).search
                : null;
            }
            let matching = playlists.filter((x) => /susan/i.test(x.name || ""));
            app.susanNames = matching.map((x) => x.name);
            const byId = new Map();
            for (const p of matching) {
              let url = `/playlists/${encodeURIComponent(p.id)}/items?limit=50`;
              for (let page = 0; url && page < 50; page++) {
                try {
                  let d = await api(url);
                  for (let entry of d.items || []) {
                    const t = entry.item || entry.track;
                    if (t?.type === "track" && t.id) {
                      if (!byId.has(t.id))
                        byId.set(t.id, { ...t, susanNames: [] });
                      byId.get(t.id).susanNames.push(p.name);
                    }
                  }
                  url = d.next
                    ? new URL(d.next).pathname.replace("/v1", "") +
                      new URL(d.next).search
                    : null;
                } catch (e) {
                  flash(
                    `Couldn't read Susan playlist “${p.name}”: ${e.message}`,
                  );
                  break;
                }
              }
            }
            app.susanTracks = [...byId.values()];
            app.susanLoaded = true;
            $("susanStatus").textContent =
              `Loaded ${matching.length} Susan playlists, ${app.susanTracks.length} unique tracks`;
            flash(
              `Spotify connected · ${matching.length} Susan playlists found, ${app.susanTracks.length} tracks indexed.`,
              "success",
            );
          } catch (e) {
            flash(
              "Connected, but could not index Susan playlists: " + e.message,
              "warning",
            );
          }
        }
        async function validateLink() {
          const text = $("manualLink").value.trim();
          const match = text.match(
            /(?:open\.spotify\.com\/track\/|spotify:track:)([a-zA-Z0-9]{22})/,
          );
          if (!match)
            return flash(
              "Paste a Spotify track link, not an album or playlist URL.",
              "warning",
            );
          try {
            const id = match[1];
            const t = token
              ? await api("/tracks/" + id)
              : demoTracks.find((t) => t.id === id);
            if (!t)
              throw Error(
                "Connect Spotify to validate a track not in the demo catalog.",
              );
            candidate = t;
            results = [t, ...results.filter((x) => x.id !== id)];
            renderResults();
            $("nextSongBtn").disabled = false;
          } catch (e) {
            flash(e.message, "error");
          }
        }
        async function createPlaylist() {
          const name = $("playlistName").value.trim();
          if (!name) return flash("Give the new playlist a name.", "warning");
          app.playlistName = name;
          save();
          if (!token)
            return flash(
              "Connect to Spotify before creating a real playlist. You can export your selections meanwhile.",
              "warning",
            );
          const uris = app.songs
            .map((s, i) => app.selected[i])
            .filter((x) => x && x !== "skip")
            .map(trackUri);
          if (!uris.length)
            return flash(
              "Choose at least one recording before creating the playlist.",
            );
          $("createBtn").disabled = true;
          $("createBtn").innerHTML = '<span class="loading"></span> Creating…';
          let created = null,
            added = 0;
          try {
            const publicVal = $("makePublic").checked;
            created = await api("/me/playlists", {
              method: "POST",
              body: JSON.stringify({
                name,
                public: publicVal,
                description:
                  "Built in Spotify Setlist Builder; songs in set-list order",
              }),
            });
            if (!created?.id)
              throw Error("Spotify did not return a playlist ID.");
            for (let i = 0; i < uris.length; i += 100) {
              await api(`/playlists/${encodeURIComponent(created.id)}/items`, {
                method: "POST",
                body: JSON.stringify({ uris: uris.slice(i, i + 100) }),
              });
              added += Math.min(100, uris.length - i);
            }
            const link =
              created.external_urls?.spotify ||
              `https://open.spotify.com/playlist/${created.id}`;
            $("createdLink").innerHTML =
              `✓ Created <b>${htmlEsc(name)}</b> with ${added} songs. <a target="_blank" rel="noopener noreferrer" href="${htmlEsc(link)}">Open in Spotify ↗</a>`;
            $("createdLink").classList.remove("hidden");
            flash(`Playlist created successfully: ${added} tracks.`, "success");
          } catch (e) {
            flash(
              `Playlist creation ${created?.id ? `partially completed (${added}/${uris.length} tracks added to playlist ${created.id})` : "failed"}: ${e.message}. Do not click Create again without checking Spotify for duplicates.`,
              "error",
            );
          } finally {
            $("createBtn").disabled = false;
            $("createBtn").textContent = "Create Spotify playlist →";
          }
        }
        function exportSelections() {
          let data = {
            name: $("playlistName").value || "",
            songs: app.songs.map((s, i) => ({
              title: s.title,
              extra: s.extra,
              selection:
                app.selected[i] && app.selected[i] !== "skip"
                  ? {
                      name: app.selected[i].name,
                      artist: trackArtist(app.selected[i]),
                      url: trackUrl(app.selected[i]),
                      uri: trackUri(app.selected[i]),
                    }
                  : null,
            })),
          };
          let blob = new Blob([JSON.stringify(data, null, 2)], {
              type: "application/json",
            }),
            url = URL.createObjectURL(blob),
            a = document.createElement("a");
          a.href = url;
          a.download = "spotify-setlist-selections.json";
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1500);
        }
        $("debugToggle").onclick = () => {
          debugOn = !debugOn;
          localStorage.setItem(DEBUG_STORE, String(debugOn));
          refreshDebug();
          logEvent("debug", "logging enabled");
        };
        $("debugSave").onclick = saveDebugFile;
        $("debugDownload").onclick = downloadDebug;
        $("debugClear").onclick = () => {
          debugEntries = [];
          if ($("debugPreview")) $("debugPreview").textContent = "";
          logEvent("debug", "log cleared");
          if (debugHandle) queueDebugWrite();
        };
        refreshDebug();
        logEvent(
          "startup",
          `url=${location.origin + location.pathname} browser=${navigator.userAgent}`,
        );
        $("parseBtn").onclick = () => {
          let raw = $("setlistText").value;
          app.raw = raw;
          save();
          renderPreview();
        };
        $("sampleBtn").onclick = () => {
          $("setlistText").value =
            "Set 1\n1. Fly Me to the Moon\n2. The Look of Love\n\nSet 2\n1. Autumn Leaves\n\nExtras\nMisty";
          renderPreview();
        };
        $("editListBtn").onclick = () => {
          $("parsedPreview").classList.add("hidden");
          $("setlistText").focus();
        };
        $("startBtn").onclick = () => {
          let p = parse($("setlistText").value);
          app.raw = $("setlistText").value;
          app.songs = p.songs;
          app.index = 0;
          app.selected = {};
          showStage(1);
        };
        $("settingsBtn").onclick = showSettings;
        $("headerConnectBtn").onclick = showSettings;
        $("quickConnectBtn").onclick = showSettings;
        $("testConnectionBtn").onclick = () => testConnection();
        $("cancelSettingsBtn").onclick = () => showStage(app.stage);
        $("copyRedirectBtn").onclick = () =>
          navigator.clipboard
            .writeText($("redirectUri").value)
            .then(() => flash("Redirect URI copied.", "success"))
            .catch(() => flash("Select and copy the Redirect URI manually."));
        $("connectBtn").onclick = () =>
          connect().catch((e) => flash(e.message, "error"));
        $("logoutBtn").onclick = () => {
          token = null;
          sessionStorage.removeItem(TOKEN);
          app.susanLoaded = false;
          app.susanTracks = [];
          app.susanNames = [];
          setBadge();
          flash("Disconnected from Spotify.", "success");
        };
        $("resetBtn").onclick = () => {
          if (!confirm("Start a new set list? This clears current selections."))
            return;
          app.songs = [];
          app.selected = {};
          app.index = 0;
          app.raw = "";
          app.playlistName = "";
          $("setlistText").value = "";
          $("parsedPreview").classList.add("hidden");
          showStage(0);
        };
        $("searchBtn").onclick = () =>
          searchTracks($("searchTerm").value.trim() || current().title);
        $("searchTerm").addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            $("searchBtn").click();
          }
        });
        $("validateLinkBtn").onclick = validateLink;
        $("manualLink").addEventListener("keydown", (e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            validateLink();
          }
        });
        $("backSongBtn").onclick = () => {
          app.index = Math.max(0, app.index - 1);
          showStage(1);
        };
        $("skipBtn").onclick = () => {
          app.selected[app.index] = "skip";
          app.index++;
          showStage(app.index >= app.songs.length ? 2 : 1);
        };
        $("nextSongBtn").onclick = () => {
          if (!candidate || candidate === "skip") return;
          app.selected[app.index] = candidate;
          app.index++;
          showStage(app.index >= app.songs.length ? 2 : 1);
        };
        $("reviewBackBtn").onclick = () => {
          app.index = app.songs.length - 1;
          showStage(1);
        };
        $("exportBtn").onclick = exportSelections;
        $("createBtn").onclick = createPlaylist;
        restore();
        // Always open with an empty set list, even if a previous session was saved.
        // Preserve Spotify connection settings and tokens; clear only set-list working data.
        app.raw = "";
        app.songs = [];
        app.selected = {};
        app.index = 0;
        app.stage = 0;
        app.playlistName = "";
        $("setlistText").value = "";
        $("parsedPreview").classList.add("hidden");
        setBadge();
        showStage(0);
        (async function startupSpotify() {
          const callbackParams = new URLSearchParams(location.search);
          const isCallback =
            callbackParams.has("code") || callbackParams.has("error");
          if (isCallback) {
            logEvent(
              "startup-auth",
              "Spotify callback detected; processing before any new login",
            );
            await authCallback();
            return;
          }
          if (!app.clientId || !/^[0-9a-f]{32}$/i.test(app.clientId)) {
            logEvent(
              "startup-auth",
              "No valid saved Client ID; manual one-time setup required",
            );
            return;
          }
          if (!isLocalServer()) {
            logEvent(
              "startup-auth",
              "Saved Client ID found, but page is not on localhost/HTTPS",
            );
            showSettings();
            return;
          }
          if (token) {
            try {
              if (!tokenValid()) await refresh();
              await testConnection();
              logEvent("startup-auth", "Existing Spotify session verified");
              return;
            } catch (e) {
              logEvent(
                "startup-auth",
                "Existing session failed; starting fresh authorization: " +
                  e.message,
              );
              token = null;
              sessionStorage.removeItem(TOKEN);
              setBadge();
            }
          }
          // No valid session, but the user's existing Client ID is already configured.
          // Start PKCE authorization immediately rather than waiting for Connect click.
          showSettings();
          logEvent(
            "startup-auth",
            "Saved API settings found; automatically opening Spotify authorization",
          );
          await connect();
        })().catch((e) => {
          logEvent("startup-auth-error", e.message);
          showSettings();
          flash("Spotify automatic connection failed: " + e.message, "error");
        });
      })();
