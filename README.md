After ideating and developing the concept for each of our visualizations, our team split work equally across the two main visualizations:

## <u><b>T-SNE Clustering & Song Exploration</b></u>

### Andy
- Created the initial bubble visualization for the t-SNE plot
- Developed the tooltip system displaying title, artist, and genre information
- Wrote the Python script for generating t-SNE embeddings
- Added an interactive legend with genre filtering
- Fixed the nearest-neighbor issue in song recommendations
- Added Apple Music audio previews
- Improved webpage card formatting and layout

### Valentina
- Built the base song information panel
- Added Spotify/YouTube links, keywords, and nearest-song displays

### Keenan
- Implemented brushing on the t-SNE visualization for selected-region statistics
- Fixed sidebar and linked-interaction bugs

---

## <u><b>Lyrical DNA by Genre</b></u>

### Valentina
- Added word cloud interactivity
  - Tooltips
  - Click/highlight functionality connecting keywords and genres to the t-SNE plot

### Keenan
- Fixed linking bugs between the word cloud and t-SNE visualization

### Alan
- Created the initial word cloud visualization and structure
- Fixed word clipping/cutoff issues
- Standardized visualization coloring

---

## <u><b>Statistical Visualizations & Debugging</b></u>

### Andy
- Assisted with UI formatting and overall dashboard organization

### Keenan
- Implemented radar chart grids and violin plots for genre statistic distributions

### Alan
- Fixed radar/violin sizing and width issues
- Resolved race conditions causing coloring inconsistencies

---

## <u><b>README & Oral Presentation</b></u>

### Jack
- Ideated and prepared the problem statement and presentation hook
- Prepared a full visualization demo for final demo day
- Developed the GitHub README

---

## <u><b>Code Structure</b></u>

| File Name   | Purpose                           |
| ------ | ---------------------------------------- |
| styles.css   | Provides page layout, typography, and style sheet for page content  |
| high_popularity_spotify_data.csv | Raw Spotify data including track information and Spotify metrics.    |
| merged_spotify_with_lyrics.csv | Combined table with coordinates, features, and lyrics that the main browser script loads for the full interactive experience. |
| song_lyrics_short.csv  | Shortened file lyrics keyed to tracks for testing.   |
| spotify_songs_with_lyrics.csv | Lyrics fetched and keyed to tracks for merging. |
| tsne_data.csv | t-SNE coordinates plus audio features per song, without lyrics, used by the radar and violin modules. | 
| brushSelect.js | Adds rectangular brush mode on the t-SNE plot to summarize lyrics for the selected region. | 
| radarGrid.js | Draws small-multiple radar charts of average audio features per genre. | 
| script.js | Loads the merged CSV, color assignments for genres, and the legend and tooltips for the t-SNE visualization. |
| songpanel.js | Opens the slide-in panel with additinoal song information when a dot is clicked. |
| violinPlot.js | Draws the violin plots in the third section of the visualization. | 
| wordcloud.js | Draws the word clouds in the second section of the visualization. | 
| tsne.py | Computes 2D t-SNE from Spotify audio features and writes tsne_data.csv with normalized columns for charts. |
| merge-datasets.py | Joins the Spotify feature table with the lyrics table on title/artist and writes the merged CSV. |
| lyrics-generator-genius.py | Calls the Genius API to populate spotify_songs_with_lyrics.csv from the Spotify track list. | 
| update-merged-lyrics.py | Refreshes lyrics from the Genius output file back onto the merged CSV. | 
| index.html | Loads all visualization scripts for page layout. |



