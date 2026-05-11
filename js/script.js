// ── t-SNE Genre Clustering ────────────────────────────────────────────────────
// Event bus messages:
//   emit  "tsne:genreHover"      { genre }
//   emit  "tsne:genreLeave"      {}
//   emit  "tsne:songClick"       { song, allSongs, lyricsBySong }
//   emit  "tsne:songDeselect"    {}
//   emit  "tsne:neighbourSelect" { song }
//   listen "wordcloud:genreClick"  { genre }
//   listen "wordcloud:wordClick"   { genre, word }
//   listen "panel:wordHighlight"   { word, genre }
//   listen "panel:wordClear"       {}

if (!window.genreEvents) {
  window.genreEvents = {
    _listeners: {},
    on(event, fn) {
      if (!this._listeners[event]) this._listeners[event] = [];
      this._listeners[event].push(fn);
    },
    emit(event, data) {
      (this._listeners[event] || []).forEach(fn => fn(data));
    }
  };
}

const margin = { top: 12, right: 12, bottom: 12, left: 12 };
const chartHost = document.querySelector("#tsne-chart");
const hostWidth = chartHost?.clientWidth || 760;
const hostHeight = chartHost?.clientHeight || 560;
const width = Math.max(420, hostWidth - margin.left - margin.right);
const height = Math.max(320, hostHeight - margin.top - margin.bottom);

const svg = d3.select("#tsne-chart")
    .append("svg")
    .attr("width", width + margin.left + margin.right)
    .attr("height", height + margin.top + margin.bottom)
    .attr("viewBox", `0 0 ${width + margin.left + margin.right} ${height + margin.top + margin.bottom}`)
    .attr("preserveAspectRatio", "xMidYMid meet")
    .style("cursor", "crosshair");

const chartArea = svg.append("g")
    .attr("transform", `translate(${margin.left}, ${margin.top})`);

chartArea.append("defs").append("clipPath")
    .attr("id", "clip")
    .append("rect")
    .attr("width", width)
    .attr("height", height);

const g = chartArea.append("g")
    .attr("clip-path", "url(#clip)");

const tooltip = d3.select("#tooltip");
const hiddenGenres = new Set();
let hoveredCircle = null;
let currentZoomK = 1;
let isolatedGenre = null;
let selectedSong   = null;
let wordMatchSet   = null;

// ── Helpers ───────────────────────────────────────────────────────────────────
function normKey(title, artist) {
  return (title + "|||" + artist).toLowerCase();
}

function getBaseOpacity(d) {
  if (hiddenGenres.has(d.genre)) return 0;
  if (wordMatchSet !== null) {
    return wordMatchSet.has(normKey(d.title, d.artist)) ? 0.9 : 0.05;
  }
  if (isolatedGenre && d.genre !== isolatedGenre) return 0.08;
  return 0.7;
}

// ── Load both CSVs in parallel ────────────────────────────────────────────────
Promise.all([
  d3.csv("./data/tsne_data.csv"),
  d3.csv("./data/song_lyrics_short.csv").catch(() => [])
]).then(function(results) {
  var tsneData   = results[0];
  var lyricsRows = results[1];

  // ── Pre-process lyrics ────────────────────────────────────────────────────
  var STOP = new Set([
    "a","an","the","i","me","my","you","your","we","our","they","them","it","its",
    "he","she","him","her","and","but","or","so","yet","for","not","just","like",
    "yeah","oh","uh","na","la","da","gonna","gotta","wanna","ooh","hey","ay","eh",
    "in","on","at","by","to","of","up","down","from","with","into","out","off",
    "is","am","are","was","were","be","been","have","has","had","do","did","will",
    "get","got","go","come","know","think","see","want","say","said","make","made",
    "back","now","still","time","right","never","always","ever","here","there",
    "more","good","real","true","no","yes","well","again","already","lot","bit",
    "im","ive","id","dont","cant","wont","let","cause","chorus","verse","bridge",
    "ll","ve","re","s","t","d","m","em",
  ]);

  function tokenizeSimple(text) {
    return (text || "")
      .toLowerCase()
      .replace(/\[.*?\]/g, " ")
      .replace(/[^a-z']+/g, " ")
      .split(/\s+/)
      .filter(function(w) { return w.length > 2 && !STOP.has(w); });
  }

  var lyricsBySong    = new Map();
  var genreWordIndex  = new Map();  // genre → Map(word → Set(normKey))

  for (var i = 0; i < lyricsRows.length; i++) {
    var row    = lyricsRows[i];
    var title  = (row.title  || row.song  || "").trim();
    var artist = (row.artist || "").trim();
    var tag    = (row.tag    || "").trim().toLowerCase();
    if (!title) continue;

    var key    = normKey(title, artist);
    var tokens = tokenizeSimple(row.lyrics || "");
    var freq   = {};
    for (var j = 0; j < tokens.length; j++) {
      var w = tokens[j];
      freq[w] = (freq[w] || 0) + 1;
    }

    var topWords = Object.entries(freq)
      .sort(function(a, b) { return b[1] - a[1]; })
      .slice(0, 12)
      .map(function(e) { return { word: e[0], count: e[1] }; });

    lyricsBySong.set(key, topWords);

    // genre word index
    if (tag) {
      if (!genreWordIndex.has(tag)) genreWordIndex.set(tag, new Map());
      var wordMap     = genreWordIndex.get(tag);
      var uniqueWords = new Set(tokens);
      uniqueWords.forEach(function(ww) {
        if (!wordMap.has(ww)) wordMap.set(ww, new Set());
        wordMap.get(ww).add(key);
      });
    }
  }

  // ── t-SNE data ─────────────────────────────────────────────────────────────
  tsneData.forEach(function(d) { d.x = +d.x; d.y = +d.y; });

  var xExtent  = d3.extent(tsneData, function(d) { return d.x; });
  var yExtent  = d3.extent(tsneData, function(d) { return d.y; });
  var xPadding = (xExtent[1] - xExtent[0]) * 0.05;
  var yPadding = (yExtent[1] - yExtent[0]) * 0.05;

  var xScale = d3.scaleLinear()
    .domain([xExtent[0] - xPadding, xExtent[1] + xPadding])
    .range([0, width]);

  var yScale = d3.scaleLinear()
    .domain([yExtent[0] - yPadding, yExtent[1] + yPadding])
    .range([height, 0]);

  // ── Shared deterministic genre colour palette ──────────────────────────────
  // Exposed as window.genreColorMap so every other module (wordcloud, radar,
  // violin, brushSelect) can stay perfectly in sync with this chart.
  var GENRE_COLORS = {
    "r&b":     "#26de81",
    "hip-hop": "#f7b731",
    "rock":    "#4b7bec",
    "pop":     "#fd79a8",
    "misc":    "#a29bfe",
    "country": "#e17055",
    "edm":     "#81ecec",
    "latin":   "#fdcb6e",
  };
  // Fallback palette for any genre not in the map above
  var FALLBACK_COLORS = [
    "#74b9ff","#55efc4","#ff7675","#a29bfe","#ffeaa7",
    "#00cec9","#fd79a8","#6c5ce7","#fab1a0","#00b894",
  ];

  var genres        = Array.from(new Set(tsneData.map(function(d) { return d.genre; })));
  var genreColorMap = new Map();
  var _fallbackIdx  = 0;
  genres.forEach(function(g) {
    var key = (g || "").toLowerCase().trim();
    genreColorMap.set(g, GENRE_COLORS[key] || FALLBACK_COLORS[_fallbackIdx++ % FALLBACK_COLORS.length]);
  });
  // Expose globally so other modules share the exact same colours
  window.genreColorMap = genreColorMap;

  var genreSorted   = genres.slice().sort(function(a, b) { return a.localeCompare(b); });
  var totalGenres   = genreSorted.length;


  // ── Opacity helpers ────────────────────────────────────────────────────────
  function clearHoverState() {
    if (hoveredCircle) {
      hoveredCircle
        .style("opacity", function(d) { return getBaseOpacity(d); })
        .style("stroke", "#121212")
        .style("stroke-width", 0.5 / currentZoomK);
      hoveredCircle = null;
    }
    tooltip.style("opacity", 0).style("display", "none");
  }

  function applyOpacity(useTransition) {
    var sel = useTransition ? circles.transition().duration(300) : circles;
    sel
      .attr("display", function(d) { return hiddenGenres.has(d.genre) ? "none" : null; })
      .style("opacity", function(d) { return getBaseOpacity(d); });
  }

  function applyGenreVisibility() {
    clearHoverState();
    applyOpacity(true);
    d3.select("#tsne-legend")
      .selectAll("button.legend-genre-item")
      .classed("is-hidden", function(d) { return hiddenGenres.has(d); })
      .attr("aria-pressed", function(d) { return hiddenGenres.has(d) ? "true" : "false"; });
    var allHidden = hiddenGenres.size === totalGenres;
    d3.select("#legend-toggle-all")
      .attr("aria-pressed", allHidden ? "true" : "false")
      .text(allHidden ? "Show all genres" : "Hide all genres");
  }

  function applyIsolation() {
    legendButtons.classed("legend-genre--isolated",
      function(d) { return isolatedGenre !== null && d !== isolatedGenre; }
    );
    applyOpacity(true);
  }

  // ── Legend ─────────────────────────────────────────────────────────────────
  var toggleAllBtn = d3.select(".tsne-toolbar")
    .append("button")
    .attr("type", "button")
    .attr("id", "legend-toggle-all")
    .attr("class", "legend-toggle-all")
    .attr("aria-pressed", "false")
    .text("Hide all genres");

  toggleAllBtn.on("click", function(e) {
    e.preventDefault(); e.stopPropagation();
    var allHidden = hiddenGenres.size === totalGenres;
    hiddenGenres.clear();
    if (!allHidden) genreSorted.forEach(function(genre) { hiddenGenres.add(genre); });
    applyGenreVisibility();
  });

  var legendButtons = d3.select("#tsne-legend")
    .selectAll("button.legend-genre-item")
    .data(genreSorted)
    .join(function(enter) {
      var b = enter.append("button")
        .attr("type", "button")
        .attr("class", "legend-genre legend-genre-item")
        .attr("aria-pressed", "false");
      b.append("span").attr("class", "legend-swatch");
      b.append("span").attr("class", "legend-label");
      return b;
    });

  legendButtons.select(".legend-swatch").style("background", function(d) { return genreColorMap.get(d); });
  legendButtons.select(".legend-label").text(function(d) { return d; });

  legendButtons.on("click", function(e, d) {
    e.preventDefault(); e.stopPropagation();
    if (hiddenGenres.has(d)) hiddenGenres.delete(d);
    else hiddenGenres.add(d);
    applyGenreVisibility();
  });

  legendButtons
    .on("mouseenter.bus", function(e, d) { window.genreEvents.emit("tsne:genreHover", { genre: d }); })
    .on("mouseleave.bus", function()      { window.genreEvents.emit("tsne:genreLeave", {}); });

  // ── Dots ───────────────────────────────────────────────────────────────────
  var circles = g.selectAll("circle")
    .data(tsneData)
    .enter()
    .append("circle")
    .attr("cx", function(d) { return xScale(d.x); })
    .attr("cy", function(d) { return yScale(d.y); })
    .attr("r", 3)
    .style("fill", function(d) { return genreColorMap.get(d.genre); })
    .style("opacity", 0.7)
    .style("stroke", "#121212")
    .style("stroke-width", 0.5)
    .style("cursor", "pointer");

  applyGenreVisibility();

  circles
    .on("mouseover", function(event, d) {
      if (hiddenGenres.has(d.genre)) return;
      clearHoverState();
      hoveredCircle = d3.select(this);
      hoveredCircle
        .style("opacity", 1)
        .style("stroke", "#fff")
        .style("stroke-width", 1.5 / currentZoomK)
        .raise();
      tooltip.style("opacity", 1)
        .style("display", "block")
        .html("<strong>" + d.title + "</strong><br/>Artist: " + d.artist + "<br/>Genre: " + d.genre)
        .style("left", (event.pageX + 15) + "px")
        .style("top",  (event.pageY - 20) + "px");
    })
    .on("mousemove", function(event, d) {
      if (hiddenGenres.has(d.genre)) return;
      tooltip.style("left", (event.pageX + 15) + "px")
             .style("top",  (event.pageY - 20) + "px");
    })
    .on("mouseout", function() { clearHoverState(); });

  // Click a dot → open panel
  circles.on("click", function(event, d) {
    event.stopPropagation();
    if (hiddenGenres.has(d.genre)) return;

    if (selectedSong) {
      var prevKey = normKey(selectedSong.title, selectedSong.artist);
      circles.filter(function(c) { return normKey(c.title, c.artist) === prevKey; })
        .style("stroke", "#121212")
        .style("stroke-width", 0.5 / currentZoomK)
        .attr("r", Math.max(1.5, 3 / Math.sqrt(currentZoomK)));
    }

    selectedSong = d;
    d3.select(this)
      .style("stroke", "#fff")
      .style("stroke-width", 2 / currentZoomK)
      .attr("r", Math.max(3, 5 / Math.sqrt(currentZoomK)))
      .raise();

    window.genreEvents.emit("tsne:songClick", {
      song: d,
      allSongs: tsneData,
      lyricsBySong: lyricsBySong,
    });
  });

  svg.on("mouseleave", clearHoverState);

  window.genreEvents.on("tsne:songDeselect", function() {
    if (selectedSong) {
      var k = normKey(selectedSong.title, selectedSong.artist);
      circles.filter(function(c) { return normKey(c.title, c.artist) === k; })
        .style("stroke", "#121212")
        .style("stroke-width", 0.5 / currentZoomK)
        .attr("r", Math.max(1.5, 3 / Math.sqrt(currentZoomK)));
      selectedSong = null;
    }
  });

  window.genreEvents.on("tsne:neighbourSelect", function(payload) {
    var song = payload.song;
    if (selectedSong) {
      var pk = normKey(selectedSong.title, selectedSong.artist);
      circles.filter(function(c) { return normKey(c.title, c.artist) === pk; })
        .style("stroke", "#121212")
        .style("stroke-width", 0.5 / currentZoomK)
        .attr("r", Math.max(1.5, 3 / Math.sqrt(currentZoomK)));
    }
    selectedSong = song;
    var sk = normKey(song.title, song.artist);
    circles.filter(function(d) { return normKey(d.title, d.artist) === sk; })
      .style("stroke", "#fff")
      .style("stroke-width", 2 / currentZoomK)
      .attr("r", Math.max(3, 5 / Math.sqrt(currentZoomK)))
      .raise();
  });

  // ── Word-cloud events ──────────────────────────────────────────────────────
  window.genreEvents.on("wordcloud:genreClick", function(payload) {
    var genre = payload.genre;
    isolatedGenre = isolatedGenre === genre ? null : genre;
    wordMatchSet  = null;
    applyIsolation();
  });

  window.genreEvents.on("wordcloud:wordClick", function(payload) {
    var genre = payload.genre;
    var word  = payload.word;
    if (!genre || !word) {
      isolatedGenre = null;
      wordMatchSet  = null;
    } else {
      isolatedGenre = genre;
      var matchKeys = (genreWordIndex.get(genre) || new Map()).get(word) || new Set();
      wordMatchSet  = matchKeys.size > 0 ? matchKeys : null;

      if (wordMatchSet) {
        circles
          .filter(function(d) { return d.genre === genre && wordMatchSet.has(normKey(d.title, d.artist)); })
          .raise()
          .transition().duration(180)
          .attr("r", Math.max(3, 6 / Math.sqrt(currentZoomK)))
          .transition().duration(300)
          .attr("r", Math.max(1.5, 3 / Math.sqrt(currentZoomK)));
      }
    }
    applyIsolation();
  });

  // ── Panel word highlight ───────────────────────────────────────────────────
  window.genreEvents.on("panel:wordHighlight", function(payload) {
    var word  = payload.word;
    var genre = payload.genre;
    var matchKeys = (genreWordIndex.get(genre) || new Map()).get(word) || new Set();
    wordMatchSet  = matchKeys.size > 0 ? matchKeys : null;
    isolatedGenre = genre;
    applyOpacity(true);

    if (wordMatchSet) {
      circles
        .filter(function(d) { return wordMatchSet.has(normKey(d.title, d.artist)); })
        .raise()
        .transition().duration(180)
        .attr("r", Math.max(3, 6 / Math.sqrt(currentZoomK)))
        .transition().duration(300)
        .attr("r", Math.max(1.5, 3 / Math.sqrt(currentZoomK)));
    }
  });

  window.genreEvents.on("panel:wordClear", function() {
    wordMatchSet  = null;
    isolatedGenre = null;
    applyOpacity(true);
    legendButtons.classed("legend-genre--isolated", false);
  });

  // ── Zoom ───────────────────────────────────────────────────────────────────
  var zoom = d3.zoom()
    .scaleExtent([1, 20])
    .extent([[0, 0], [width, height]])
    .translateExtent([[-width * 0.5, -height * 0.5], [width * 1.5, height * 1.5]])
    .on("zoom", function(event) {
      clearHoverState();
      currentZoomK = event.transform.k;
      g.attr("transform", event.transform);
      var newRadius = Math.max(1.5, 3 / Math.sqrt(event.transform.k));
      circles.attr("r", newRadius).style("stroke-width", 0.5 / event.transform.k);
    });

  svg.call(zoom);
  window.tsneSvg = svg;
  window.tsneZoom = zoom;
  window.tsneData = tsneData;
  window.lyricsBySong = lyricsBySong;

}).catch(function(err) {
  console.error("Failed to load data:", err);
  d3.select("#tsne-chart")
    .append("p")
    .attr("class", "viz-error")
    .style("color", "#e57373")
    .style("padding", "1rem")
    .style("font-size", "13px")
    .text("Could not load data/tsne_data.csv. Use a local web server (e.g. npx serve).");
});