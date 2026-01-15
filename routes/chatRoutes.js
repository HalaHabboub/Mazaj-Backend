/**
  * Chat Routes
  * Handles chat messages and AI DJ interactions
  *
  * Base URL: /api/chat
  */

import express from 'express';
import pgclient from '../db.js';
import { invokeDJAgent } from '../agents/djAgent.js';

const router = express.Router();


// ============================================================================
// POST /api/chat/send - Send message to AI DJ
// ============================================================================
router.post('/send', async (req, res) => {
    try {
        const { partyId, senderId, content } = req.body;

        // Validation
        if (!partyId || !senderId || !content) {
            return res.status(400).json({
                success: false,
                message: 'partyId, senderId, and content are required'
            });
        }

        // 1. Get party info (for vibe rules)
        const partyResult = await pgclient.query(
            'SELECT * FROM "Party" WHERE id = $1',
            [partyId]
        );

        if (partyResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Party not found'
            });
        }

        const party = partyResult.rows[0];

        // 2. Get recent chat history (last 20 messages)
        const historyResult = await pgclient.query(
            `SELECT * FROM "ChatMessage"
               WHERE "partyId" = $1
               ORDER BY "createdAt" DESC
               LIMIT 20`,
            [partyId]
        );
        const chatHistory = historyResult.rows.reverse(); // Oldest first

        // 3. Save user message to database
        const userMsgResult = await pgclient.query(
            `INSERT INTO "ChatMessage" (id, content, role, type, "senderId", "partyId", "createdAt")
               VALUES (gen_random_uuid(), $1, 'USER', 'CHAT', $2, $3, NOW())
               RETURNING *`,
            [content, senderId, partyId]
        );

        // 4. Call AI DJ Agent
        const aiResponse = await invokeDJAgent({
            userMessage: content,
            vibeDescription: party.vibeDescription,
            vibeRules: party.vibeRules,
            chatHistory: chatHistory,
            partyId: partyId
        });

        // 5. Save AI response to database
        const aiMsgResult = await pgclient.query(
            `INSERT INTO "ChatMessage" (id, content, role, type, "senderId", "partyId", "createdAt")
               VALUES (gen_random_uuid(), $1, 'ASSISTANT', $2, NULL, $3, NOW())
               RETURNING *`,
            [aiResponse.message, aiResponse.type, partyId]
        );

        // 6. If AI approved a song, add it to queue
        if (aiResponse.song && aiResponse.type === 'AI_ACCEPT') {
            await pgclient.query(
                `INSERT INTO "Song" (id, title, artist, "coverUrl", "youtubeId", "addedBy", status, "partyId", "createdAt")
                   VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'PENDING', $6, NOW())`,
                [
                    aiResponse.song.title,
                    aiResponse.song.artist,
                    aiResponse.song.coverUrl || null,
                    aiResponse.song.youtubeId || null,
                    senderId,
                    partyId
                ]
            );
        }

        // 7. Get updated queue
        const queueResult = await pgclient.query(
            `SELECT * FROM "Song" WHERE "partyId" = $1 ORDER BY "createdAt" ASC`,
            [partyId]
        );

        res.json({
            success: true,
            userMessage: userMsgResult.rows[0],
            aiResponse: aiMsgResult.rows[0],
            updatedQueue: queueResult.rows
        });

    } catch (err) {
        console.error('Error in chat:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to process message'
        });
    }
});


// ============================================================================
// GET /api/chat/:partyId/history - Get chat history
// ============================================================================
router.get('/:partyId/history', async (req, res) => {
    try {
        const { partyId } = req.params;
        const limit = parseInt(req.query.limit) || 50;
        const offset = parseInt(req.query.offset) || 0;

        const result = await pgclient.query(
            `SELECT cm.*, u.name as "senderName", u."avatarUrl" as "senderAvatar"
               FROM "ChatMessage" cm
               LEFT JOIN "User" u ON cm."senderId" = u.id
               WHERE cm."partyId" = $1
               ORDER BY cm."createdAt" ASC
               LIMIT $2 OFFSET $3`,
            [partyId, limit, offset]
        );

        const countResult = await pgclient.query(
            'SELECT COUNT(*) FROM "ChatMessage" WHERE "partyId" = $1',
            [partyId]
        );

        res.json({
            success: true,
            messages: result.rows,
            pagination: {
                total: parseInt(countResult.rows[0].count),
                limit,
                offset
            }
        });

    } catch (err) {
        console.error('Error getting chat history:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to get chat history'
        });
    }
});

export default router;
