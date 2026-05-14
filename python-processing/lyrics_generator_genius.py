# Script to fetch lyrics from Genius API for songs in the dataset
import pandas as pd
import lyricsgenius
import time
import re
import os

# Initialize Genius (USE A NEW REGENERATED TOKEN!)
genius_token = "OA8UIVTPI6QQggMEiQnOCNr3RxpWQpDIq-ACdJCQdYTaOfqVbC02iULlWWj3KLe7" 
genius = lyricsgenius.Genius(
    genius_token, 
    timeout=15, 
    retries=3, 
    remove_section_headers=True,
    skip_non_songs=True, # Prevents downloading tracklists or interviews
    excluded_terms=["(Remix)", "(Live)", "Radio Edit", "Instrumental"] # Rejects incorrect versions
)

# Load dataset
df = pd.read_csv("data/high_popularity_spotify_data.csv")
output_filename = "spotify_songs_with_lyrics.csv"

def clean_text(text):
    """
    Cleans up Spotify titles and artists to maximize Genius search accuracy.
    Removes extra features, remaster notes, and parentheses.
    """
    if not isinstance(text, str):
        return ""
    
    # 1. Remove text inside parentheses/brackets e.g., "(feat. Drake)" or "[Radio Edit]"
    text = re.sub(r'\(.*?\)', '', text)
    text = re.sub(r'\[.*?\]', '', text)
    
    # 2. Remove typical Spotify dash suffixes e.g., " - Remastered 2020"
    text = text.split(' - ')[0]
    
    # 3. If it's an artist string, grab just the primary artist (Genius prefers this)
    text = text.split(',')[0].split(' & ')[0].split(' feat.')[0]
    
    return text.strip()

def fetch_lyrics(song_name, artist_name):
    # Clean the inputs before searching
    clean_song = clean_text(song_name)
    clean_artist = clean_text(artist_name)
    
    try:
        # Search Genius using the cleaned data
        song = genius.search_song(clean_song, clean_artist)
        
        # Verify that the returned song isn't completely off-base
        if song:
            return song.lyrics
            
    except Exception as e:
        print(f"Error fetching {clean_song}: {e}")
        
    return None

print(f"Starting to process {len(df)} rows...\n")

# Write headers to the CSV if it doesn't exist yet (great for saving progress)
if not os.path.isfile(output_filename):
    pd.DataFrame(columns=['song_name', 'artist_name', 'track_name', 'genre', 'lyrics']).to_csv(output_filename, index=False)

for index, row in df.iterrows():
    original_track = row['track_name']
    original_artist = row['track_artist']
    
    print(f"[{index + 1}/{len(df)}] Processing: {original_track} by {original_artist}")
    
    lyrics = fetch_lyrics(original_track, original_artist)
    
    new_row = pd.DataFrame([{
        'song_name': original_track, 
        'artist_name': original_artist,
        'track_name': original_track,
        'genre': row.get('track_genre', 'Unknown'),
        'lyrics': lyrics
    }])
    
    # Append the row directly to the CSV so you don't lose data if the script crashes
    new_row.to_csv(output_filename, mode='a', header=False, index=False, encoding='utf-8')
    
    # Sleep to respect rate limits
    time.sleep(1) 

print(f"\nSuccess! Processing complete.")

