/**
   * DJ Agent - AI-powered music curator
   * Uses LangChain with OpenRouter (Gemini) to validate song requests
   */

import { ChatOpenAI } from '@langchain/openai';

// Create the LLM using OpenRouter
const llm = new ChatOpenAI({
    modelName: process.env.OPENROUTER_MODEL || 'google/gemini-2.0-flash-001',
    openAIApiKey: process.env.OPENROUTER_API_KEY,
    configuration: {
        baseURL: 'https://openrouter.ai/api/v1',
    },
    temperature: 0.7,
});


/**
 * Invoke the DJ Agent to process a user message
 */
export async function invokeDJAgent({ userMessage, vibeDescription, vibeRules, chatHistory, partyId }) {
    try {
        // Build the system prompt
        const systemPrompt = `You are Mazaj, the AI DJ for this party. Your job is to evaluate song requests and keep the vibe right.

  **Party Vibe:** ${vibeDescription}

  **Your Personality:**
  - Friendly and enthusiastic about music
  - Playful when rejecting songs (never rude)
  - Suggest alternatives when a song doesn't fit
  - Keep responses SHORT (1-2 sentences max)

  **Your Task:**
  When someone requests a song:
  1. Check if it matches the party vibe
  2. If YES: Respond positively and include the song info
  3. If NO: Explain why playfully and suggest something better

  **IMPORTANT Response Format:**
  You must respond with valid JSON only, no other text:
  {
      "message": "Your response to the user",
      "type": "AI_ACCEPT or AI_DENY or CHAT",
      "song": { "title": "Song Title", "artist": "Artist Name" } or null
  }

  - Use AI_ACCEPT when approving a song
  - Use AI_DENY when rejecting a song
  - Use CHAT for general conversation
  - Include "song" only when accepting a request`;

        // Build chat history for context
        const historyText = chatHistory.slice(-10).map(msg =>
            `${msg.role}: ${msg.content}`
        ).join('\n');

        // Create the prompt
        const userPrompt = `Recent chat:\n${historyText}\n\nNew message from user: ${userMessage}`;

        // Call the LLM
        const response = await llm.invoke([
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
        ]);

        // Parse the response
        const responseText = response.content;

        try {
            // Try to parse as JSON
            const parsed = JSON.parse(responseText);
            return {
                message: parsed.message || responseText,
                type: parsed.type || 'CHAT',
                song: parsed.song || null
            };
        } catch {
            // If not valid JSON, return as plain chat
            return {
                message: responseText,
                type: 'CHAT',
                song: null
            };
        }

    } catch (error) {
        console.error('DJ Agent error:', error);
        return {
            message: "Sorry, I'm having trouble processing that. Try again!",
            type: 'CHAT',
            song: null
        };
    }
}

export default { invokeDJAgent };