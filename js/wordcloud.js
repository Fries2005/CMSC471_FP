// ── Word Cloud: Genre Lyrics ──────────────────────────────────────────────────
// Interactivity:
//   • Tooltips on each word (rank, count, %).
//   • Click word → dim other words; emit wordcloud:wordClick (genre+word) to t-SNE.
//   • Click genre label → emit wordcloud:genreClick; isolate that genre in t-SNE.
//   • tsne:genreHover → pulse / dim cards.
//   • panel:wordHighlight { word, genre } → glow matching word in clouds.
//   • panel:wordClear → reset all cloud highlights.

(function () {

  var STOP_WORDS = new Set([
    "chorus","verse","bridge","hook","intro","outro","pre","prechorius",
    "prechorus","pre-chorus","refrain","interlude","instrumental","repeat",
    "section","tag","coda","break","drop","build","breakdown",
    "a","an","the","this","that","these","those","some","any","every",
    "each","all","both","either","neither","no","such","what","which",
    "whose","whatever","whichever",
    "i","i'm","i'll","i'd","me","my","myself","we","our","ours","ourselves",
    "you","your","you're","yours","yourself","yourselves","he","him","his",
    "himself","she","her","hers","herself","it","its","itself","they","them",
    "their","theirs","themselves","who","whom","whose","whoever","whomever",
    "and","but","or","nor","so","yet","for","both","either","neither",
    "not","only","just","whether","although","though","even","while",
    "whereas","because","since","as","if","unless","until","when",
    "whenever","where","wherever","after","before","once","than",
    "in","on","at","by","for","with","about","against","between",
    "into","through","during","before","after","above","below","from",
    "up","down","to","of","off","over","under","again","further",
    "then","once","out","along","across","behind","beyond","inside",
    "outside","around","without","within","among","throughout","upon",
    "onto","per","via","near","beside","besides","except","past",
    "is","am","are","was","were","be","been","being","have","has","had",
    "do","don't","can't","does","did","will","won't","would","could","should",
    "may","might","must","shall","can","need","dare","ought","used","get",
    "got","gotten","let","make","made","go","goes","went","come","came",
    "take","took","know","knew","think","thought","see","saw","look","want",
    "use","try","say","said","tell","told","give","gave","keep","kept",
    "feel","felt","seem","show","showed","find","found","leave","left",
    "call","put","set","turn","help","start","move","live","believe","hold",
    "bring","happen","write","provide","sit","stand","lose","pay","meet",
    "run","ask","need","stay","play","hear","heard","let","begin","began",
    "love","loved",
    "yeah","yea","yep","ok","okay","oh","ah","uh","um","hmm","hm",
    "na","la","da","ha","hey","ooh","woah","whoa","aye","ay","eh",
    "nah","ya","gonna","gotta","wanna","kinda","sorta","lotta","lemme",
    "gimme","tryna","bout","cuz","cos","cause","tho","thru","em",
    "im","ive","id","its","it's","dont","doesnt","didnt","cant","wont",
    "wouldnt","couldnt","shouldnt","isnt","arent","wasnt","werent",
    "havent","hasnt","hadnt","aint","ll","ve","re","s","t","d","m",
    "like","just","now","still","way","back","time","day","night",
    "right","left","never","always","ever","here","there","where",
    "more","most","much","many","little","few","own","same","other",
    "another","new","old","first","last","long","great","little",
    "good","bad","real","true","us","no","yes","maybe","really",
    "very","too","also","only","even","well","else","never","always",
    "again","already","almost","enough","every","off","away","down",
    "up","around","something","anything","nothing","everything",
    "someone","anyone","no one","everyone","somewhere","anywhere",
    "nowhere","everywhere","thing","things","kind","lot","bit",
    "fuck","fuckin","fucking","shit","bitch","ass","damn","hell",
    "nigga","niggas","niggaz","hoe","hoes","ho","dick","cock",
    "pussy","cunt","bastard","motherfucker","mf","wtf","stfu",
    "bro","bruh","fam","yo","fr","rn","tbh","lmao","lol",
  ]);

  function tokenize(text) {
    return text
      .toLowerCase()
      .replace(/\[.*?\]/g, " ")
      .replace(/[^a-z']+/g, " ")
      .replace(/\s'+|'+\s/g, " ")
      .split(/\s+/)
      .filter(function(w) { return w.length > 2 && !STOP_WORDS.has(w); });
  }

  function wordFreq(tokens) {
    var freq = {};
    for (var i = 0; i < tokens.length; i++) {
      var w = tokens[i];
      freq[w] = (freq[w] || 0) + 1;
    }
    return freq;
  }

  function topN(freq, n) {
    return Object.entries(freq)
      .sort(function(a, b) { return b[1] - a[1]; })
      .slice(0, n || 60)
      .map(function(e, rank) { return { text: e[0], size: e[1], rank: rank + 1 }; });
  }

  var PALETTES = {
    rap:     ["#f7b731","#fc5c65","#fd9644","#eb3b5a","#f8c291","#e55039","#ffd32a"],
    rock:    ["#4b7bec","#778ca3","#a5b1c2","#2d98da","#45aaf2","#d1d8e0","#8854d0"],
    rb:      ["#26de81","#2bcbba","#0fb9b1","#20bf6b","#45aaf2","#a29bfe","#fd79a8"],
    pop:     ["#fd79a8","#fdcb6e","#e17055","#ff7675","#fab1a0","#ff4757","#f368e0"],
    misc:    ["#a29bfe","#6c5ce7","#74b9ff","#0984e3","#dfe6e9","#b2bec3","#81ecec"],
    country: ["#e17055","#d4a574","#f0b429","#c8a26d","#a0785a","#e88b4a","#f5cba7"],
  };
  var DEFAULT_PALETTE = ["#74b9ff","#a29bfe","#fd79a8","#55efc4","#fdcb6e","#e17055","#81ecec"];

  function pickColor(genre, i) {
    var pal = PALETTES[genre] || DEFAULT_PALETTE;
    return pal[i % pal.length];
  }

  // ── Event bus ─────────────────────────────────────────────────────────────
  if (!window.genreEvents) {
    window.genreEvents = {
      _listeners: {},
      on: function(event, fn) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(fn);
      },
      emit: function(event, data) {
        (this._listeners[event] || []).forEach(function(fn) { fn(data); });
      }
    };
  }

  var tooltip = d3.select("#tooltip");

  // ── Main ──────────────────────────────────────────────────────────────────
  var container = document.getElementById("wc-grid");
  if (!container) return;
  container.innerHTML = '<p class="wc-loading">Loading lyrics data…</p>';

  // Maps for cross-card communication
  var genreCards     = new Map();   // genre → card element
  var genreTextSels  = new Map();   // genre → d3 selection of text nodes
  var activeWordFilter = null;      // { genre, word } | null

  d3.csv("./data/song_lyrics_short.csv").then(function(rows) {

    var byGenre = {};
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var tag = (row.tag || "").trim().toLowerCase();
      if (!tag) continue;
      if (!byGenre[tag]) byGenre[tag] = [];
      byGenre[tag].push(row.lyrics || "");
    }

    var genres = Object.entries(byGenre)
      .sort(function(a, b) { return b[1].length - a[1].length; })
      .slice(0, 20)
      .map(function(e) { return e[0]; });

    container.innerHTML = "";
    var COLS = Math.min(5, genres.length);
    container.style.setProperty("--wc-cols", COLS);

    genres.forEach(function(genre) {
      var allText    = byGenre[genre].join(" ");
      var tokens     = tokenize(allText);
      var freq       = wordFreq(tokens);
      var words      = topN(freq, 60);
      var totalToks  = tokens.length;

      if (!words.length) return;

      var maxF = words[0].size;
      var minF = words[words.length - 1].size;
      var SIZE_MAX = 38, SIZE_MIN = 10;

      var sized = words.map(function(w, i) {
        return {
          text:     w.text,
          rawCount: w.size,
          rank:     w.rank,
          pct:      ((w.size / totalToks) * 100).toFixed(2),
          size:     minF === maxF
            ? SIZE_MAX
            : SIZE_MIN + (SIZE_MAX - SIZE_MIN) * Math.sqrt((w.size - minF) / (maxF - minF)),
          color: pickColor(genre, i),
        };
      });

      // ── Card DOM ──
      var card = document.createElement("div");
      card.className = "wc-card";
      card.dataset.genre = genre;

      var label = document.createElement("div");
      label.className = "wc-label";
      label.textContent = genre.toUpperCase();
      var labelColor = (PALETTES[genre] || DEFAULT_PALETTE)[0];
      label.style.color = labelColor;
      label.title = "Click to focus " + genre + " in t-SNE";
      label.style.cursor = "pointer";
      label.addEventListener("click", function() {
        window.genreEvents.emit("wordcloud:genreClick", { genre: genre });
      });
      card.appendChild(label);

      var svgWrap = document.createElement("div");
      svgWrap.className = "wc-svg-wrap";
      card.appendChild(svgWrap);
      container.appendChild(card);

      genreCards.set(genre, card);

      // ── t-SNE legend hover → card highlight ──
      window.genreEvents.on("tsne:genreHover", function(payload) {
        var g = payload.genre;
        card.classList.toggle("wc-card--active",  g === genre);
        card.classList.toggle("wc-card--dimmed",  g !== null && g !== genre);
      });
      window.genreEvents.on("tsne:genreLeave", function() {
        card.classList.remove("wc-card--active", "wc-card--dimmed");
      });

      // ── Build word cloud ──
      requestAnimationFrame(function() {
        var W = svgWrap.clientWidth  || 220;
        var H = svgWrap.clientHeight || 180;

        var layout = d3.layout.cloud()
          .size([W, H])
          .words(sized)
          .padding(2)
          .rotate(function() { return Math.random() < 0.7 ? 0 : (Math.random() < 0.5 ? 90 : -90); })
          .font("'DM Sans', sans-serif")
          .fontWeight(function(d) { return d.size > 22 ? "700" : "500"; })
          .fontSize(function(d) { return d.size; })
          .on("end", draw);

        layout.start();

        function draw(placedWords) {
          var svgEl = d3.select(svgWrap).append("svg")
            .attr("width", W).attr("height", H)
            .attr("viewBox", (-W/2) + " " + (-H/2) + " " + W + " " + H)
            .attr("preserveAspectRatio", "xMidYMid meet");

          var texts = svgEl.append("g")
            .selectAll("text")
            .data(placedWords)
            .enter()
            .append("text")
            .style("font-family", "'DM Sans', sans-serif")
            .style("font-size",   function(d) { return d.size + "px"; })
            .style("font-weight", function(d) { return d.size > 22 ? "700" : "500"; })
            .style("fill",        function(d) { return d.color; })
            .style("opacity", 0)
            .style("cursor", "pointer")
            .attr("text-anchor", "middle")
            .attr("transform",   function(d) { return "translate(" + d.x + "," + d.y + ") rotate(" + d.rotate + ")"; })
            .text(function(d) { return d.text; });

          // Store selection for external highlight
          genreTextSels.set(genre, texts);

          // Entrance
          texts.transition()
            .delay(function(_, i) { return i * 18; })
            .duration(400)
            .style("opacity", 0.92);

          // ── Tooltip ──
          texts
            .on("mouseover", function(event, d) {
              d3.select(this).transition().duration(120)
                .style("opacity", 1)
                .style("filter", "drop-shadow(0 0 6px " + d.color + ")");
              tooltip.style("opacity", 1).style("display", "block")
                .html(
                  "<strong>" + d.text + "</strong><br/>" +
                  "<span style='color:#aaa;font-size:11px'>in " + genre.toUpperCase() + "</span><br/>" +
                  "Rank: #" + d.rank + " &nbsp;·&nbsp; Count: " + d.rawCount + "<br/>" +
                  "~" + d.pct + "% of lyrics"
                )
                .style("left", (event.pageX + 15) + "px")
                .style("top",  (event.pageY - 20) + "px");
            })
            .on("mousemove", function(event) {
              tooltip.style("left", (event.pageX + 15) + "px")
                     .style("top",  (event.pageY - 20) + "px");
            })
            .on("mouseout", function(event, d) {
              // Only reset if this word isn't the active filter
              var isActive = activeWordFilter &&
                activeWordFilter.genre === genre &&
                activeWordFilter.word === d.text;
              if (!isActive) {
                d3.select(this).transition().duration(200)
                  .style("opacity", 0.92)
                  .style("filter", "none");
              }
              tooltip.style("opacity", 0).style("display", "none");
            });

          // ── Click a word ──
          texts.on("click", function(event, d) {
            event.stopPropagation();
            var isSame = activeWordFilter &&
              activeWordFilter.genre === genre &&
              activeWordFilter.word === d.text;

            if (isSame) {
              activeWordFilter = null;
              window.genreEvents.emit("wordcloud:wordClick", { genre: null, word: null });
              texts.transition().duration(200).style("opacity", 0.92).style("filter", "none");
              card.classList.remove("wc-card--selected");
            } else {
              activeWordFilter = { genre: genre, word: d.text };
              window.genreEvents.emit("wordcloud:wordClick", { genre: genre, word: d.text });
              texts.transition().duration(200)
                .style("opacity", function(wd) { return wd.text === d.text ? 1 : 0.18; })
                .style("filter",  function(wd) { return wd.text === d.text ? "drop-shadow(0 0 8px " + d.color + ")" : "none"; });
              card.classList.add("wc-card--selected");
            }
          });

          // Another card's word was clicked — reset this card
          window.genreEvents.on("wordcloud:wordClick", function(payload) {
            if (payload.genre !== genre && payload.genre !== null) {
              texts.transition().duration(200).style("opacity", 0.92).style("filter", "none");
              card.classList.remove("wc-card--selected");
            }
          });

          // ── panel:wordHighlight → glow matching word ──
          window.genreEvents.on("panel:wordHighlight", function(payload) {
            var word       = payload.word;
            var fromGenre  = payload.genre;
            if (fromGenre !== genre) return;  // only affect the relevant cloud
            texts.transition().duration(200)
              .style("opacity", function(wd) { return wd.text === word ? 1 : 0.18; })
              .style("filter",  function(wd) {
                if (wd.text !== word) return "none";
                return "drop-shadow(0 0 10px " + wd.color + ")";
              });
            card.classList.add("wc-card--selected");
          });

          window.genreEvents.on("panel:wordClear", function() {
            texts.transition().duration(200).style("opacity", 0.92).style("filter", "none");
            card.classList.remove("wc-card--selected");
            activeWordFilter = null;
          });
        }
      });
    });

  }).catch(function(err) {
    console.error("Word cloud: failed to load CSV", err);
    container.innerHTML = '<p class="wc-error">Could not load data. Run via a local web server (e.g. <code>npx serve</code>).</p>';
  });

})();