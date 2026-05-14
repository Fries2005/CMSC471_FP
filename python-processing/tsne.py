# Script to perform t-SNE dimensionality reduction on Spotify audio features
import os
import pandas as pd
from sklearn.manifold import TSNE
from sklearn.preprocessing import StandardScaler

script_dir = os.path.dirname(os.path.abspath(__file__))
data_path = os.path.join(script_dir, os.pardir, 'data', 'high_popularity_spotify_data.csv')
df = pd.read_csv(data_path)

# features to project onto 2D space
features = [
    'danceability', 'energy', 'loudness', 'speechiness',
    'acousticness', 'instrumentalness', 'liveness', 'valence', 'tempo'
]

required_cols = features + ['track_name', 'track_artist', 'playlist_genre']
df = df.dropna(subset=required_cols)

# Remove duplicates based on track_name
df = df.drop_duplicates(subset=['track_name'])

X = df[features]
X_scaled = StandardScaler().fit_transform(X)

print(f"Running t-SNE on {len(df)} songs across {len(features)} dimensions...")
tsne = TSNE(n_components=2, random_state=42)
tsne_results = tsne.fit_transform(X_scaled)

# Normalise loudness (-60..0 dB) to 0-1 for consistent radar rendering
loudness_norm = (df['loudness'] - df['loudness'].min()) / (df['loudness'].max() - df['loudness'].min())

# Normalise tempo (approx 0-250 BPM) to 0-1
tempo_norm = (df['tempo'] - df['tempo'].min()) / (df['tempo'].max() - df['tempo'].min())

viz_df = pd.DataFrame({
    'x': tsne_results[:, 0],
    'y': tsne_results[:, 1],
    'title':  df['track_name'].values,
    'artist': df['track_artist'].values,
    'genre':  df['playlist_genre'].values,
    # raw audio features (0-1 unless noted)
    'danceability':     df['danceability'].values,
    'energy':           df['energy'].values,
    'loudness_norm':    loudness_norm.values,   # normalised 0-1
    'speechiness':      df['speechiness'].values,
    'acousticness':     df['acousticness'].values,
    'instrumentalness': df['instrumentalness'].values,
    'liveness':         df['liveness'].values,
    'valence':          df['valence'].values,
    'tempo_norm':       tempo_norm.values,      # normalised 0-1
    'tempo':            df['tempo'].values,     # raw BPM for display
    'loudness':         df['loudness'].values,  # raw dB for display
})

viz_df.to_csv('data/tsne_data.csv', index=False)
print("Success! Data saved to tsne_data.csv ready for rendering.")