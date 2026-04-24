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

X = df[features]
X_scaled = StandardScaler().fit_transform(X)

print(f"Running t-SNE on {len(df)} songs across {len(features)} dimensions...")
tsne = TSNE(n_components=2, random_state=42)
tsne_results = tsne.fit_transform(X_scaled)

viz_df = pd.DataFrame({
    'x': tsne_results[:, 0],
    'y': tsne_results[:, 1],
    'title': df['track_name'],
    'artist': df['track_artist'],
    'genre': df['playlist_genre'] 
})

viz_df.to_csv('tsne_data.csv', index=False)
print("Success! Data saved to tsne_data.csv ready for rendering.")