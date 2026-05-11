// ── Genre Radar Grid: small-multiples of avg audio features per genre ─────────
// Renders into #radar-grid-container
// Listens to:
//   wordcloud:genreClick  { genre }  — highlight a genre card
//   tsne:genreHover       { genre }  — pulse a card
//   tsne:genreLeave       {}
// Emits:
//   radarGrid:genreClick  { genre }  — mirrors genre isolation to t-SNE

(function () {
  "use strict";

  const FEATURES = [
    { key: "danceability",     label: "Dance"   },
    { key: "energy",           label: "Energy"  },
    { key: "loudness_norm",    label: "Loud"    },
    { key: "speechiness",      label: "Speech"  },
    { key: "acousticness",     label: "Acoustic"},
    { key: "instrumentalness", label: "Instru." },
    { key: "liveness",         label: "Live"    },
    { key: "valence",          label: "Valence" },
    { key: "tempo_norm",       label: "Tempo"   },
  ];

  // Use the shared colour map built by script.js so all charts stay in sync.
  // Falls back to a neutral blue if the map isn't ready yet (shouldn't happen
  // because radarGrid loads after script.js completes its CSV fetch).
  function gColor(g) {
    if (window.genreColorMap) {
      // Try exact key first, then lowercase
      return window.genreColorMap.get(g) ||
             window.genreColorMap.get((g||"").toLowerCase()) ||
             "#74b9ff";
    }
    const FALLBACK = {
      "r&b":"#26de81","hip-hop":"#f7b731","rock":"#4b7bec","pop":"#fd79a8",
      "misc":"#a29bfe","country":"#e17055","edm":"#81ecec","latin":"#fdcb6e",
    };
    return FALLBACK[(g||"").toLowerCase()] || "#74b9ff";
  }

  function numOrNull(v) {
    if (v === undefined || v === null || v === "") return null;
    const n = parseFloat(v);
    return isFinite(n) ? n : null;
  }

  // ── Wait for container ────────────────────────────────────────────────────
  const container = document.getElementById("radar-grid-container");
  if (!container) { console.warn("radarGrid: #radar-grid-container not found"); return; }

  const bus = window.genreEvents;

  // ── Load data ─────────────────────────────────────────────────────────────
  // Wait for both the CSV data AND the shared colour map (built by script.js)
  // before rendering, so gColor() never falls back to the hardcoded palette.
  Promise.all([
    d3.csv("./data/tsne_data.csv"),
    window.genreColorMapReady || Promise.resolve(),
  ]).then(function (results) {
    const rows = results[0];

    // Compute per-genre averages
    const byGenre = {};
    rows.forEach(function (d) {
      const g = (d.genre || "").toLowerCase().trim();
      if (!g) return;
      if (!byGenre[g]) byGenre[g] = { counts: {}, sums: {} };
      FEATURES.forEach(function (f) {
        const v = numOrNull(d[f.key]);
        if (v === null) return;
        byGenre[g].sums[f.key]   = (byGenre[g].sums[f.key]   || 0) + v;
        byGenre[g].counts[f.key] = (byGenre[g].counts[f.key] || 0) + 1;
      });
    });

    const genres = Object.keys(byGenre).sort();
    const avgData = genres.map(function (g) {
      const avgs = {};
      FEATURES.forEach(function (f) {
        const s = byGenre[g].sums[f.key]   || 0;
        const c = byGenre[g].counts[f.key] || 1;
        avgs[f.key] = Math.min(1, Math.max(0, s / c));
      });
      return { genre: g, avgs: avgs };
    });

    renderGrid(avgData);

  }).catch(function (err) {
    console.error("radarGrid: failed to load CSV", err);
    container.innerHTML = '<p class="wc-error">Could not load tsne_data.csv</p>';
  });

  // ── Render ────────────────────────────────────────────────────────────────
  let isolatedGenre = null;
  const cardMap = new Map();

  function renderGrid(avgData) {
    container.innerHTML = "";
    container.style.setProperty("--rg-cols", Math.min(4, avgData.length));

    avgData.forEach(function (item) {
      const card = document.createElement("div");
      card.className = "rg-card";
      card.dataset.genre = item.genre;
      cardMap.set(item.genre, card);

      const label = document.createElement("div");
      label.className = "rg-label";
      label.textContent = item.genre.toUpperCase();
      label.style.color = gColor(item.genre);
      card.appendChild(label);

      const svgWrap = document.createElement("div");
      svgWrap.className = "rg-svg-wrap";
      card.appendChild(svgWrap);
      container.appendChild(card);

      // Click → isolate genre
      card.addEventListener("click", function () {
        const wasIsolated = isolatedGenre === item.genre;
        isolatedGenre = wasIsolated ? null : item.genre;
        updateCardStates();
        bus.emit("wordcloud:genreClick", { genre: wasIsolated ? null : item.genre });
        bus.emit("radarGrid:genreClick", { genre: wasIsolated ? null : item.genre });
      });

      requestAnimationFrame(function () { drawRadar(svgWrap, item); });
    });

    // Bus listeners
    bus.on("tsne:genreHover", function (payload) {
      cardMap.forEach(function (c, g) {
        c.classList.toggle("rg-card--active", g === payload.genre);
        c.classList.toggle("rg-card--dimmed", payload.genre !== null && g !== payload.genre);
      });
    });
    bus.on("tsne:genreLeave", function () {
      cardMap.forEach(function (c) { c.classList.remove("rg-card--active", "rg-card--dimmed"); });
    });
    bus.on("wordcloud:genreClick", function (payload) {
      isolatedGenre = payload.genre || null;
      updateCardStates();
    });
  }

  function updateCardStates() {
    cardMap.forEach(function (c, g) {
      c.classList.remove("rg-card--isolated", "rg-card--nonisolated");
      if (isolatedGenre !== null) {
        if (g === isolatedGenre) c.classList.add("rg-card--isolated");
        else                     c.classList.add("rg-card--nonisolated");
      }
    });
  }

  // ── Draw single radar ─────────────────────────────────────────────────────
  function drawRadar(wrap, item) {
    const W = wrap.clientWidth  || 140;
    const H = wrap.clientHeight || 130;
    const cx = W / 2, cy = H / 2;
    const R  = Math.min(W, H) * 0.36;
    const n  = FEATURES.length;
    const color = gColor(item.genre);

    const svg = d3.select(wrap).append("svg")
      .attr("viewBox", `0 0 ${W} ${H}`)
      .attr("width", W).attr("height", H);

    // Grid rings
    [0.33, 0.66, 1].forEach(function (t) {
      const pts = FEATURES.map(function (_, i) {
        const a = (i / n) * 2 * Math.PI - Math.PI / 2;
        return [cx + R * t * Math.cos(a), cy + R * t * Math.sin(a)];
      });
      svg.append("polygon")
        .attr("points", pts.map(p => p.join(",")).join(" "))
        .attr("fill", "none")
        .attr("stroke", "rgba(255,255,255,0.07)")
        .attr("stroke-width", 0.7);
    });

    // Spokes + labels
    FEATURES.forEach(function (f, i) {
      const a = (i / n) * 2 * Math.PI - Math.PI / 2;
      svg.append("line")
        .attr("x1", cx).attr("y1", cy)
        .attr("x2", cx + R * Math.cos(a))
        .attr("y2", cy + R * Math.sin(a))
        .attr("stroke", "rgba(255,255,255,0.09)")
        .attr("stroke-width", 0.7);

      svg.append("text")
        .attr("x", cx + (R + 10) * Math.cos(a))
        .attr("y", cy + (R + 10) * Math.sin(a))
        .attr("text-anchor", "middle")
        .attr("dominant-baseline", "middle")
        .attr("font-size", 5)
        .attr("font-family", "'DM Sans', sans-serif")
        .attr("fill", "rgba(255,255,255,0.38)")
        .text(f.label);
    });

    // Data polygon (animated in)
    const pts = FEATURES.map(function (f, i) {
      const v = item.avgs[f.key] || 0;
      const a = (i / n) * 2 * Math.PI - Math.PI / 2;
      return [cx + R * v * Math.cos(a), cy + R * v * Math.sin(a)];
    });

    const poly = svg.append("polygon")
      .attr("points", pts.map(p => p.join(",")).join(" "))
      .attr("fill", color + "28")
      .attr("stroke", color)
      .attr("stroke-width", 1.5)
      .attr("stroke-linejoin", "round")
      .style("opacity", 0);

    poly.transition().delay(100).duration(500).style("opacity", 1);

    // Dots
    pts.forEach(function ([px, py]) {
      svg.append("circle")
        .attr("cx", px).attr("cy", py).attr("r", 2.2)
        .attr("fill", color)
        .style("opacity", 0)
        .transition().delay(400).duration(300).style("opacity", 0.9);
    });

    // Hover tooltip showing feature values
    const g = svg.append("g").attr("class", "rg-overlay")
      .style("pointer-events", "all");
    g.append("rect")
      .attr("width", W).attr("height", H)
      .attr("fill", "transparent");

    const ttip = d3.select("#tooltip");
    g.on("mousemove", function (event) {
      const lines = FEATURES.map(function (f) {
        return `<span style="color:${color}">${f.label}:</span> ${Math.round((item.avgs[f.key] || 0) * 100)}%`;
      });
      ttip.style("display", "block").style("opacity", 1)
        .html(`<strong>${item.genre.toUpperCase()} — avg. features</strong><br>${lines.join("<br>")}`)
        .style("left", (event.pageX + 15) + "px")
        .style("top",  (event.pageY - 20) + "px");
    });
    g.on("mouseleave", function () {
      ttip.style("opacity", 0).style("display", "none");
    });
  }

})();