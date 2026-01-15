
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
            `part=snippet&type=video&videoCategoryId=10&maxResults=10` +
            `&q=${encodeURIComponent(query + " official")}&key=${YOUTUBE_API_KEY}`;

        const searchResponse = await fetch(searchUrl);
        const searchData = await searchResponse.json();

        if (searchData.error) {
            console.error('YouTube API error:', searchData.error.message);
            return null;
        }

        if (!searchData.items || searchData.items.length === 0) {
            console.log('No YouTube results found');
            return null;
        }

        // Filter and find the best result
        const validResults = searchData.items.filter(video => {
            const channelTitle = video.snippet.channelTitle || '';
            const title = video.snippet.title || '';

            // Skip auto-generated "Topic" channels (low quality)
            if (channelTitle.endsWith(' - Topic')) {
                console.log(`  Skipping Topic channel: ${channelTitle}`);
                return false;
            }

            // Skip if channel name is generic/suspicious
            const badChannels = ['Release', 'Various Artists', 'Music', 'Songs', 'Lyrics'];
            if (badChannels.some(bad => channelTitle.toLowerCase() === bad.toLowerCase())) {
                console.log(`  Skipping generic channel: ${channelTitle}`);
                return false;
            }

            // Skip compilations and mixes
            if (title.toLowerCase().includes('compilation') ||
                title.toLowerCase().includes('mix 20') ||
                title.toLowerCase().includes('playlist')) {
                console.log(`  Skipping compilation: ${title}`);
                return false;
            }

            return true;
        });

        if (validResults.length === 0) {
            console.log('No valid YouTube results after filtering');
            return null;
        }

        // Prefer VEVO or official artist channels
        let video = validResults.find(v =>
            v.snippet.channelTitle.includes('VEVO') ||
            v.snippet.channelTitle.toLowerCase().includes('official')
        ) || validResults[0];

        const snippet = video.snippet;

        // Parse title to extract song name and artist
        let title = snippet.title;
        let artist = snippet.channelTitle;

        // Clean up VEVO channel names -> actual artist name
        if (artist.endsWith('VEVO')) {
            artist = artist.replace('VEVO', '').trim();
        }

        // Try to parse "Artist - Title" format
        if (title.includes(' - ')) {
            const parts = title.split(' - ');
            artist = parts[0].trim();
            title = parts.slice(1).join(' - '); // Handle multiple dashes
        }

        // Clean up title - remove common suffixes
        title = title
            .replace(/\(Official.*?\)/gi, '')
            .replace(/\[Official.*?\]/gi, '')
            .replace(/\(Audio\)/gi, '')
            .replace(/\(Lyric.*?\)/gi, '')
            .replace(/\(Music Video\)/gi, '')
            .replace(/\(Video Clip\)/gi, '')
            .replace(/\(Clip Officiel\)/gi, '')
            .replace(/Official Video/gi, '')
            .replace(/Official Audio/gi, '')
            .replace(/Official Music Video/gi, '')
            .replace(/\|.*$/g, '') // Remove everything after |
            .replace(/ft\..*$/gi, '') // Remove featuring info at end
            .replace(/feat\..*$/gi, '')
            .trim();

        // Clean up artist name
        artist = artist
            .replace(/VEVO$/i, '')
            .replace(/Official$/i, '')
            .replace(/ - Topic$/i, '')
            .trim();

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

        console.log(`✅ [YouTube] Found: "${result.title}" by ${result.artist}`);
        return result;

    } catch (error) {
        console.error('Error calling YouTube API:', error.message);
        return null;
    }
}

export default { searchYouTube };