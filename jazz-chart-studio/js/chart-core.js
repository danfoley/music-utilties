"use strict";
// Pure progression helpers: no DOM, browser storage, or network dependencies.
window.JazzChartCore = (() => {
  const PITCH = {
    C: 0,
    "C#": 1,
    Db: 1,
    D: 2,
    "D#": 3,
    Eb: 3,
    E: 4,
    F: 5,
    "F#": 6,
    Gb: 6,
    G: 7,
    "G#": 8,
    Ab: 8,
    A: 9,
    "A#": 10,
    Bb: 10,
    B: 11,
  };

  function shuffle(xs) {
    const a = [...xs];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function cycleSequence(d, start, direction) {
    const st = d.strategy,
      roots = st.roots,
      byPitch = new Map(roots.map((x) => [PITCH[x], x]));
    const step = st.intervals[direction],
      result = [];
    for (let i = 0; i < roots.length; i++) {
      const pitch = (PITCH[start] + i * step) % 12;
      const root = i === 0 ? start : byPitch.get(pitch);
      if (!root)
        throw Error(
          "Cycle roots do not cover pitch class " + pitch + " for " + direction,
        );
      result.push(root + st.chordSuffix);
    }
    return result;
  }

  return Object.freeze({ PITCH, shuffle, cycleSequence });
})();
