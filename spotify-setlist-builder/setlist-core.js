"use strict";
// Setlist parsing and Spotify candidate ranking, independent of the UI.
window.SpotifySetlistCore = (() => {
        function parse(raw) {
          let songs = [],
            extras = [],
            extra = false,
            sections = 0;
          for (let line of raw.split(/\r?\n/)) {
            line = line.trim();
            if (!line || /^[-=*_]{3,}$/.test(line)) continue;
            if (
              /^\s*(?:extras?|extra songs?|encores?(?:\s*\/\s*extras?)?)\s*[:\-–]?\s*$/i.test(
                line,
              )
            ) {
              extra = true;
              continue;
            }
            if (
              /^\s*(?:set\s*(?:list\s*)?(?:\d+|one|two|three|four|[ivx]+)|first set|second set)\s*[:\-–]?\s*$/i.test(
                line,
              )
            ) {
              extra = false;
              sections++;
              continue;
            }
            line = line
              .replace(/^\s*(?:(?:\d+[.)\-:]|[•●▪*✓☐-])\s*)+/, "")
              .trim();
            if (!line) continue;
            (extra ? extras : songs).push({ title: line, extra });
          }
          return {
            songs: [...songs, ...extras],
            main: songs.length,
            extras: extras.length,
            sections,
          };
        }

  const trackArtist = (track) => (track.artists || []).map((artist) => artist.name).join(", ");
        function rank(t, needle) {
          let n = needle.toLowerCase().trim(),
            title = (t.name || "").toLowerCase(),
            artist = trackArtist(t).toLowerCase(),
            tokens = n.split(/\s+/).filter((x) => x.length > 2);
          let match = tokens.filter(
            (x) => title.includes(x) || artist.includes(x),
          ).length;
          let susan = Array.isArray(t.susanNames) && t.susanNames.length > 0;
          return (
            match * 12 +
            (title === n ? 60 : 0) +
            (title.includes(n) ? 30 : 0) +
            (susan ? 20 : 0) -
            (title.includes("karaoke") ? 22 : 0)
          );
        }

  return Object.freeze({ parse, rank });
})();
