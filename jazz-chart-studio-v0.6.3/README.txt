Jazz Chart Studio v0.6.3 — distinct HTML Serve project folder.

Select Circle Dominant Sevenths from Active generator. Starting root defaults to Eb. Choose fourths or fifths; 12 dominant seventh chords, two bars each, 24 bars total. Playlist mode optionally randomizes the starting root separately for each song (checkbox enabled by default). Use Open Playlist in iReal Pro.

Original Random Dominant Sevenths generator remains available. Both definitions are separate JSON files in generators/.

Import the entire jazz-chart-studio-v0.6.3 folder as a separate HTML Serve project and open its HTTP URL in Safari.

New circle generation and import require user testing.

Playlist fix: append a playlist-name field after the final song. Test that a named playlist appears under Playlists in iReal Pro.

Repeat notation: both generators display % and encode iReal x (single-measure repeat) only when the chord matches the preceding measure and both are on the same 4-measure system. Chart data retains explicit chords.
