import os
import pandas as pd

script_dir = os.path.dirname(os.path.abspath(__file__))
data_dir = os.path.join(script_dir, os.pardir, 'data')

merged_path = os.path.join(data_dir, 'merged_spotify_with_lyrics.csv')
lyrics_path = os.path.join(data_dir, 'spotify_songs_with_lyrics.csv')

merged_df = pd.read_csv(merged_path)
spotify_lyrics_df = pd.read_csv(lyrics_path)

# normalize titles and artists for reliable matching
merged_df['_match_title'] = merged_df['title'].astype(str).str.lower().str.strip()
merged_df['_match_artist'] = merged_df['artist'].astype(str).str.lower().str.strip()
spotify_lyrics_df['_match_title'] = spotify_lyrics_df['track_name'].astype(str).str.lower().str.strip()
spotify_lyrics_df['_match_artist'] = spotify_lyrics_df['artist_name'].astype(str).str.lower().str.strip()

spotify_lyrics_df = spotify_lyrics_df[['_match_title', '_match_artist', 'lyrics']]

merged_df = merged_df.merge(
    spotify_lyrics_df,
    on=['_match_title', '_match_artist'],
    how='left',
    suffixes=('', '_override')
)

# Override merged lyrics with spotify_songs_with_lyrics lyrics when available
merged_df['lyrics'] = merged_df['lyrics_override'].fillna(merged_df['lyrics'])
merged_df = merged_df.drop(columns=['lyrics_override', '_match_title', '_match_artist'])

output_path = os.path.join(data_dir, 'merged_spotify_with_lyrics.csv')
merged_df.to_csv(output_path, index=False)

print(f"Updated {output_path} with {len(merged_df)} rows.")
print(f"Lyrics overwritten where spotify_songs_with_lyrics entries existed: {merged_df['lyrics'].notna().sum()} total lyrics rows.")
