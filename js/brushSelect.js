// ── Brush Selection for t-SNE ─────────────────────────────────────────────────
// Requires script.js to expose on window:
//   window.tsneSvg        — the d3 SVG selection
//   window.tsneZoom       — the d3 zoom behaviour
//   window.tsneData       — the full rows array (with .x, .y, .genre, etc.)
//   window.lyricsBySong   — Map(normKey → [{word, count}])
//
// When brush mode is ON:
//   • zoom is detached from the SVG so drag = draw, not pan
//   • a d3.brush() is applied to a new <g> placed on chartArea
//   • on brushend: circles in the rect are highlighted; top words rendered
// When brush mode is OFF:
//   • brush is cleared and removed; zoom is re-attached

(function () {
  "use strict";

  const STOP = new Set([
    "a","an","the","i","me","my","you","your","we","our","they","them","it","its",
    "he","she","him","her","and","but","or","so","yet","for","not","just","like",
    "yeah","oh","uh","na","la","da","gonna","gotta","wanna","ooh","hey","ay","eh",
    "in","on","at","by","to","of","up","down","from","with","into","out","off",
    "is","am","are","was","were","be","been","have","has","had","do","did","will",
    "get","got","go","come","know","think","see","want","say","said","make","made",
    "back","now","still","time","right","never","always","ever","here","there",
    "more","good","real","true","no","yes","well","again","already","lot","bit",
    "im","ive","id","dont","cant","wont","let","cause","chorus","verse","bridge",
    "ll","ve","re","s","t","d","m","em","fuck","shit","nigga","niggas","bitch",
  ]);

  const GENRE_COLORS = {
    "r&b":"#26de81","rap":"#f7b731","rock":"#4b7bec",
    "pop":"#fd79a8","misc":"#a29bfe","country":"#e17055",
    "edm":"#81ecec","latin":"#fdcb6e",
  };
  function gColor(g) { return GENRE_COLORS[(g||"").toLowerCase()] || "#74b9ff"; }

  function normKey(title, artist) {
    return ((title||"") + "|||" + (artist||"")).toLowerCase();
  }

  const bus = window.genreEvents;

  // ── Brush Word Cloud panel ────────────────────────────────────────────────
  const brushPanel = document.getElementById("brush-wc-container");
  if (!brushPanel) { console.warn("brushSelect: #brush-wc-container not found"); return; }

  const emptyHTML = `
    <div class="bwc-empty">
      <svg viewBox="0 0 40 40" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5">
        <rect x="6" y="6" width="28" height="28" rx="2" stroke-dasharray="4 3"/>
        <path d="M13 20h14M20 13v14" stroke-width="1.2"/>
      </svg>
      <p>Draw a rectangle on the t-SNE chart to explore the lyrical DNA of any cluster</p>
    </div>`;
  brushPanel.innerHTML = emptyHTML;

  // ── Wait for script.js to expose its globals after CSV load ──────────────
  function waitFor(condFn, cb, intervalMs, maxMs) {
    const t0 = Date.now();
    const id = setInterval(function () {
      if (condFn()) { clearInterval(id); cb(); return; }
      if (Date.now() - t0 > (maxMs || 10000)) {
        clearInterval(id);
        console.warn("brushSelect: timed out waiting for tsne globals");
      }
    }, intervalMs || 100);
  }

  waitFor(
    () => window.tsneSvg && window.tsneZoom && window.tsneData && window.lyricsBySong,
    attachBrush
  );

  // ── Main attach ──────────────────────────────────────────────────────────
  function attachBrush() {
    const svgD3     = window.tsneSvg;
    const zoom      = window.tsneZoom;
    const allData   = window.tsneData;
    const lyricsMap = window.lyricsBySong;

    const svgNode = svgD3.node();
    const vb      = svgNode.viewBox.baseVal;
    const margin  = { top: 12, right: 12, bottom: 12, left: 12 };
    const W = vb.width  - margin.left - margin.right;
    const H = vb.height - margin.top  - margin.bottom;

    // chartArea = first <g> (the translate(margin) group)
    const chartArea = svgD3.select("g");

    let brushActive = false;
    let brushGroup  = null;
    let brushBehav  = null;

    // ── Toggle ────────────────────────────────────────────────────────────
    const toggleBtn = document.getElementById("brush-toggle-btn");
    if (!toggleBtn) return;

    toggleBtn.addEventListener("click", function () {
      brushActive = !brushActive;
      toggleBtn.classList.toggle("is-active", brushActive);
      toggleBtn.textContent = brushActive ? "✕ Exit Brush" : "⬚ Brush Select";
      brushActive ? enableBrush() : disableBrush();
    });

    // ── Enable: kill zoom, mount brush ────────────────────────────────────
    function enableBrush() {
      // Remove ALL zoom event listeners from the SVG
      svgD3.on(".zoom", null);

      brushBehav = d3.brush()
        .extent([[0, 0], [W, H]])
        .on("end", onBrushEnd);

      // Append to chartArea so it shares the same coordinate space as circles
      brushGroup = chartArea.append("g")
        .attr("class", "brush-group")
        .call(brushBehav);

      brushGroup.select(".overlay").style("cursor", "crosshair");
    }

    // ── Disable: kill brush, restore zoom ────────────────────────────────
    function disableBrush() {
      if (brushGroup) { brushGroup.remove(); brushGroup = null; brushBehav = null; }

      // Re-attach zoom (same instance, so scale/translate state is preserved)
      svgD3.call(zoom);

      // Restore circle appearance
      svgD3.selectAll("circle")
        .style("opacity", d => d ? 0.7 : 0)
        .style("stroke", "#121212")
        .style("stroke-width", 0.5);

      brushPanel.innerHTML = emptyHTML;
      bus.emit("brush:clear", {});
    }

    // ── Brush end ─────────────────────────────────────────────────────────
    function onBrushEnd(event) {
      if (!event.selection) return;

      const [[bx0, by0], [bx1, by1]] = event.selection;

      // The circles sit inside a <g clip-path> that has the current zoom
      // transform applied. d3.zoomTransform reads the transform stored on
      // that node's __zoom property.
      const clippedGNode = chartArea.select("g[clip-path]").node();
      const transform    = clippedGNode
        ? d3.zoomTransform(clippedGNode)
        : d3.zoomIdentity;

      // Invert brush corners from chartArea-local px → pre-zoom SVG units
      // (the same space where circle cx/cy are set by xScale/yScale)
      const [dx0, dy0] = transform.invert([bx0, by0]);
      const [dx1, dy1] = transform.invert([bx1, by1]);

      const selected = [];
      svgD3.selectAll("circle").each(function (d) {
        if (!d) return;
        const cx = +this.getAttribute("cx");
        const cy = +this.getAttribute("cy");
        if (cx >= dx0 && cx <= dx1 && cy >= dy0 && cy <= dy1) selected.push(d);
      });

      if (!selected.length) {
        brushPanel.innerHTML = `<div class="bwc-empty"><p>No songs in that region — try a larger area.</p></div>`;
        return;
      }

      // Highlight / dim
      svgD3.selectAll("circle")
        .style("opacity",      d => !d ? 0 : selected.includes(d) ? 1   : 0.06)
        .style("stroke",       d => !d ? "" : selected.includes(d) ? "#fff" : "#121212")
        .style("stroke-width", d => !d ? 0.5 : selected.includes(d) ? 1.8 : 0.5);

      svgD3.selectAll("circle").filter(d => d && selected.includes(d)).raise();

      // Aggregate top words from already-processed lyricsBySong map
      const freq = {};
      selected.forEach(song => {
        const key   = normKey(song.title, song.artist);
        const words = lyricsMap.get(key) || [];
        words.forEach(({ word, count }) => { freq[word] = (freq[word] || 0) + count; });
      });

      const topWords = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 60)
        .map(([word, count]) => ({ word, count }));

      const genreCounts = {};
      selected.forEach(s => {
        const g = (s.genre || "unknown").toLowerCase();
        genreCounts[g] = (genreCounts[g] || 0) + 1;
      });

      bus.emit("brush:selection", { songs: selected, topWords, genreBreakdown: genreCounts });
      renderBrushCloud(selected, topWords, genreCounts);
    }
  }

  // ── Render the result word cloud ──────────────────────────────────────────
  function renderBrushCloud(songs, topWords, genreBreakdown) {
    brushPanel.innerHTML = "";

    const header = document.createElement("div");
    header.className = "bwc-header";

    const countEl = document.createElement("div");
    countEl.className = "bwc-count";
    countEl.innerHTML = `<strong>${songs.length}</strong> songs selected`;
    header.appendChild(countEl);

    const pills = document.createElement("div");
    pills.className = "bwc-pills";
    const total = songs.length;
    Object.entries(genreBreakdown)
      .sort((a, b) => b[1] - a[1])
      .forEach(([g, n]) => {
        const pill = document.createElement("span");
        pill.className = "bwc-pill";
        pill.style.background  = gColor(g) + "28";
        pill.style.borderColor = gColor(g) + "88";
        pill.style.color       = gColor(g);
        pill.textContent = `${g}  ${Math.round(n / total * 100)}%`;
        pills.appendChild(pill);
      });
    header.appendChild(pills);
    brushPanel.appendChild(header);

    const svgWrap = document.createElement("div");
    svgWrap.className = "bwc-svg-wrap";
    brushPanel.appendChild(svgWrap);

    if (!topWords.length) {
      svgWrap.innerHTML = '<p class="bwc-empty-text">No lyric data for selected songs.</p>';
      return;
    }

    const maxC = topWords[0].count;
    const minC = topWords[topWords.length - 1].count;
    const SIZE_MAX = 42, SIZE_MIN = 11;
    const palette = ["#74b9ff","#a29bfe","#fd79a8","#55efc4","#fdcb6e",
                     "#e17055","#81ecec","#f7b731","#26de81","#4b7bec"];

    const sized = topWords.map((w, i) => ({
      text:  w.word,
      count: w.count,
      size:  minC === maxC ? SIZE_MAX
           : SIZE_MIN + (SIZE_MAX - SIZE_MIN) * Math.sqrt((w.count - minC) / (maxC - minC)),
      color: palette[i % palette.length],
    }));

    requestAnimationFrame(function () {
      const W = svgWrap.clientWidth  || 540;
      const H = Math.max(260, svgWrap.clientHeight || 260);

      d3.layout.cloud()
        .size([W, H])
        .words(sized)
        .padding(3)
        .rotate(() => Math.random() < 0.65 ? 0 : (Math.random() < 0.5 ? 90 : -90))
        .font("'DM Sans', sans-serif")
        .fontWeight(d => d.size > 22 ? "700" : "500")
        .fontSize(d => d.size)
        .on("end", function (placed) {
          const ttip = d3.select("#tooltip");
          const svgEl = d3.select(svgWrap).append("svg")
            .attr("width", W).attr("height", H)
            .attr("viewBox", `${-W/2} ${-H/2} ${W} ${H}`)
            .attr("preserveAspectRatio", "xMidYMid meet");

          svgEl.append("g").selectAll("text")
            .data(placed).enter().append("text")
            .style("font-family", "'DM Sans', sans-serif")
            .style("font-size",   d => d.size + "px")
            .style("font-weight", d => d.size > 22 ? "700" : "500")
            .style("fill",        d => d.color)
            .style("opacity", 0)
            .style("cursor", "default")
            .attr("text-anchor", "middle")
            .attr("transform",   d => `translate(${d.x},${d.y}) rotate(${d.rotate})`)
            .text(d => d.text)
            .on("mouseover", function (event, d) {
              d3.select(this).style("filter", `drop-shadow(0 0 6px ${d.color})`);
              ttip.style("display","block").style("opacity",1)
                .html(`<strong>${d.text}</strong><br>Count: ${d.count}`)
                .style("left", (event.pageX + 15) + "px")
                .style("top",  (event.pageY - 20) + "px");
            })
            .on("mousemove", event => {
              ttip.style("left", (event.pageX+15)+"px").style("top",(event.pageY-20)+"px");
            })
            .on("mouseout", function () {
              d3.select(this).style("filter","none");
              ttip.style("opacity",0).style("display","none");
            })
            .transition()
            .delay((_, i) => i * 14)
            .duration(380)
            .style("opacity", 0.9);
        })
        .start();
    });
  }

})();