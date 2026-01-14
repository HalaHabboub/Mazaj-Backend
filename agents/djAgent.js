/**
   * DJ Agent - AI-powered music curator (Full Version with YouTube)
   * Uses LangChain + Song Catalog + Vector Search + YouTube Discovery
   */

import { ChatOpenAI } from '@langchain/openai';
import { searchSongsByText, findExactSong, searchSongsBySemantic, getSongsByMood, checkVibeMatch, addSongToCatalog } from '../services/songSearch.js';
import { searchYouTube } from '../services/youtubeSearch.js';
import { analyzeSong } from '../services/songAnalyzer.js';
import dotenv from 'dotenv';
dotenv.config();

console.log(' OpenRouter API Key loaded:', process.env.OPENROUTER_API_KEY ? 'YES' : 'NO');
console.log(' YouTube API Key loaded:', process.env.YOUTUBE_API_KEY ? 'YES' : 'NO');

const llm = new ChatOpenAI({
    modelName: process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001',
    temperature: 0.7,
    configuration: {
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'Mazaj AI DJ',
        },
    },
});


/**
 * Parse song request from user message
 */
async function parseSongRequest(userMessage) {
    try {
        const response = await llm.invoke([
            {
                role: 'system',
                content: `Extract song title and artist from the user's message.
  Return ONLY valid JSON: {"title": "song name", "artist": "artist name", "isRequest": true}
  If it's not a song request, return: {"isRequest": false}
  If artist is unknown, use null for artist.`
            },
            { role: 'user', content: userMessage }
        ]);

        let jsonStr = response.content;
        if (jsonStr.includes('```')) {
            const match = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (match) jsonStr = match[1];
        }
        return JSON.parse(jsonStr);
    } catch {
        return { isRequest: false };
    }
}


/**
 * Generate AI response based on context
 */
async function generateResponse(context) {
    const { userMessage, vibeDescription, action, song, reason, suggestions, source } = context;

    let prompt = '';

    if (action === 'ACCEPT') {
        const sourceText = source === 'youtube' ? ' (found it on YouTube!)' : '';
        prompt = `User requested: "${userMessage}"
  Song found: "${song.title}" by ${song.artist}${sourceText}
  Result: APPROVED - matches the party vibe!
  Generate a SHORT, excited response (1-2 sentences) confirming the song was added. Be fun and enthusiastic!`;
    }
    else if (action === 'DENY') {
        prompt = `User requested: "${userMessage}"
  Song found: "${song?.title || 'Unknown'}" by ${song?.artist || 'Unknown'}
  Result: DENIED - ${reason}
  Party vibe: ${vibeDescription}
  ${suggestions ? `Alternative suggestions: ${suggestions.map(s => s.title + ' by ' + s.artist).join(', ')}` : ''}
  Generate a SHORT, playful response (1-2 sentences) explaining why it doesn't fit, and suggest an alternative if available. Be friendly, not harsh!`;
    }
    else if (action === 'NOT_FOUND') {
        prompt = `User requested: "${userMessage}"
  Result: Song not found anywhere (not in catalog, not on YouTube)
  Party vibe: ${vibeDescription}
  Generate a SHORT response (1-2 sentences) saying you couldn't find that song anywhere, and ask them to try another song.`;
    }
    else {
        prompt = `User message: "${userMessage}"
  Party vibe: ${vibeDescription}
  This is general chat (not a song request). Respond naturally as Mazaj, the AI DJ. Keep it SHORT (1-2 sentences).`;
    }

    const response = await llm.invoke([
        {
            role: 'system',
            content: `You are Mazaj, a fun and friendly AI DJ. Keep responses SHORT and energetic. Use emojis sparingly.`
        },
        { role: 'user', content: prompt }
    ]);

    return response.content;
}


/**
 * Main DJ Agent function - processes user messages
 */
export async function invokeDJAgent({ userMessage, vibeDescription, vibeRules, chatHistory, partyId }) {
    try {
        console.log(' DJ Agent called with:', userMessage);
        console.log(' Vibe rules:', vibeRules);

        // Step 1: Parse if this is a song request
        const parsed = await parseSongRequest(userMessage);
        console.log('🔍 Parsed request:', parsed);

        // If not a song request, just chat
        if (!parsed.isRequest) {
            const message = await generateResponse({
                userMessage,
                vibeDescription,
                action: 'CHAT'
            });
            return { message, type: 'CHAT', song: null };
        }

        // Step 2: Search for the song in catalog
        let song = null;
        let source = 'catalog';

        // Try exact match first
        if (parsed.title && parsed.artist) {
            song = await findExactSong(parsed.title, parsed.artist);
        }

        // Try text search if no exact match
        if (!song && parsed.title) {
            const results = await searchSongsByText(parsed.title, 5);
            if (results.length > 0) {
                song = results.find(s =>
                    s.title.toLowerCase().includes(parsed.title.toLowerCase())
                ) || results[0];
            }
        }

        // Try semantic search as fallback
        if (!song) {
            const semanticResults = await searchSongsBySemantic(userMessage, 5);
            if (semanticResults.length > 0) {
                song = semanticResults[0];
            }
        }

        //  Step 3: If not in catalog, try YouTube!
        if (!song) {
            console.log(' Song not in catalog, searching YouTube...');

            const searchQuery = parsed.artist
                ? `${parsed.title} ${parsed.artist}`
                : parsed.title;

            const youtubeResult = await searchYouTube(searchQuery);

            if (youtubeResult) {
                source = 'youtube';

                // Analyze the song to get mood/energy
                const analysis = await analyzeSong(
                    youtubeResult.title,
                    youtubeResult.artist,
                    youtubeResult.year
                );

                // Create song object with analysis data
                song = {
                    title: youtubeResult.title,
                    artist: youtubeResult.artist,
                    youtubeId: youtubeResult.youtubeId,
                    coverUrl: youtubeResult.coverUrl,
                    year: youtubeResult.year,
                    mood: analysis.mood,
                    genre: analysis.genre,
                    energy: analysis.energy,
                };

                //  Add to catalog for future searches
                await addSongToCatalog(song, analysis);
            }
        }

        console.log('🎶 Found song:', song ? `${song.title} by ${song.artist} (${source})` : 'NOT FOUND');

        // Step 4: If still no song found
        if (!song) {
            const message = await generateResponse({
                userMessage,
                vibeDescription,
                action: 'NOT_FOUND'
            });
            return { message, type: 'AI_DENY', song: null };
        }

        // Step 5: Check if song matches vibe rules
        const vibeCheck = checkVibeMatch(song, vibeRules);
        console.log('✅ Vibe check:', vibeCheck);

        if (!vibeCheck.matches) {
            let suggestions = [];
            if (vibeRules?.allowedMoods) {
                suggestions = await getSongsByMood(vibeRules.allowedMoods, 3);
            }

            const message = await generateResponse({
                userMessage,
                vibeDescription,
                action: 'DENY',
                song,
                reason: vibeCheck.reason,
                suggestions
            });

            return {
                message,
                type: 'AI_DENY',
                song: null,
                suggestion: suggestions[0] || null
            };
        }

        // Step 6: Song approved!
        const message = await generateResponse({
            userMessage,
            vibeDescription,
            action: 'ACCEPT',
            song,
            source
        });

        return {
            message,
            type: 'AI_ACCEPT',
            song: {
                title: song.title,
                artist: song.artist,
                coverUrl: song.coverUrl,
                youtubeId: song.youtubeId,
                mood: song.mood,
                year: song.year
            }
        };

    } catch (error) {
        console.error(' DJ Agent error:', error.message);
        console.error(' Full error:', error);
        return {
            message: "Sorry, I'm having trouble processing that. Try again!",
            type: 'CHAT',
            song: null
        };
    }
}

export default { invokeDJAgent };
