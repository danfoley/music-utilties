"use strict";
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
function load(path, globalName) {
  const sandbox = { window: {} };
  vm.runInNewContext(fs.readFileSync(path, "utf8"), sandbox, { filename: path });
  assert.ok(sandbox.window[globalName]);
  return sandbox.window[globalName];
}
const jazz = load("jazz-chart-studio/js/chart-core.js", "JazzChartCore");
const circle = JSON.parse(fs.readFileSync("jazz-chart-studio/generators/circle-dominant-sevenths.json", "utf8"));
for (const [direction, step] of Object.entries(circle.strategy.intervals)) {
  const sequence = jazz.cycleSequence(circle, "Eb", direction);
  assert.equal(sequence.length, 12);
  assert.equal(sequence[0], "Eb7");
  assert.equal(new Set(sequence.map(chord => jazz.PITCH[chord.slice(0, -1)])).size, 12);
  for (let i = 1; i < sequence.length; i++) {
    const previous = jazz.PITCH[sequence[i-1].slice(0, -1)];
    const next = jazz.PITCH[sequence[i].slice(0, -1)];
    assert.equal((previous + step) % 12, next);
  }
}
assert.equal(jazz.shuffle(["A", "B", "C"]).length, 3);
const spotify = load("spotify-setlist-builder/setlist-core.js", "SpotifySetlistCore");
const parsed = spotify.parse("Set 1\n1. Fly Me to the Moon\n2. Misty\nExtras\n3. Encore");
assert.equal(parsed.main, 2);
assert.equal(parsed.extras, 1);
assert.equal(parsed.songs[2].title, "Encore");
const exact = { name: "Misty", artists: [{ name: "Erroll Garner" }] };
const unrelated = { name: "Blue Train", artists: [{ name: "John Coltrane" }] };
assert.ok(spotify.rank(exact, "Misty") > spotify.rank(unrelated, "Misty"));
const preferred = { name: "Misty", artists: [{ name: "Erroll Garner" }], priorityPlaylists: ["Susan Jazz"] };
const ordinary = { name: "Misty", artists: [{ name: "Another Artist" }] };
assert.equal(spotify.orderRecordings([ordinary, preferred], "Misty")[0], preferred);
assert.equal(spotify.matchPlaylistTracks([preferred, unrelated], "Misty").length, 1);
assert.equal(spotify.matchPlaylistTracks([preferred, unrelated], "Autumn Leaves").length, 0);
console.log("PASS: circle generation, shuffle, setlist parsing and Spotify ranking");
