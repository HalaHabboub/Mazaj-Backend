/**
  * Song Analyzer Service
  * Uses AI to analyze song mood, energy, themes
  */

import { ChatOpenAI } from '@langchain/openai';
import dotenv from 'dotenv';
dotenv.config();

const llm = new ChatOpenAI({
    modelName: process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001',
    temperature: 0.3,
    configuration: {
        apiKey: process.env.OPENROUTER_API_KEY,
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
            'HTTP-Referer': 'http://localhost:3000',
            'X-Title': 'Mazaj AI DJ - Song Analyzer',
        },
    },
});

/**
 * Analyze a song using AI to get mood, energy, themes
 */
export async function analyzeSong(title, artist, year = null) {
    try {
        console.log(`🎵 [Analyzer] Analyzing "${title}" by ${artist}...`);

        const prompt = `Analyze the song "${title}" by ${artist}${year ? ` (${year})` : ''}.

  Return a JSON object with this EXACT structure (no markdown, just JSON):
  {
    "known": true,
    "mood": ["mood1", "mood2"],
    "energy": 7,
    "themes": ["theme1", "theme2"],
    "lyricsSummary": "Brief 1-2 sentence summary",
    "genre": "primary genre",
    "explicit": false,
    "decade": "1980s"
  }

  Mood options: happy, sad, energetic, romantic, melancholic, calm, nostalgic, angry, hopeful, dark, uplifting
  Energy: 1-10 (1=very calm, 10=very energetic)
  If you don't know this song, set "known": false and guess based on artist's style.`;

        const response = await llm.invoke(prompt);
        let content = response.content.toString().trim();

        // Parse JSON from response
        if (content.includes('```json')) {
            content = content.split('```json')[1].split('```')[0].trim();
        } else if (content.includes('```')) {
            content = content.split('```')[1].split('```')[0].trim();
        }

        const analysis = JSON.parse(content);

        console.log(` [Analyzer] Done: mood=${analysis.mood}, energy=${analysis.energy}`);

        return {
            known: analysis.known,
            mood: analysis.mood || ['energetic'],
            energy: analysis.energy || 5,
            themes: analysis.themes || [],
            lyricsSummary: analysis.lyricsSummary || '',
            genre: analysis.genre || 'Pop',
            explicit: analysis.explicit || false,
            decade: analysis.decade || null,
        };

    } catch (error) {
        console.error(' [Analyzer] Error:', error.message);

        // Return fallback analysis
        return {
            known: false,
            mood: ['energetic'],
            energy: 5,
            themes: [],
            lyricsSummary: '',
            genre: 'Pop',
            explicit: false,
            decade: null,
        };
    }
}

export default { analyzeSong };
