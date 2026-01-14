
/**
 * Vibe Extractor Service
 * Converts natural language vibe descriptions into structured rules
 */

import { ChatOpenAI } from '@langchain/openai';
import dotenv from 'dotenv';
dotenv.config();

const llm = new ChatOpenAI({
    modelName: process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001',
    temperature: 0.3, // Lower temperature for more consistent JSON
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
 * Extract structured vibe rules from natural language description
 */
export async function extractVibeRules(vibeDescription) {
    try {
        const systemPrompt = `You are a music expert. Convert the party vibe description into structured rules.

  Return ONLY valid JSON with this structure (include only relevant fields):
  {
      "allowedGenres": ["pop", "rock", "hip-hop", "r&b", "electronic", "dance", "indie", "jazz", "classical", "country", "latin", "reggae", "metal", "punk", "soul", "funk"],
      "blockedGenres": [],
      "allowedMoods": ["happy", "energetic", "sad", "romantic", "melancholic", "angry", "calm", "nostalgic"],
      "blockedMoods": [],
      "allowedEras": { "min": 1980, "max": 2024 },
      "energyRange": { "min": 1, "max": 10 },
      "explicitAllowed": true,
      "blockedArtists": [],
      "priorityArtists": [],
      "customRules": ["any specific rules mentioned"]
  }

  Only include fields that are clearly specified or implied. Use null for unspecified fields.`;

        const response = await llm.invoke([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Party vibe: "${vibeDescription}"` }
        ]);

        // Parse JSON from response
        const responseText = response.content;

        // Extract JSON from response (handle markdown code blocks)
        let jsonStr = responseText;
        if (responseText.includes('```')) {
            const match = responseText.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
            if (match) jsonStr = match[1];
        }

        const vibeRules = JSON.parse(jsonStr);
        console.log(' Extracted vibe rules:', vibeRules);
        return vibeRules;

    } catch (error) {
        console.error(' Error extracting vibe rules:', error.message);
        // Return default permissive rules on error
        return {
            allowedGenres: null,
            blockedGenres: [],
            allowedMoods: null,
            blockedMoods: [],
            explicitAllowed: true,
            customRules: [vibeDescription]
        };
    }
}

export default { extractVibeRules };