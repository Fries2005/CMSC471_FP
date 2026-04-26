// ── Word Cloud: Genre Lyrics ──────────────────────────────────────────────────
// Uses d3-cloud (Jason Davies) for non-overlapping layout.
// Reads song_lyrics_short.csv, groups by tag, picks top 20 genres,
// and renders a word cloud for each genre in a responsive grid.

(function () {

  // ── Stop-word list ────────────────────────────────────────────────────────
  // Covers: song structure, conjugations, conjunctions, prepositions,
  // filler words, common articles / pronouns, and explicit terms.
  const STOP_WORDS = new Set([
    // ── song structure ──
    "chorus","verse","bridge","hook","intro","outro","pre","prechorius",
    "prechorus","pre-chorus","refrain","interlude","instrumental","repeat",
    "section","tag","coda","break","drop","build","breakdown",
    // ── articles / determiners ──
    "a","an","the","this","that","these","those","some","any","every",
    "each","all","both","either","neither","no","such","what","which",
    "whose","whatever","whichever",
    // ── pronouns ──
    "i", "i'm", "i'll", "i'd", "me","my","myself","we","our","ours","ourselves","you","your", "you're", 
    "yours","yourself","yourselves","he","him","his","himself","she",
    "her","hers","herself","it","its","itself","they","them","their",
    "theirs","themselves","who","whom","whose","whoever","whomever",
    // ── conjunctions ──
    "and","but","or","nor","so","yet","for","both","either","neither",
    "not","only","just","whether","although","though","even","while",
    "whereas","because","since","as","if","unless","until","when",
    "whenever","where","wherever","after","before","once","than",
    // ── prepositions ──
    "in","on","at","by","for","with","about","against","between",
    "into","through","during","before","after","above","below","from",
    "up","down","to","of","off","over","under","again","further",
    "then","once","out","along","across","behind","beyond","inside",
    "outside","around","without","within","among","throughout","upon",
    "onto","per","via","near","beside","besides","except","past",
    // ── auxiliary / common verbs ──
    "is","am","are","was","were","be","been","being","have","has","had",
    "do", "don't", "can't", "does","did","will", "won't", "would","could","should","may","might",
    "must","shall","can","need","dare","ought","used","get","got","gotten",
    "let","make","made","go","goes","went","come","came","take","took",
    "know","knew","think","thought","see","saw","look","want","use","try",
    "say","said","tell","told","give","gave","keep","kept","feel","felt",
    "seem","show","showed","find","found","leave","left","call","put",
    "set","turn","help","start","move","live","believe","hold","bring",
    "happen","write","provide","sit","stand","lose","pay","meet","run",
    "ask","need","stay","play","hear","heard","let","begin","began","love","loved",
    // ── filler / discourse ──
    "yeah","yea","yep","ok","okay","oh","ah","uh","um","hmm","hm",
    "na","la","da","ha","hey","ooh","woah","whoa","aye","ay","eh",
    "nah","ya","gonna","gotta","wanna","kinda","sorta","lotta","lemme",
    "gimme","tryna","bout","cuz","cos","cause","tho","thru","em",
    "im","ive","id","its", "it's", "dont","doesnt","didnt","cant","wont",
    "wouldnt","couldnt","shouldnt","isnt","arent","wasnt","werent",
    "havent","hasnt","hadnt","aint","ll","ve","re","s","t","d","m",
    // ── very generic words ──
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
    // ── explicit / censored terms for censoring (common) ──
    "fuck","fuckin","fucking","shit","bitch","ass","damn","hell",
    "nigga","niggas","niggaz","hoe","hoes","ho","dick","cock",
    "pussy","cunt","bastard","motherfucker","mf","wtf","stfu",
    "bro","bruh","fam","yo","fr","rn","tbh","lmao","lol",
  ]);

  function tokenize(text) {
    return text
      .toLowerCase()
      // remove content in brackets (e.g. [Chorus: Artist])
      .replace(/\[.*?\]/g, " ")
      // keep only letters and apostrophes
      .replace(/[^a-z']+/g, " ")
      // remove standalone apostrophes
      .replace(/\s'+|'+\s/g, " ")
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  }

  function wordFreq(tokens) {
    const freq = {};
    for (const w of tokens) freq[w] = (freq[w] || 0) + 1;
    return freq;
  }

  function topN(freq, n = 60) {
    return Object.entries(freq)
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([text, size]) => ({ text, size }));
  }

  // ── Colour palettes per genre ─────────────────────────────────────────────
  const PALETTES = {
    rap:     ["#f7b731","#fc5c65","#fd9644","#eb3b5a","#f8c291","#e55039","#ffd32a"],
    rock:    ["#4b7bec","#778ca3","#a5b1c2","#2d98da","#45aaf2","#d1d8e0","#8854d0"],
    rb:      ["#26de81","#2bcbba","#0fb9b1","#20bf6b","#45aaf2","#a29bfe","#fd79a8"],
    pop:     ["#fd79a8","#fdcb6e","#e17055","#ff7675","#fab1a0","#ff4757","#f368e0"],
    misc:    ["#a29bfe","#6c5ce7","#74b9ff","#0984e3","#dfe6e9","#b2bec3","#81ecec"],
    country: ["#e17055","#d4a574","#f0b429","#c8a26d","#a0785a","#e88b4a","#f5cba7"],
  };
  const DEFAULT_PALETTE = ["#74b9ff","#a29bfe","#fd79a8","#55efc4","#fdcb6e","#e17055","#81ecec"];

  function pickColor(genre, i) {
    const pal = PALETTES[genre] || DEFAULT_PALETTE;
    return pal[i % pal.length];
  }

  // ── Main ──────────────────────────────────────────────────────────────────
  const container = document.getElementById("wc-grid");
  if (!container) return;

  // Show loading state
  container.innerHTML = `<p class="wc-loading">Loading lyrics data…</p>`;

  d3.csv("./data/song_lyrics_short.csv").then(rows => {

    // Group lyrics by tag
    const byGenre = {};
    for (const row of rows) {
      const tag = (row.tag || "").trim().toLowerCase();
      if (!tag) continue;
      if (!byGenre[tag]) byGenre[tag] = [];
      byGenre[tag].push(row.lyrics || "");
    }

    // Sort genres by song count desc, take up to 20
    const genres = Object.entries(byGenre)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 20)
      .map(([g]) => g);

    container.innerHTML = "";

    // Grid sizing: fill up to 5 columns
    const COLS = Math.min(5, genres.length);
    container.style.setProperty("--wc-cols", COLS);

    genres.forEach(genre => {
      const allText = byGenre[genre].join(" ");
      const tokens = tokenize(allText);
      const freq = wordFreq(tokens);
      const words = topN(freq, 60);

      if (!words.length) return;

      // Normalise sizes to a px range
      const maxF = words[0].size;
      const minF = words[words.length - 1].size;
      const SIZE_MAX = 38, SIZE_MIN = 10;
      const sized = words.map((w, i) => ({
        text: w.text,
        // sqrt scaling looks better visually
        size: minF === maxF
          ? SIZE_MAX
          : SIZE_MIN + (SIZE_MAX - SIZE_MIN) * Math.sqrt((w.size - minF) / (maxF - minF)),
        color: pickColor(genre, i),
      }));

      // Card
      const card = document.createElement("div");
      card.className = "wc-card";

      const label = document.createElement("div");
      label.className = "wc-label";
      label.textContent = genre.toUpperCase();
      label.style.color = (PALETTES[genre] || DEFAULT_PALETTE)[0];
      card.appendChild(label);

      const svgWrap = document.createElement("div");
      svgWrap.className = "wc-svg-wrap";
      card.appendChild(svgWrap);
      container.appendChild(card);

      // Responsive size: use card width once in DOM
      requestAnimationFrame(() => {
        const W = svgWrap.clientWidth || 220;
        const H = svgWrap.clientHeight || 180;

        const layout = d3.layout.cloud()
          .size([W, H])
          .words(sized)
          .padding(2)
          .rotate(() => (Math.random() < 0.7 ? 0 : (Math.random() < 0.5 ? 90 : -90)))
          .font("'DM Sans', sans-serif")
          .fontWeight(d => d.size > 22 ? "700" : "500")
          .fontSize(d => d.size)
          .on("end", draw);

        layout.start();

        function draw(words) {
          const svg = d3.select(svgWrap).append("svg")
            .attr("width", W)
            .attr("height", H)
            .attr("viewBox", `${-W/2} ${-H/2} ${W} ${H}`)
            .attr("preserveAspectRatio", "xMidYMid meet");

          svg.append("g")
            .selectAll("text")
            .data(words)
            .enter()
            .append("text")
            .style("font-family", "'DM Sans', sans-serif")
            .style("font-size", d => `${d.size}px`)
            .style("font-weight", d => d.size > 22 ? "700" : "500")
            .style("fill", d => d.color)
            .style("opacity", 0)
            .attr("text-anchor", "middle")
            .attr("transform", d => `translate(${d.x},${d.y}) rotate(${d.rotate})`)
            .text(d => d.text)
            .transition()
            .delay((_, i) => i * 18)
            .duration(400)
            .style("opacity", 0.92);
        }
      });
    });

  }).catch(err => {
    console.error("Word cloud: failed to load CSV", err);
    container.innerHTML = `<p class="wc-error">Could not load data. Run via a local web server (e.g. <code>npx serve</code>).</p>`;
  });

})();