// ── Feature Distribution: violin + box plots per genre ───────────────────────
// Renders into #violin-container
// A feature selector lets the user pick which audio dimension to explore.
// Each genre gets a violin showing the KDE + a box for IQR + median line.

(function () {
  "use strict";

  const FEATURES = [
    { key: "danceability",     label: "Danceability"     },
    { key: "energy",           label: "Energy"           },
    { key: "loudness_norm",    label: "Loudness"         },
    { key: "speechiness",      label: "Speechiness"      },
    { key: "acousticness",     label: "Acousticness"     },
    { key: "instrumentalness", label: "Instrumentalness" },
    { key: "liveness",         label: "Liveness"         },
    { key: "valence",          label: "Valence"          },
    { key: "tempo_norm",       label: "Tempo"            },
  ];

  // Use the shared colour map built by script.js so all charts stay in sync.
  function gColor(g) {
    if (window.genreColorMap) {
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

  const wrapper = document.getElementById("violin-container");
  if (!wrapper) { console.warn("violin: #violin-container not found"); return; }

  // ── Controls ──────────────────────────────────────────────────────────────
  const controls = document.createElement("div");
  controls.className = "vp-controls";

  const selLabel = document.createElement("span");
  selLabel.className = "vp-sel-label";
  selLabel.textContent = "Feature:";
  controls.appendChild(selLabel);

  FEATURES.forEach(function (f, i) {
    const btn = document.createElement("button");
    btn.className = "vp-feat-btn" + (i === 0 ? " is-active" : "");
    btn.textContent = f.label;
    btn.dataset.key = f.key;
    btn.addEventListener("click", function () {
      wrapper.querySelectorAll(".vp-feat-btn").forEach(b => b.classList.remove("is-active"));
      btn.classList.add("is-active");
      if (cachedRows) renderViolins(cachedRows, f.key);
    });
    controls.appendChild(btn);
  });

  wrapper.appendChild(controls);

  const chartDiv = document.createElement("div");
  chartDiv.id = "violin-chart";
  chartDiv.className = "vp-chart";
  wrapper.appendChild(chartDiv);

  let cachedRows = null;

  // ── Load ──────────────────────────────────────────────────────────────────
  d3.csv("./data/tsne_data.csv").then(function (rows) {
    cachedRows = rows;
    renderViolins(rows, FEATURES[0].key);
  }).catch(function (err) {
    console.error("violin: failed to load CSV", err);
    chartDiv.innerHTML = '<p class="wc-error">Could not load tsne_data.csv</p>';
  });

  // ── Render ────────────────────────────────────────────────────────────────
  function renderViolins(rows, featureKey) {
    chartDiv.innerHTML = "";

    // Collect per-genre values
    const byGenre = {};
    rows.forEach(function (d) {
      const g = (d.genre || "").toLowerCase().trim();
      const v = numOrNull(d[featureKey]);
      if (!g || v === null) return;
      if (!byGenre[g]) byGenre[g] = [];
      byGenre[g].push(v);
    });

    const genres = Object.keys(byGenre).sort();
    if (!genres.length) return;

    // Dimensions
    const margin = { top: 18, right: 20, bottom: 36, left: 52 };
    const totalW = chartDiv.clientWidth  || 680;
    const ROW_H  = 54;
    const totalH = genres.length * ROW_H + margin.top + margin.bottom;
    const W = totalW - margin.left - margin.right;
    const H = totalH - margin.top  - margin.bottom;

    const svg = d3.select(chartDiv).append("svg")
      .attr("width",  totalW)
      .attr("height", totalH)
      .attr("viewBox", `0 0 ${totalW} ${totalH}`)
      .attr("preserveAspectRatio", "xMidYMid meet");

    const g = svg.append("g").attr("transform", `translate(${margin.left},${margin.top})`);

    // X scale: 0-1
    const xScale = d3.scaleLinear().domain([0, 1]).range([0, W]);

    // Grid lines
    [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
      g.append("line")
        .attr("x1", xScale(v)).attr("x2", xScale(v))
        .attr("y1", 0).attr("y2", H)
        .attr("stroke", "rgba(255,255,255,0.05)")
        .attr("stroke-width", 1)
        .attr("stroke-dasharray", v === 0 || v === 1 ? "none" : "3,3");
      g.append("text")
        .attr("x", xScale(v)).attr("y", H + 18)
        .attr("text-anchor", "middle")
        .attr("font-size", 9)
        .attr("font-family", "'DM Sans', sans-serif")
        .attr("fill", "rgba(255,255,255,0.3)")
        .text(v.toFixed(2));
    });

    const ttip = d3.select("#tooltip");

    genres.forEach(function (genre, gi) {
      const vals  = byGenre[genre].slice().sort(d3.ascending);
      const color = gColor(genre);
      const yMid  = gi * ROW_H + ROW_H / 2;

      // KDE
      const bandwidth = 0.07;
      const kde = kernelDensityEstimator(kernelEpanechnikov(bandwidth),
        d3.range(0, 1.01, 0.01));
      const density = kde(vals);
      const maxDensity = d3.max(density, d => d[1]) || 1;
      const halfH = (ROW_H * 0.42);

      const yDensity = d => yMid - (d[1] / maxDensity) * halfH;

      const areaGen = d3.area()
        .x(d => xScale(d[0]))
        .y0(yMid)
        .y1(yDensity)
        .curve(d3.curveCatmullRom);

      const areaGenMirror = d3.area()
        .x(d => xScale(d[0]))
        .y0(yMid)
        .y1(d => yMid + (d[1] / maxDensity) * halfH)
        .curve(d3.curveCatmullRom);

      // Filled violin (upper half)
      g.append("path")
        .datum(density)
        .attr("d", areaGen)
        .attr("fill", color + "30")
        .attr("stroke", color)
        .attr("stroke-width", 1.2)
        .style("opacity", 0)
        .transition().duration(500).delay(gi * 40).style("opacity", 1);

      // Mirrored lower half
      g.append("path")
        .datum(density)
        .attr("d", areaGenMirror)
        .attr("fill", color + "30")
        .attr("stroke", color)
        .attr("stroke-width", 1.2)
        .style("opacity", 0)
        .transition().duration(500).delay(gi * 40).style("opacity", 1);

      // IQR box
      const q1  = d3.quantile(vals, 0.25);
      const med = d3.quantile(vals, 0.5);
      const q3  = d3.quantile(vals, 0.75);
      const boxH = Math.max(4, halfH * 0.45);

      g.append("rect")
        .attr("x", xScale(q1))
        .attr("y", yMid - boxH / 2)
        .attr("width", Math.max(1, xScale(q3) - xScale(q1)))
        .attr("height", boxH)
        .attr("fill", color + "55")
        .attr("stroke", color)
        .attr("stroke-width", 1)
        .attr("rx", 2)
        .style("opacity", 0)
        .transition().duration(400).delay(gi * 40 + 200).style("opacity", 1);

      // Median line
      g.append("line")
        .attr("x1", xScale(med)).attr("x2", xScale(med))
        .attr("y1", yMid - boxH / 2 - 2)
        .attr("y2", yMid + boxH / 2 + 2)
        .attr("stroke", "#fff")
        .attr("stroke-width", 1.8)
        .style("opacity", 0)
        .transition().duration(300).delay(gi * 40 + 350).style("opacity", 0.9);

      // Mean dot
      const mean = d3.mean(vals);
      g.append("circle")
        .attr("cx", xScale(mean)).attr("cy", yMid)
        .attr("r", 2.5)
        .attr("fill", "#fff")
        .attr("stroke", color)
        .attr("stroke-width", 1)
        .style("opacity", 0)
        .transition().duration(300).delay(gi * 40 + 400).style("opacity", 0.85);

      // Genre label (Y axis)
      g.append("text")
        .attr("x", -8)
        .attr("y", yMid)
        .attr("text-anchor", "end")
        .attr("dominant-baseline", "middle")
        .attr("font-size", 10)
        .attr("font-weight", "600")
        .attr("font-family", "'DM Sans', sans-serif")
        .attr("fill", color)
        .text(genre.toUpperCase());

      // Invisible hover band
      g.append("rect")
        .attr("x", 0).attr("y", gi * ROW_H)
        .attr("width", W).attr("height", ROW_H)
        .attr("fill", "transparent")
        .style("cursor", "default")
        .on("mousemove", function (event) {
          ttip.style("display", "block").style("opacity", 1)
            .html(
              `<strong>${genre.toUpperCase()}</strong><br>` +
              `n = ${vals.length}<br>` +
              `Median: ${med.toFixed(2)} &nbsp;·&nbsp; Mean: ${mean.toFixed(2)}<br>` +
              `IQR: ${q1.toFixed(2)} – ${q3.toFixed(2)}`
            )
            .style("left", (event.pageX + 15) + "px")
            .style("top",  (event.pageY - 20) + "px");
        })
        .on("mouseleave", function () {
          ttip.style("opacity", 0).style("display", "none");
        });
    });
  }

  // ── KDE helpers ───────────────────────────────────────────────────────────
  function kernelDensityEstimator(kernel, X) {
    return function (V) {
      return X.map(function (x) { return [x, d3.mean(V, v => kernel(x - v))]; });
    };
  }
  function kernelEpanechnikov(k) {
    return function (v) {
      return Math.abs(v /= k) <= 1 ? 0.75 * (1 - v * v) / k : 0;
    };
  }

})();