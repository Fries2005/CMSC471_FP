// ── Song Detail Panel ─────────────────────────────────────────────────────────
// Slide-in sidebar that appears when a dot is clicked in the t-SNE chart.
// Shows: audio feature radar + bar charts, Spotify/YouTube search links,
//        nearest-neighbour songs, and highlighted word-cloud words.
//
// Communicates via window.genreEvents:
//   listen  "tsne:songClick"   { song }     — a dot was clicked
//   listen  "tsne:songDeselect" {}          — backdrop / escape clicked
//   emit    "panel:wordHighlight" { word, genre }  — highlight a word in clouds
//   emit    "panel:wordClear"    {}                — clear word highlights

(function () {

  // ── Feature metadata ───────────────────────────────────────────────────────
  const FEATURES = [
    { key: "danceability",     label: "Dance",        normKey: "danceability",     color: "#fd79a8" },
    { key: "energy",           label: "Energy",       normKey: "energy",           color: "#fdcb6e" },
    { key: "loudness_norm",    label: "Loudness",     normKey: "loudness_norm",    color: "#e17055" },
    { key: "speechiness",      label: "Speech",       normKey: "speechiness",      color: "#74b9ff" },
    { key: "acousticness",     label: "Acoustic",     normKey: "acousticness",     color: "#55efc4" },
    { key: "instrumentalness", label: "Instrumental", normKey: "instrumentalness", color: "#a29bfe" },
    { key: "liveness",         label: "Liveness",     normKey: "liveness",         color: "#81ecec" },
    { key: "valence",          label: "Valence",      normKey: "valence",          color: "#f368e0" },
    { key: "tempo_norm",       label: "Tempo",        normKey: "tempo_norm",       color: "#ffeaa7" },
  ];

  // ── Coerce a value from a d3.csv row to a float, or null if missing ────────
  // d3.csv gives us strings; a missing column gives undefined; "NaN" is also
  // possible if pandas wrote NaN. We want null (not 0) so we can distinguish
  // "genuinely zero" from "column not present".
  function numOrNull(v) {
    if (v === undefined || v === null || v === "") return null;
    const n = parseFloat(v);
    return isFinite(n) ? n : null;
  }

  // ── Inject panel HTML ──────────────────────────────────────────────────────
  const panelHTML = `
    <aside id="song-panel" class="song-panel" aria-label="Song detail" aria-hidden="true">
      <button id="song-panel-close" class="song-panel-close" aria-label="Close panel">✕</button>
      <div class="song-panel-inner">

        <div class="sp-header">
          <div class="sp-genre-tag" id="sp-genre"></div>
          <h2 class="sp-title" id="sp-title"></h2>
          <p class="sp-artist" id="sp-artist"></p>
          <div class="sp-links" id="sp-links"></div>
        </div>

        <div class="sp-charts">
          <div class="sp-chart-block">
            <div class="sp-chart-label">Audio Radar</div>
            <svg id="sp-radar" class="sp-radar"></svg>
          </div>
          <div class="sp-chart-block">
            <div class="sp-chart-label">Feature Breakdown</div>
            <div id="sp-bars" class="sp-bars"></div>
          </div>
        </div>

        <div class="sp-section">
          <div class="sp-section-title">Key Stats</div>
          <div id="sp-stats" class="sp-stats"></div>
        </div>

        <div class="sp-section">
          <div class="sp-section-title">Top Lyric Words <span class="sp-section-sub">(click to highlight in clouds)</span></div>
          <div id="sp-words" class="sp-words"></div>
        </div>

        <div class="sp-section">
          <div class="sp-section-title">Nearest Neighbours <span class="sp-section-sub">(by audio features)</span></div>
          <ul id="sp-neighbours" class="sp-neighbours"></ul>
        </div>

      </div>
    </aside>
    <div id="song-panel-backdrop" class="song-panel-backdrop"></div>
  `;
  document.body.insertAdjacentHTML("beforeend", panelHTML);

  injectStyles();

  const panel    = document.getElementById("song-panel");
  const closeBtn = document.getElementById("song-panel-close");
  const backdrop = document.getElementById("song-panel-backdrop");

  // ── Dismiss ────────────────────────────────────────────────────────────────
  function closePanel() {
    panel.classList.remove("is-open");
    panel.setAttribute("aria-hidden", "true");
    backdrop.classList.remove("is-visible");
    window.genreEvents.emit("panel:wordClear", {});
    window.genreEvents.emit("tsne:songDeselect", {});
  }

  closeBtn.addEventListener("click", closePanel);
  backdrop.addEventListener("click", closePanel);
  document.addEventListener("keydown", e => { if (e.key === "Escape") closePanel(); });

  // ── Open panel with song data ──────────────────────────────────────────────
  window.genreEvents.on("tsne:songClick", ({ song, allSongs, lyricsBySong }) => {
    renderPanel(song, allSongs, lyricsBySong);
    panel.classList.add("is-open");
    panel.setAttribute("aria-hidden", "false");
    backdrop.classList.add("is-visible");
  });

  // ── Render ─────────────────────────────────────────────────────────────────
  function renderPanel(song, allSongs, lyricsBySong) {

    // ── Pre-coerce all numeric fields once so the rest of the function
    //    can work with actual numbers (or null) rather than strings / undefined.
    const feat = {};
    FEATURES.forEach(f => {
      feat[f.normKey] = numOrNull(song[f.normKey]);
    });
    const tempo    = numOrNull(song.tempo);
    const loudness = numOrNull(song.loudness);
    const valence  = feat.valence;
    const dance    = feat.danceability;

    // ── Check whether we actually have audio feature data ─────────────────
    const hasFeatures = FEATURES.some(f => feat[f.normKey] !== null);

    // Header
    document.getElementById("sp-genre").textContent  = song.genre ? song.genre.toUpperCase() : "";
    document.getElementById("sp-genre").style.background = genreColor(song.genre);
    document.getElementById("sp-title").textContent  = song.title  || "(unknown title)";
    document.getElementById("sp-artist").textContent = song.artist || "(unknown artist)";

    // Links
    const linksEl = document.getElementById("sp-links");
    const spotifyQ = encodeURIComponent(`${song.title} ${song.artist}`);
    const youtubeQ = encodeURIComponent(`${song.title} ${song.artist}`);
    linksEl.innerHTML = `
      <a class="sp-link sp-link--spotify" href="https://open.spotify.com/search/${spotifyQ}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 0C5.37 0 0 5.37 0 12s5.37 12 12 12 12-5.37 12-12S18.63 0 12 0zm5.56 17.33a.75.75 0 01-1.03.25c-2.82-1.72-6.37-2.11-10.55-1.16a.75.75 0 11-.34-1.46c4.57-1.04 8.49-.59 11.67 1.34a.75.75 0 01.25 1.03zm1.48-3.3a.94.94 0 01-1.29.31C14.6 12.4 10.38 11.88 7.1 12.82a.94.94 0 11-.54-1.8c3.72-1.07 8.35-.55 11.18 1.72a.94.94 0 01.3 1.29zm.13-3.44c-3.37-2-8.93-2.18-12.14-1.21a1.12 1.12 0 11-.65-2.15c3.69-1.12 9.83-.9 13.7 1.4a1.12 1.12 0 01-1.12 1.94z"/></svg>
        Spotify
      </a>
      <a class="sp-link sp-link--youtube" href="https://www.youtube.com/results?search_query=${youtubeQ}" target="_blank" rel="noopener">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 00-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 00.5 6.2 31.3 31.3 0 000 12a31.3 31.3 0 00.5 5.8 3 3 0 002.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 002.1-2.1A31.3 31.3 0 0024 12a31.3 31.3 0 00-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z"/></svg>
        YouTube
      </a>
    `;

    if (!hasFeatures) {
      // Show a clear message rather than an empty / all-zero chart
      document.getElementById("sp-radar").innerHTML = "";
      document.getElementById("sp-bars").innerHTML =
        `<span class="sp-empty">Audio feature data not available for this song.<br>
         Make sure <code>tsne_data.csv</code> was generated by the latest version of the Python script.</span>`;
      document.getElementById("sp-stats").innerHTML =
        `<span class="sp-empty">No stats available.</span>`;
    } else {
      // Radar chart
      drawRadar(feat);

      // Bar chart
      drawBars(feat);

      // Key stats — use null-safe display
      const fmt = (v, decimals) => v !== null ? v.toFixed(decimals) : "—";
      const fmtPct = (v) => v !== null ? `${Math.round(v * 100)}%` : "—";
      const fmtBpm = (v) => v !== null ? Math.round(v) : "—";

      document.getElementById("sp-stats").innerHTML = `
        <div class="sp-stat"><span class="sp-stat-val">${fmtBpm(tempo)}</span><span class="sp-stat-key">BPM</span></div>
        <div class="sp-stat"><span class="sp-stat-val">${fmt(loudness, 1)}</span><span class="sp-stat-key">dB</span></div>
        <div class="sp-stat"><span class="sp-stat-val">${fmtPct(valence)}</span><span class="sp-stat-key">Positivity</span></div>
        <div class="sp-stat"><span class="sp-stat-val">${fmtPct(dance)}</span><span class="sp-stat-key">Danceability</span></div>
      `;
    }

    // Lyric words
    const wordsEl = document.getElementById("sp-words");
    const lyrics = lyricsBySong ? lyricsBySong.get(normKey(song.title, song.artist)) : null;
    if (lyrics && lyrics.length) {
      wordsEl.innerHTML = "";
      lyrics.slice(0, 12).forEach(({ word, count }) => {
        const chip = document.createElement("button");
        chip.className = "sp-word-chip";
        chip.textContent = word;
        chip.title = `${count} uses — click to highlight in word clouds`;
        chip.addEventListener("click", () => {
          const active = chip.classList.toggle("is-active");
          if (active) {
            wordsEl.querySelectorAll(".sp-word-chip").forEach(c => c !== chip && c.classList.remove("is-active"));
            window.genreEvents.emit("panel:wordHighlight", { word, genre: song.genre });
          } else {
            window.genreEvents.emit("panel:wordClear", {});
          }
        });
        wordsEl.appendChild(chip);
      });
    } else {
      wordsEl.innerHTML = `<span class="sp-empty">No lyric data for this song</span>`;
    }

    // Nearest neighbours (Euclidean in t-SNE space — proxy for audio similarity)
    const nbEl = document.getElementById("sp-neighbours");
    const neighbours = findNeighbours(song, allSongs, 5);
    nbEl.innerHTML = "";
    neighbours.forEach(nb => {
      const li = document.createElement("li");
      li.className = "sp-nb-item";
      li.innerHTML = `
        <span class="sp-nb-swatch" style="background:${genreColor(nb.genre)}"></span>
        <span class="sp-nb-info">
          <span class="sp-nb-title">${nb.title}</span>
          <span class="sp-nb-artist">${nb.artist}</span>
        </span>
        <span class="sp-nb-genre">${nb.genre}</span>
      `;
      li.style.cursor = "pointer";
      li.addEventListener("click", () => {
        window.genreEvents.emit("tsne:songClick", { song: nb, allSongs, lyricsBySong });
        window.genreEvents.emit("tsne:neighbourSelect", { song: nb });
      });
      nbEl.appendChild(li);
    });
  }

  // ── Radar chart ────────────────────────────────────────────────────────────
  // feat: object keyed by normKey → number (0-1) or null
  function drawRadar(feat) {
    const svgEl = document.getElementById("sp-radar");
    svgEl.innerHTML = "";

    const size = 160;
    const cx = size / 2, cy = size / 2;
    const R  = size * 0.38;
    const n  = FEATURES.length;

    const svg = d3.select(svgEl)
      .attr("viewBox", `0 0 ${size} ${size}`)
      .attr("width", size).attr("height", size);

    // Grid rings
    [0.25, 0.5, 0.75, 1].forEach(t => {
      const pts = FEATURES.map((_, i) => {
        const a = (i / n) * 2 * Math.PI - Math.PI / 2;
        return [cx + R * t * Math.cos(a), cy + R * t * Math.sin(a)];
      });
      svg.append("polygon")
        .attr("points", pts.map(p => p.join(",")).join(" "))
        .attr("fill", "none")
        .attr("stroke", "rgba(255,255,255,0.08)")
        .attr("stroke-width", 0.8);
    });

    // Axes + labels
    FEATURES.forEach((f, i) => {
      const a = (i / n) * 2 * Math.PI - Math.PI / 2;
      svg.append("line")
        .attr("x1", cx).attr("y1", cy)
        .attr("x2", cx + R * Math.cos(a))
        .attr("y2", cy + R * Math.sin(a))
        .attr("stroke", "rgba(255,255,255,0.12)")
        .attr("stroke-width", 0.8);

      const lx = cx + (R + 12) * Math.cos(a);
      const ly = cy + (R + 12) * Math.sin(a);
      svg.append("text")
        .attr("x", lx).attr("y", ly)
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("font-size", 7)
        .attr("fill", "rgba(255,255,255,0.5)")
        .text(f.label);
    });

    // Data polygon — clamp to 0-1, treat null as 0
    const pts = FEATURES.map((f, i) => {
      const v = Math.min(1, Math.max(0, feat[f.normKey] ?? 0));
      const a = (i / n) * 2 * Math.PI - Math.PI / 2;
      return [cx + R * v * Math.cos(a), cy + R * v * Math.sin(a)];
    });

    svg.append("polygon")
      .attr("points", pts.map(p => p.join(",")).join(" "))
      .attr("fill", "rgba(253,121,168,0.18)")
      .attr("stroke", "#fd79a8")
      .attr("stroke-width", 1.5);

    pts.forEach(([px, py], i) => {
      svg.append("circle")
        .attr("cx", px).attr("cy", py).attr("r", 2.5)
        .attr("fill", FEATURES[i].color);
    });
  }

  // ── Bar chart ──────────────────────────────────────────────────────────────
  // feat: object keyed by normKey → number (0-1) or null
  function drawBars(feat) {
    const barsEl = document.getElementById("sp-bars");
    barsEl.innerHTML = "";

    FEATURES.forEach(f => {
      const raw = feat[f.normKey];
      const v   = raw !== null ? Math.min(1, Math.max(0, raw)) : 0;
      const display = raw !== null ? Math.round(v * 100) : "—";

      const row = document.createElement("div");
      row.className = "sp-bar-row";
      row.innerHTML = `
        <span class="sp-bar-label">${f.label}</span>
        <div class="sp-bar-track">
          <div class="sp-bar-fill" style="width:${v * 100}%;background:${f.color}"></div>
        </div>
        <span class="sp-bar-val">${display}</span>
      `;
      barsEl.appendChild(row);
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function findNeighbours(song, allSongs, k) {
    return allSongs
      .filter(s => s !== song)
      .map(s => ({
        ...s,
        dist: Math.hypot(+s.x - +song.x, +s.y - +song.y)
      }))
      .sort((a, b) => a.dist - b.dist)
      .slice(0, k);
  }

  const GENRE_COLORS = {
    "r&b": "#26de81", rap: "#f7b731", rock: "#4b7bec",
    pop: "#fd79a8", misc: "#a29bfe", country: "#e17055",
    edm: "#81ecec", latin: "#fdcb6e",
  };
  function genreColor(g) {
    return GENRE_COLORS[(g || "").toLowerCase()] || "#74b9ff";
  }

  function normKey(title, artist) {
    return `${title}|||${artist}`.toLowerCase();
  }

  // ── CSS injection ──────────────────────────────────────────────────────────
  function injectStyles() {
    const style = document.createElement("style");
    style.textContent = `
      /* ── Panel shell ── */
      .song-panel {
        position: fixed;
        top: 0; right: 0;
        width: 360px;
        max-width: 95vw;
        height: 100vh;
        background: #161618;
        border-left: 1px solid rgba(255,255,255,0.08);
        box-shadow: -8px 0 40px rgba(0,0,0,0.6);
        z-index: 1000;
        transform: translateX(100%);
        transition: transform 0.32s cubic-bezier(0.4,0,0.2,1);
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,0.1) transparent;
      }
      .song-panel.is-open { transform: translateX(0); }

      .song-panel-backdrop {
        position: fixed; inset: 0;
        background: rgba(0,0,0,0.45);
        z-index: 999;
        opacity: 0; pointer-events: none;
        transition: opacity 0.28s ease;
      }
      .song-panel-backdrop.is-visible { opacity: 1; pointer-events: all; }

      .song-panel-close {
        position: absolute; top: 14px; right: 16px;
        background: rgba(255,255,255,0.07);
        border: 1px solid rgba(255,255,255,0.1);
        color: #ccc; font-size: 14px;
        width: 30px; height: 30px;
        border-radius: 50%; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.15s, color 0.15s;
      }
      .song-panel-close:hover { background: rgba(255,255,255,0.15); color: #fff; }

      .song-panel-inner { padding: 20px 20px 40px; }

      /* ── Header ── */
      .sp-header { margin-bottom: 20px; }
      .sp-genre-tag {
        display: inline-block;
        font-size: 10px; font-weight: 700;
        letter-spacing: 0.12em;
        color: #121212;
        padding: 3px 8px;
        border-radius: 3px;
        margin-bottom: 8px;
      }
      .sp-title {
        font-size: 18px; font-weight: 700;
        color: #fff; margin: 0 0 4px;
        line-height: 1.25;
      }
      .sp-artist {
        font-size: 13px; color: rgba(255,255,255,0.5);
        margin: 0 0 12px;
      }
      .sp-links { display: flex; gap: 8px; flex-wrap: wrap; }
      .sp-link {
        display: inline-flex; align-items: center; gap: 6px;
        font-size: 12px; font-weight: 600;
        padding: 5px 12px;
        border-radius: 20px;
        text-decoration: none;
        transition: opacity 0.15s, transform 0.15s;
      }
      .sp-link:hover { opacity: 0.85; transform: translateY(-1px); }
      .sp-link svg { width: 14px; height: 14px; flex-shrink: 0; }
      .sp-link--spotify { background: #1DB954; color: #000; }
      .sp-link--youtube { background: #FF0000; color: #fff; }

      /* ── Charts ── */
      .sp-charts {
        display: flex; gap: 12px;
        margin-bottom: 20px;
        align-items: flex-start;
      }
      .sp-chart-block { flex: 1; min-width: 0; }
      .sp-chart-label {
        font-size: 10px; font-weight: 600;
        letter-spacing: 0.1em;
        color: rgba(255,255,255,0.35);
        margin-bottom: 8px;
        text-transform: uppercase;
      }
      .sp-radar { display: block; width: 100%; max-width: 160px; }

      /* Bars */
      .sp-bar-row {
        display: flex; align-items: center;
        gap: 6px; margin-bottom: 5px;
      }
      .sp-bar-label {
        font-size: 10px; color: rgba(255,255,255,0.45);
        width: 62px; flex-shrink: 0;
        text-align: right;
      }
      .sp-bar-track {
        flex: 1; height: 5px;
        background: rgba(255,255,255,0.07);
        border-radius: 3px; overflow: hidden;
      }
      .sp-bar-fill {
        height: 100%; border-radius: 3px;
        transition: width 0.5s cubic-bezier(0.4,0,0.2,1);
      }
      .sp-bar-val {
        font-size: 10px; color: rgba(255,255,255,0.3);
        width: 24px; text-align: right;
      }

      /* ── Sections ── */
      .sp-section { margin-bottom: 20px; }
      .sp-section-title {
        font-size: 11px; font-weight: 700;
        letter-spacing: 0.1em;
        color: rgba(255,255,255,0.35);
        text-transform: uppercase;
        margin-bottom: 10px;
      }
      .sp-section-sub {
        font-weight: 400; text-transform: none;
        letter-spacing: 0; font-size: 10px;
        color: rgba(255,255,255,0.22);
      }

      /* Stats */
      .sp-stats { display: flex; gap: 8px; flex-wrap: wrap; }
      .sp-stat {
        flex: 1; min-width: 60px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.07);
        border-radius: 6px;
        padding: 8px 6px;
        text-align: center;
      }
      .sp-stat-val {
        display: block;
        font-size: 18px; font-weight: 700; color: #fff;
        line-height: 1;
        margin-bottom: 3px;
      }
      .sp-stat-key {
        font-size: 9px; font-weight: 600;
        letter-spacing: 0.08em;
        color: rgba(255,255,255,0.3);
        text-transform: uppercase;
      }

      /* Word chips */
      .sp-words { display: flex; flex-wrap: wrap; gap: 6px; }
      .sp-word-chip {
        font-size: 12px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.1);
        color: rgba(255,255,255,0.7);
        padding: 4px 10px; border-radius: 14px;
        cursor: pointer;
        transition: background 0.15s, border-color 0.15s, color 0.15s;
      }
      .sp-word-chip:hover {
        background: rgba(255,255,255,0.12);
        color: #fff;
      }
      .sp-word-chip.is-active {
        background: rgba(253,121,168,0.2);
        border-color: #fd79a8;
        color: #fd79a8;
      }
      .sp-empty {
        font-size: 12px; color: rgba(255,255,255,0.25);
        line-height: 1.6;
      }
      .sp-empty code {
        font-family: monospace;
        background: rgba(255,255,255,0.07);
        padding: 1px 4px; border-radius: 3px;
        font-size: 11px;
      }

      /* Neighbours */
      .sp-neighbours { list-style: none; margin: 0; padding: 0; }
      .sp-nb-item {
        display: flex; align-items: center; gap: 10px;
        padding: 8px 0;
        border-bottom: 1px solid rgba(255,255,255,0.05);
        transition: background 0.12s;
      }
      .sp-nb-item:last-child { border-bottom: none; }
      .sp-nb-item:hover { background: rgba(255,255,255,0.03); }
      .sp-nb-swatch {
        width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
      }
      .sp-nb-info { flex: 1; min-width: 0; }
      .sp-nb-title {
        display: block;
        font-size: 12px; font-weight: 600; color: #ddd;
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .sp-nb-artist {
        display: block;
        font-size: 11px; color: rgba(255,255,255,0.35);
        white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
      }
      .sp-nb-genre {
        font-size: 10px; color: rgba(255,255,255,0.3);
        flex-shrink: 0; text-transform: capitalize;
      }
    `;
    document.head.appendChild(style);
  }

})();