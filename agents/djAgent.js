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
  * Parse song request from user message - returns multiple search variations
  */
async function parseSongRequest(userMessage, chatHistory = []) {
    try {
        // Build context from recent chat history
        let contextMessages = [];

        if (chatHistory && chatHistory.length > 0) {
            // Get last 4 messages for context
            const recentHistory = chatHistory.slice(-4);
            contextMessages = recentHistory.map(msg => ({
                role: msg.role === 'USER' ? 'user' : 'assistant',
                content: msg.content
            }));
        }

        const response = await llm.invoke([
            {
                role: 'system',
                content: `You are a music request parser. Extract song requests from user messages.

  IMPORTANT: Consider the conversation history! If user says things like:
  - "yes", "ok", "go for it", "play that", "add it", "sure" → They're accepting a previously suggested song
  - "no", "something else", "different one" → They want a different song
  If user is accepting a previous suggestion, extract that song from the conversation history.

  IMPORTANT: If the user mentions ANY song title or artist name, it IS a request. This includes:
  - English songs
  - Arabic songs (e.g., "El Leila", "Tamally Maak", "Nour El Ain")
  - Spanish songs
  - Any international music

  Return ONLY valid JSON:
  {
    "title": "song title or null",
    "artist": "artist name or null",
    "isRequest": true,
    "searchVariations": ["variation1", "variation2"]
  }

  For searchVariations, include TITLE alternatives only (no artist names):
  - Numbers as words/digits ("twenty two" → "22")
  - Correct spellings if misspelled
  - Alternative song titles by same artist if user wants "any song"
  - Transliterations for non-English titles

  DO NOT append artist name to variations - just the song title.

  If the message is just casual chat with NO song/artist mentioned and NOT a confirmation of a previous suggestion, return:
  {"isRequest": false}

  Examples:
  - "play el leila by amr diab" → {"title": "El Leila", "artist": "Amr Diab", "isRequest": true, "searchVariations": ["الليلة", "El Lila"]}
  - "how about break my heart" → {"title": "Break My Heart", "artist": null, "isRequest": true, "searchVariations": ["Break My Heart"]}
  - "any sad song by Adele" → {"title": null, "artist": "Adele", "isRequest": true, "searchVariations": ["Someone Like You", "Hello", "Easy On Me"]}
  - "this party is great!" → {"isRequest": false}
  - "yes go for it" (after AI suggested a song) → extract that song from history`
            },
            ...contextMessages,
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
  ${context.suggestionText || 'Do NOT suggest any songs.'}
  Generate a SHORT, playful response (1-2 sentences) explaining why it doesn't fit. Be friendly!
  CRITICAL: Only mention songs from the verified alternatives above. NEVER suggest songs from your own knowledge.`;
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
        const parsed = await parseSongRequest(userMessage, chatHistory);
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

        let song = null;
        let source = 'catalog';

        // Handle "any song by artist" requests - find songs that MATCH the vibe first
        if (!parsed.title && parsed.artist) {
            console.log(`🎯 Searching for ${parsed.artist} songs that match the vibe...`);

            // Search for songs by this artist in catalog
            const artistSongs = await searchSongsByText(parsed.artist, 20);

            // Filter to only songs that match ALL vibe rules
            const matchingSongs = [];
            for (const s of artistSongs) {
                const vibeCheck = checkVibeMatch(s, vibeRules);
                if (vibeCheck.matches) {
                    matchingSongs.push(s);
                }
            }

            console.log(`🎵 Found ${matchingSongs.length} ${parsed.artist} songs matching the vibe`);

            if (matchingSongs.length === 1) {
                // Only one match - use it directly
                song = matchingSongs[0];
                source = 'catalog';
                console.log(`✅ Only one match: "${song.title}" by ${song.artist}`);
            } else if (matchingSongs.length > 1) {
                // Multiple matches - let user choose
                const options = matchingSongs.slice(0, 5).map(s => `"${s.title}"`).join(', ');
                const message = `I found some ${parsed.artist} songs that fit the vibe! How about: ${options}? Which one do you want?`;
                return {
                    message,
                    type: 'CHAT',
                    song: null,
                    options: matchingSongs.slice(0, 5)
                };
            } else {
                // No catalog matches - try YouTube!
                console.log(`🔍 No catalog matches, searching YouTube for ${parsed.artist}...`);

                // Build search query based on vibe
                const moodKeyword = vibeRules?.allowedMoods?.[0] || '';
                const searchQuery = `${parsed.artist} ${moodKeyword} song`;

                const youtubeResult = await searchYouTube(searchQuery);

                if (youtubeResult) {
                    const analysis = await analyzeSong(youtubeResult.title, youtubeResult.artist, youtubeResult.year);

                    const tempSong = {
                        title: youtubeResult.title,
                        artist: youtubeResult.artist,
                        youtubeId: youtubeResult.youtubeId,
                        coverUrl: youtubeResult.coverUrl,
                        year: youtubeResult.year,
                        mood: analysis.mood,
                        genre: analysis.genre,
                        energy: analysis.energy,
                    };

                    // Check if YouTube result matches vibe
                    const ytVibeCheck = checkVibeMatch(tempSong, vibeRules);

                    if (ytVibeCheck.matches) {
                        song = tempSong;
                        source = 'youtube';
                        await addSongToCatalog(song, analysis);
                        console.log(`✅ YouTube find matches vibe: "${song.title}"`);
                    } else {
                        // YouTube result doesn't match either
                        const message = `I searched everywhere but couldn't find a ${parsed.artist} song that fits this ${vibeDescription} vibe. Want to try a different artist?`;
                        return { message, type: 'CHAT', song: null };
                    }
                } else {
                    const message = `Couldn't find any ${parsed.artist} songs that match the vibe. Try another artist?`;
                    return { message, type: 'CHAT', song: null };
                }
            }
        }

        // Step 2: Search for the song in catalog


        const searchQueries = [parsed.title];
        if (parsed.searchVariations) {
            searchQueries.push(...parsed.searchVariations);
        }

        console.log('🔎 Will try these searches:', searchQueries);

        // 1. Try exact match first (fastest)
        if (parsed.artist && parsed.title) {
            song = await findExactSong(parsed.title, parsed.artist);
            if (song) {
                console.log('✅ Found exact match in catalog');
            }
        }

        // 2. Try VECTOR/SEMANTIC search (handles typos, variations, etc.)
        if (!song) {
            for (const query of searchQueries) {
                if (!query) continue;

                const searchText = parsed.artist ? `${query} ${parsed.artist}` : query;
                const semanticResults = await searchSongsBySemantic(searchText, 10); // Get more results to validate

                for (const result of semanticResults) {
                    const foundTitle = result.title.toLowerCase();
                    const foundArtist = result.artist.toLowerCase();

                    let isValid = true;

                    // If specific title requested, verify title matches
                    if (parsed.title) {
                        const requestedTitle = parsed.title.toLowerCase();
                        const titleWords = requestedTitle.split(/\s+/).filter(w => w.length > 2);
                        const matchingWords = titleWords.filter(w => foundTitle.includes(w));

                        // At least 50% of title words should match
                        if (matchingWords.length < titleWords.length * 0.5) {
                            console.log(`  ❌ Title mismatch: "${result.title}" doesn't match "${parsed.title}"`);
                            isValid = false;
                        }
                    }

                    // If artist specified, verify artist matches
                    if (isValid && parsed.artist) {
                        const requestedArtist = parsed.artist.toLowerCase();
                        const artistMatch = foundArtist.includes(requestedArtist) ||
                            requestedArtist.includes(foundArtist) ||
                            requestedArtist.split(/\s+/).some(w => foundArtist.includes(w) && w.length > 2);

                        if (!artistMatch) {
                            console.log(`  ❌ Artist mismatch: "${result.artist}" doesn't match "${parsed.artist}"`);
                            isValid = false;
                        }
                    }

                    if (isValid) {
                        song = result;
                        console.log(`✅ Found via vector search: "${song.title}" by ${song.artist} (similarity: ${song.similarity})`);
                        break;
                    }
                }

                if (song) break;
            }
        }

        // 3. Text search as fallback (for edge cases)
        if (!song) {
            for (const query of searchQueries) {
                if (!query) continue;
                const results = await searchSongsByText(query, 5);

                song = results.find(s => {
                    const foundTitle = s.title.toLowerCase().trim();
                    const queryLower = query.toLowerCase().trim();

                    const titleMatch =
                        foundTitle === queryLower ||
                        foundTitle.startsWith(queryLower + ' ') ||
                        foundTitle.startsWith(queryLower + '(') ||
                        (queryLower.includes(foundTitle) && foundTitle.length > queryLower.length * 0.7);

                    if (!titleMatch) return false;
                    if (!parsed.artist) return true;

                    const requestedArtist = parsed.artist.toLowerCase();
                    const foundArtist = s.artist.toLowerCase();

                    if (foundArtist.includes(requestedArtist) || requestedArtist.includes(foundArtist)) {
                        return true;
                    }

                    const requestedWords = requestedArtist.split(/\s+/);
                    const foundWords = foundArtist.split(/\s+/);
                    return requestedWords.some(rw => foundWords.some(fw => fw.includes(rw) || rw.includes(fw)));
                });

                if (song) {
                    console.log(`✅ Found via text search: "${song.title}" by ${song.artist}`);
                    break;
                }
            }
        }
        //  Step 3: If not in catalog, try YouTube!
        if (!song) {
            console.log(' Song not in catalog, searching YouTube...');

            // Build a proper search query (handle null title)
            let searchQuery;
            if (parsed.title && parsed.artist) {
                searchQuery = `${parsed.title} ${parsed.artist}`;
            } else if (parsed.title) {
                searchQuery = parsed.title;
            } else if (parsed.artist) {
                // No specific song, just artist - search for their popular songs
                searchQuery = `${parsed.artist} official music video`;
            } else {
                searchQuery = null;
            }

            if (!searchQuery) {
                console.log('⚠️ No valid search query, skipping YouTube');
            }

            const youtubeResult = searchQuery ? await searchYouTube(searchQuery) : null;

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

            // Try to find songs by same artist that FULLY match ALL vibe rules
            if (parsed.artist) {
                const artistSongs = await searchSongsByText(parsed.artist, 20);
                for (const s of artistSongs) {
                    const fullVibeCheck = checkVibeMatch(s, vibeRules);
                    if (fullVibeCheck.matches) {
                        suggestions.push(s);
                        if (suggestions.length >= 3) break;
                    }
                }
            }

            // If no artist songs match, find ANY songs that fully match the vibe
            if (suggestions.length === 0 && vibeRules?.allowedMoods) {
                const moodSongs = await getSongsByMood(vibeRules.allowedMoods, 20);
                for (const s of moodSongs) {
                    const fullVibeCheck = checkVibeMatch(s, vibeRules);
                    if (fullVibeCheck.matches) {
                        suggestions.push(s);
                        if (suggestions.length >= 3) break;
                    }
                }
            }

            // Build suggestion text for AI - ONLY verified songs
            const suggestionText = suggestions.length > 0
                ? `Verified alternatives that match ALL rules: ${suggestions.map(s => `"${s.title}" by ${s.artist}`).join(', ')}`
                : 'No alternatives found that match the vibe. Ask them to try a different song.';

            const message = await generateResponse({
                userMessage,
                vibeDescription,
                action: 'DENY',
                song,
                reason: vibeCheck.reason,
                suggestions,
                suggestionText  // Pass the verified text
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
