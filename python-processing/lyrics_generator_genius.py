import pandas as pd
import lyricsgenius
import time

# Initialize Genius (Replace with your token - DO NOT SHARE THIS PUBLICLY)
genius = lyricsgenius.Genius("OA8UIVTPI6QQggMEiQnOCNr3RxpWQpDIq-ACdJCQdYTaOfqVbC02iULlWWj3KLe7", timeout=10, retries=3)

# Load your Kaggle dataset
# Note: make sure the column names match your actual CSV
df = pd.read_csv("data/high_popularity_spotify_data.csv")

def fetch_lyrics(song_name, artist_name):
    try:
        # Search for the song
        song = genius.search_song(song_name, artist_name)
        if song:
            return song.lyrics
    except Exception as e:
        print(f"Error fetching {song_name}: {e}")
    return None

# List to hold our new, clean rows of data
new_dataset_rows = []

# Example: Fetch lyrics for the first 5 rows (Remove .head(5) to run the whole file)
for index, row in df.iterrows():
    print(f"Processing: {row['track_name']} by {row['track_artist']}")
    
    lyrics = fetch_lyrics(row['track_name'], row['track_artist'])
    
    # Create a dictionary for the new row with exactly the columns you want
    # Note: Adjust 'genre' if your original CSV calls it 'playlist_genre' or something else
    new_row = {
        'song_name': row['track_name'],      # Duplicated track_name as song_name per your request
        'artist_name': row['track_artist'],
        'track_name': row['track_name'],
        'genre': row.get('track_genre', 'Unknown'), # Uses .get() in case the column name varies
        'lyrics': lyrics
    }
    
    new_dataset_rows.append(new_row)
    
    # IMPORTANT: Sleep to avoid getting rate-limited or IP banned
    time.sleep(1) 

# Convert the list of dictionaries back into a Pandas DataFrame
new_df = pd.DataFrame(new_dataset_rows)

# Save the new dataframe to a CSV file
output_filename = "spotify_songs_with_lyrics.csv"
new_df.to_csv(output_filename, index=False, encoding='utf-8')

print(f"\nSuccess! Saved new dataset with {len(new_df)} rows to {output_filename}")
