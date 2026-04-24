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

d3.csv("./data/tsne_data.csv").then(data => {

    data.forEach(d => {
        d.x = +d.x;
        d.y = +d.y;
    });

    const xExtent = d3.extent(data, d => d.x);
    const yExtent = d3.extent(data, d => d.y);

    const xPadding = (xExtent[1] - xExtent[0]) * 0.05;
    const yPadding = (yExtent[1] - yExtent[0]) * 0.05;

    const xScale = d3.scaleLinear()
        .domain([xExtent[0] - xPadding, xExtent[1] + xPadding])
        .range([0, width]);

    const yScale = d3.scaleLinear()
        .domain([yExtent[0] - yPadding, yExtent[1] + yPadding])
        .range([height, 0]);

    const genres = Array.from(new Set(data.map(d => d.genre)));
    const colorScale = d3.scaleSequential()
        .domain([0, genres.length])
        .interpolator(d3.interpolateSinebow);

    const genreColorMap = new Map(genres.map((g, i) => [g, colorScale(i)]));
    const genreSorted = genres.slice().sort((a, b) => a.localeCompare(b));
    const totalGenres = genreSorted.length;

    function clearHoverState() {
        if (hoveredCircle) {
            hoveredCircle
                .style("opacity", 0.7)
                .style("stroke", "#121212")
                .style("stroke-width", 0.5 / currentZoomK);
            hoveredCircle = null;
        }
        tooltip.style("opacity", 0).style("display", "none");
    }

    function applyGenreVisibility() {
        clearHoverState();
        circles.attr("display", d => hiddenGenres.has(d.genre) ? "none" : null);
        d3.select("#tsne-legend")
            .selectAll("button.legend-genre-item")
            .classed("is-hidden", d => hiddenGenres.has(d))
            .attr("aria-pressed", d => hiddenGenres.has(d) ? "true" : "false");

        const toggleAllBtn = d3.select("#legend-toggle-all");
        const allHidden = hiddenGenres.size === totalGenres;
        toggleAllBtn
            .attr("aria-pressed", allHidden ? "true" : "false")
            .text(allHidden ? "Show all genres" : "Hide all genres");
    }

    const toggleAllBtn = d3.select("#tsne-legend")
        .append("button")
        .attr("type", "button")
        .attr("id", "legend-toggle-all")
        .attr("class", "legend-toggle-all")
        .attr("aria-pressed", "false")
        .text("Hide all genres");

    toggleAllBtn.on("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const allHidden = hiddenGenres.size === totalGenres;
        hiddenGenres.clear();
        if (!allHidden) {
            genreSorted.forEach((genre) => hiddenGenres.add(genre));
        }
        applyGenreVisibility();
    });

    const legendButtons = d3.select("#tsne-legend")
        .selectAll("button.legend-genre-item")
        .data(genreSorted)
        .join(
            enter => {
                const b = enter.append("button")
                    .attr("type", "button")
                    .attr("class", "legend-genre legend-genre-item")
                    .attr("aria-pressed", "false");
                b.append("span").attr("class", "legend-swatch");
                b.append("span").attr("class", "legend-label");
                return b;
            }
        );

    legendButtons
        .select(".legend-swatch")
        .style("background", d => genreColorMap.get(d));

    legendButtons
        .select(".legend-label")
        .text(d => d);

    legendButtons.on("click", (e, d) => {
        e.preventDefault();
        e.stopPropagation();
        if (hiddenGenres.has(d)) hiddenGenres.delete(d);
        else hiddenGenres.add(d);
        applyGenreVisibility();
    });

    const circles = g.selectAll("circle")
        .data(data)
        .enter()
        .append("circle")
        .attr("cx", d => xScale(d.x))
        .attr("cy", d => yScale(d.y))
        .attr("r", 3)
        .style("fill", d => genreColorMap.get(d.genre))
        .style("opacity", 0.7)
        .style("stroke", "#121212")
        .style("stroke-width", 0.5);

    applyGenreVisibility();

    circles.on("mouseover", function(event, d) {
        if (hiddenGenres.has(d.genre)) return;
        clearHoverState();
        hoveredCircle = d3.select(this);
        hoveredCircle
            .style("opacity", 1)
            .style("stroke", "#fff")
            .style("stroke-width", 1.5)
            .raise();

        tooltip.style("opacity", 1)
            .style("display", "block")
            .html(`
                <strong>${d.title}</strong><br/>
                Artist: ${d.artist}<br/>
                Genre: ${d.genre}
            `)
            .style("left", (event.pageX + 15) + "px")
            .style("top", (event.pageY - 20) + "px");
    })
    .on("mousemove", function(event, d) {
        if (hiddenGenres.has(d.genre)) return;
        tooltip.style("left", (event.pageX + 15) + "px")
            .style("top", (event.pageY - 20) + "px");
    })
    .on("mouseout", function() {
        clearHoverState();
    });

    svg.on("mouseleave", clearHoverState);

    const zoom = d3.zoom()
        .scaleExtent([1, 20])
        .extent([[0, 0], [width, height]])
        .translateExtent([[-width * 0.5, -height * 0.5], [width * 1.5, height * 1.5]])
        .on("zoom", (event) => {
            clearHoverState();
            currentZoomK = event.transform.k;
            g.attr("transform", event.transform);
            const newRadius = Math.max(1.5, 3 / Math.sqrt(event.transform.k));
            const sw = 0.5 / event.transform.k;
            circles.attr("r", newRadius).style("stroke-width", sw);
        });

    svg.call(zoom);
}).catch((err) => {
    console.error("Failed to load t-SNE data:", err);
    d3.select("#tsne-chart")
        .append("p")
        .attr("class", "viz-error")
        .style("color", "#e57373")
        .style("padding", "1rem")
        .style("font-size", "13px")
        .text("Could not load data/tsne_data.csv. Use a local web server (e.g. npx serve) if opening the page as a file.");
});
