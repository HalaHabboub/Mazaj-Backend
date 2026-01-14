/**
  * Song Search Service
  * Handles searching the song catalog with text and vector similarity
  */

import pgclient from '../db.js';
import OpenAI from 'openai';
import dotenv from 'dotenv';
dotenv.config();

// OpenAI client for generating embeddings
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/**
 * Search songs by title and artist (text search)
 */
export async function searchSongsByText(query, limit = 10) {
    try {
        const result = await pgclient.query(
            `SELECT id, title, artist, album, year, "youtubeId", "coverUrl", mood, genre
               FROM "SongCatalog"
               WHERE LOWER(title) LIKE LOWER($1)
                  OR LOWER(artist) LIKE LOWER($1)
               LIMIT $2`,
            [`%${query}%`, limit]
        );
        return result.rows;
    } catch (error) {
        console.error(' Error searching songs by text:', error.message);
        return [];
    }
}

/**
 * Search songs by exact title and artist
 */
export async function findExactSong(title, artist) {
    try {
        const result = await pgclient.query(
            `SELECT id, title, artist, album, year, "youtubeId", "coverUrl", mood, genre
               FROM "SongCatalog"
               WHERE LOWER(title) = LOWER($1)
                 AND LOWER(artist) LIKE LOWER($2)
               LIMIT 1`,
            [title.trim(), `%${artist.trim()}%`]
        );
        return result.rows[0] || null;
    } catch (error) {
        console.error(' Error finding exact song:', error.message);
        return null;
    }
}

/**
 * Search songs using vector similarity (semantic search)
 */
export async function searchSongsBySemantic(query, limit = 10) {
    try {
        // Generate embedding for the search query
        const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: query,
        });
        const queryEmbedding = embeddingResponse.data[0].embedding;
        const embeddingString = `[${queryEmbedding.join(',')}]`;

        // Search using cosine similarity
        const result = await pgclient.query(
            `SELECT id, title, artist, album, year, "youtubeId", "coverUrl", mood, genre,
                      1 - (embedding <=> $1::vector) as similarity
               FROM "SongCatalog"
               WHERE embedding IS NOT NULL
               ORDER BY embedding <=> $1::vector
               LIMIT $2`,
            [embeddingString, limit]
        );

        return result.rows;
    } catch (error) {
        console.error(' Error in semantic search:', error.message);
        return [];
    }
}

/**
 * Get songs matching specific moods
 */
export async function getSongsByMood(moods, limit = 10) {
    try {
        const result = await pgclient.query(
            `SELECT id, title, artist, album, year, "youtubeId", "coverUrl", mood, genre
               FROM "SongCatalog"
               WHERE mood && $1::text[]
               ORDER BY RANDOM()
               LIMIT $2`,
            [moods, limit]
        );
        return result.rows;
    } catch (error) {
        console.error(' Error getting songs by mood:', error.message);
        return [];
    }
}

/**
 * Check if a song matches vibe rules
 */
export function checkVibeMatch(song, vibeRules) {
    if (!vibeRules) return { matches: true, reason: 'No rules set' };

    // Check blocked moods
    if (vibeRules.blockedMoods && song.mood) {
        const blockedMood = vibeRules.blockedMoods.find(m =>
            song.mood.includes(m.toLowerCase())
        );
        if (blockedMood) {
            return { matches: false, reason: `Song mood "${blockedMood}" is not allowed for this vibe` };
        }
    }

    // Check allowed moods
    if (vibeRules.allowedMoods && vibeRules.allowedMoods.length > 0 && song.mood) {
        const hasAllowedMood = vibeRules.allowedMoods.some(m =>
            song.mood.includes(m.toLowerCase())
        );
        if (!hasAllowedMood) {
            return { matches: false, reason: `Song doesn't match the required mood (${vibeRules.allowedMoods.join(', ')})` };
        }
    }

    // Check era/year
    if (vibeRules.allowedEras && song.year) {
        if (vibeRules.allowedEras.min && song.year < vibeRules.allowedEras.min) {
            return { matches: false, reason: `Song is from ${song.year}, but party requires ${vibeRules.allowedEras.min}+` };
        }
        if (vibeRules.allowedEras.max && song.year > vibeRules.allowedEras.max) {
            return { matches: false, reason: `Song is from ${song.year}, but party is for pre-${vibeRules.allowedEras.max}` };
        }
    }

    // Check blocked artists
    if (vibeRules.blockedArtists && vibeRules.blockedArtists.length > 0) {
        const isBlocked = vibeRules.blockedArtists.some(a =>
            song.artist.toLowerCase().includes(a.toLowerCase())
        );
        if (isBlocked) {
            return { matches: false, reason: `Artist "${song.artist}" is blocked for this party` };
        }
    }

    return { matches: true, reason: 'Song matches the vibe!' };
}

/**
  * Add a newly discovered song to the catalog with embedding
  */
export async function addSongToCatalog(song, analysis) {
    try {
        console.log(` Adding "${song.title}" by ${song.artist} to catalog...`);

        // Generate embedding for the song
        const textToEmbed = `${song.title} ${song.artist} ${analysis.mood?.join(' ')} ${analysis.genre}`;

        const embeddingResponse = await openai.embeddings.create({
            model: 'text-embedding-3-small',
            input: textToEmbed,
        });
        const embedding = embeddingResponse.data[0].embedding;
        const embeddingString = `[${embedding.join(',')}]`;

        // Insert into SongCatalog
        const result = await pgclient.query(
            `INSERT INTO "SongCatalog"
               (id, title, artist, year, "youtubeId", "coverUrl", mood, genre, embedding, "createdAt")
               VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8::vector, NOW())
               ON CONFLICT DO NOTHING
               RETURNING *`,
            [
                song.title,
                song.artist,
                song.year || null,
                song.youtubeId || null,
                song.coverUrl || null,
                analysis.mood || [],
                analysis.genre || null,
                embeddingString
            ]
        );

        if (result.rows.length > 0) {
            console.log(`✅ Song added to catalog with embedding`);
            return result.rows[0];
        }
        return null;

    } catch (error) {
        console.error('❌ Error adding song to catalog:', error.message);
        return null;
    }
}

export default {
    searchSongsByText,
    findExactSong,
    searchSongsBySemantic,
    getSongsByMood,
    checkVibeMatch,
    addSongToCatalog
};
