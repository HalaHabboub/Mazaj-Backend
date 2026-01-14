/**
  * DJ Agent - AI-powered music curator (Full Version)
  * Uses LangChain + Song Catalog + Vector Search + Vibe Validation
  */

import { ChatOpenAI } from '@langchain/openai';
import { searchSongsByText, findExactSong, searchSongsBySemantic, getSongsByMood, checkVibeMatch } from '../services/songSearch.js';
import dotenv from 'dotenv';
dotenv.config();

console.log(' OpenRouter API Key loaded:', process.env.OPENROUTER_API_KEY ? 'YES' : 'NO');

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
    const { userMessage, vibeDescription, action, song, reason, suggestions } = context;

    let prompt = '';

    if (action === 'ACCEPT') {
        prompt = `User requested: "${userMessage}"
  Song found: "${song.title}" by ${song.artist}
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
  Result: Song not found in our catalog
  Party vibe: ${vibeDescription}
  Generate a SHORT response (1-2 sentences) saying you couldn't find that song, and ask if they want something similar or can try another song.`;
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
        console.log(' Parsed request:', parsed);

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

        // Try exact match first
        if (parsed.title && parsed.artist) {
            song = await findExactSong(parsed.title, parsed.artist);
        }

        // Try text search if no exact match
        if (!song && parsed.title) {
            const results = await searchSongsByText(parsed.title, 5);
            if (results.length > 0) {
                // Find best match
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

        console.log('🎶 Found song:', song ? `${song.title} by ${song.artist}` : 'NOT FOUND');

        // Step 3: If no song found
        if (!song) {
            const message = await generateResponse({
                userMessage,
                vibeDescription,
                action: 'NOT_FOUND'
            });
            return { message, type: 'AI_DENY', song: null };
        }

        // Step 4: Check if song matches vibe rules
        const vibeCheck = checkVibeMatch(song, vibeRules);
        console.log(' Vibe check:', vibeCheck);

        if (!vibeCheck.matches) {
            // Get alternative suggestions that match the vibe
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

        // Step 5: Song approved! Generate happy response
        const message = await generateResponse({
            userMessage,
            vibeDescription,
            action: 'ACCEPT',
            song
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