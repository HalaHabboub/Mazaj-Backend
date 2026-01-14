/**
  * YouTube Search Service
  * Search YouTube for songs not found in catalog
  */

import dotenv from 'dotenv';
dotenv.config();

/**
 * Search YouTube for a song using the Data API v3
 */
export async function searchYouTube(query) {
    const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

    if (!YOUTUBE_API_KEY) {
        console.warn(' YouTube API key not configured');
        return null;
    }

    try {
        console.log(`🔎 [YouTube] Searching for: "${query}"`);

        // Search for music videos (videoCategoryId=10 is Music)
        const searchUrl = `https://www.googleapis.com/youtube/v3/search?` +
            `part=snippet&type=video&videoCategoryId=10&maxResults=5` +
            `&q=${encodeURIComponent(query + " official audio")}&key=${YOUTUBE_API_KEY}`;

        const searchResponse = await fetch(searchUrl);
        const searchData = await searchResponse.json();

        if (searchData.error) {
            console.error('❌ YouTube API error:', searchData.error.message);
            return null;
        }

        if (!searchData.items || searchData.items.length === 0) {
            console.log('❌ No YouTube results found');
            return null;
        }

        // Get the best match
        const video = searchData.items[0];
        const snippet = video.snippet;

        // Parse title to extract song name and artist
        let title = snippet.title;
        let artist = snippet.channelTitle;

        // Try to parse "Artist - Title" format
        if (title.includes(' - ')) {
            const parts = title.split(' - ');
            artist = parts[0].trim();
            title = parts[1].replace(/\(.*?\)/g, '').trim();
        } else {
            // Clean up title
            title = title
                .replace(/\(Official.*?\)/gi, '')
                .replace(/\[Official.*?\]/gi, '')
                .replace(/\(Audio\)/gi, '')
                .replace(/\(Lyric.*?\)/gi, '')
                .replace(/Official Video/gi, '')
                .replace(/Official Audio/gi, '')
                .trim();
        }

        // Extract year from publish date
        const publishDate = new Date(snippet.publishedAt);
        const year = publishDate.getFullYear();

        const result = {
            title,
            artist,
            youtubeId: video.id.videoId,
            coverUrl: snippet.thumbnails.high?.url || snippet.thumbnails.default?.url,
            year,
        };

        console.log(` [YouTube] Found: "${result.title}" by ${result.artist}`);
        return result;

    } catch (error) {
        console.error(' Error calling YouTube API:', error.message);
        return null;
    }
}

export default { searchYouTube };