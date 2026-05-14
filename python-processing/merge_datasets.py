# Script to merge Spotify audio features with lyrics data and preprocess for t-SNE
import os
import pandas as pd
from sklearn.preprocessing import StandardScaler

script_dir = os.path.dirname(os.path.abspath(__file__))
data_dir = os.path.join(script_dir, os.pardir, 'data')

# Read the high-popularity Spotify data with audio features
spotify_path = os.path.join(data_dir, 'high_popularity_spotify_data.csv')
spotify_df = pd.read_csv(spotify_path)

# Read the Spotify songs with lyrics
lyrics_path = os.path.join(data_dir, 'spotify_songs_with_lyrics.csv')
lyrics_df = pd.read_csv(lyrics_path)

# Normalize for matching: lowercase, strip whitespace
spotify_df['_match_title'] = spotify_df['track_name'].str.lower().str.strip()
spotify_df['_match_artist'] = spotify_df['track_artist'].str.lower().str.strip()

lyrics_df['_match_title'] = lyrics_df['track_name'].str.lower().str.strip()
lyrics_df['_match_artist'] = lyrics_df['artist_name'].str.lower().str.strip()

# Merge on track_name and artist_name
merged_df = spotify_df.merge(
    lyrics_df[['_match_title', '_match_artist', 'lyrics']],
    on=['_match_title', '_match_artist'],
    how='left'
)

# Drop the matching columns
merged_df = merged_df.drop(columns=['_match_title', '_match_artist'])

# Remove duplicates by track_name
merged_df = merged_df.drop_duplicates(subset=['track_name'])

# Save merged dataset
output_path = os.path.join(data_dir, 'merged_spotify_with_lyrics.csv')
merged_df.to_csv(output_path, index=False)

print(f"Merged dataset created with {len(merged_df)} songs")
print(f"Songs with lyrics: {merged_df['lyrics'].notna().sum()}")
print(f"Saved to {output_path}")
