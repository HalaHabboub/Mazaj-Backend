/**
   * Party Routes
   * Handles party creation and retrieval endpoints
   *
   * Base URL: /api/party
   */

import express from 'express';
import pgclient from '../db.js';
import { extractVibeRules } from '../services/vibeExtractor.js';

const router = express.Router();

// ============================================================================
// GET /api/party/user/:userId - Get all parties for a user (with members)
// ============================================================================
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        // Get all parties hosted by user
        const partiesResult = await pgclient.query(
            `SELECT * FROM "Party"
               WHERE "hostId" = $1
               ORDER BY "createdAt" DESC`,
            [userId]
        );

        // For each party, get members with their avatars
        const partiesWithMembers = await Promise.all(
            partiesResult.rows.map(async (party) => {
                const membersResult = await pgclient.query(
                    `SELECT u.id, u.name, u."avatarUrl", u.email
                       FROM "PartyMember" pm
                       JOIN "User" u ON pm."userId" = u.id
                       WHERE pm."partyId" = $1
                       ORDER BY pm."joinedAt" ASC`,
                    [party.id]
                );
                return {
                    ...party,
                    members: membersResult.rows
                };
            })
        );

        res.json({
            success: true,
            parties: partiesWithMembers
        });

    } catch (err) {
        console.error('Error fetching user parties:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch parties'
        });
    }
});

// ============================================================================
// GET /api/party/:id - Get party by ID
// ============================================================================
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pgclient.query(
            'SELECT * FROM "Party" WHERE id = $1',
            [id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Party not found'
            });
        }

        res.json({
            success: true,
            party: result.rows[0]
        });

    } catch (err) {
        console.error('Error getting party:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to get party'
        });
    }
});


// ============================================================================
// POST /api/party - Create a new party
// ============================================================================
router.post('/', async (req, res) => {
    try {
        const { hostId, name, vibeDescription } = req.body;

        // Validation
        if (!hostId || !vibeDescription) {
            return res.status(400).json({
                success: false,
                message: 'hostId and vibeDescription are required'
            });
        }

        // Generate party code
        const code = 'MZ-' + Math.random().toString(36).substring(2, 6).toUpperCase();

        // 🆕 Extract structured vibe rules from description using AI
        console.log(' Extracting vibe rules from:', vibeDescription);
        const vibeRules = await extractVibeRules(vibeDescription);

        // Insert into database with vibe rules
        const result = await pgclient.query(
            `INSERT INTO "Party" (id, code, "hostId", "vibeDescription", "vibeRules", "isActive", "createdAt", "updatedAt")
               VALUES (gen_random_uuid(), $1, $2, $3, $4, true, NOW(), NOW())
               RETURNING *`,
            [code, hostId, vibeDescription, JSON.stringify(vibeRules)]
        );


        // Auto-add host as party member
        await pgclient.query(
            'INSERT INTO "PartyMember" ("partyId", "userId") VALUES ($1, $2)',
            [result.rows[0].id, hostId]
        );

        res.status(201).json({
            success: true,
            party: result.rows[0],
            message: 'Party created successfully'
        });

    } catch (err) {
        console.error('Error creating party:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to create party'
        });
    }
});

// ============================================================================
// GET /api/party/code/:code - Get party by code (for joining)
// ============================================================================
router.get('/code/:code', async (req, res) => {
    try {
        const { code } = req.params;

        const result = await pgclient.query(
            'SELECT * FROM "Party" WHERE code = $1',
            [code]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Party not found'
            });
        }

        res.json({
            success: true,
            party: result.rows[0]
        });

    } catch (err) {
        console.error('Error getting party by code:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to get party'
        });
    }
});


//QUEUE MANAGEMENT

// ============================================================================
// GET /api/party/:id/queue - Get party's song queue
// ============================================================================
router.get('/:id/queue', async (req, res) => {
    try {
        const { id } = req.params;

        // Get all songs for this party, ordered by creation time
        const result = await pgclient.query(
            `SELECT * FROM "Song"
               WHERE "partyId" = $1
               ORDER BY "createdAt" ASC`,
            [id]
        );

        res.json({
            success: true,
            queue: result.rows
        });

    } catch (err) {
        console.error('Error getting queue:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to get queue'
        });
    }
});


// ============================================================================
// POST /api/party/:id/queue - Add song to queue (manual add, not AI)
// ============================================================================
router.post('/:id/queue', async (req, res) => {
    try {
        const { id } = req.params;
        const { title, artist, coverUrl, youtubeId, addedBy } = req.body;

        // Validation
        if (!title || !artist || !addedBy) {
            return res.status(400).json({
                success: false,
                message: 'title, artist, and addedBy are required'
            });
        }

        // Insert song into queue
        const result = await pgclient.query(
            `INSERT INTO "Song" (id, title, artist, "coverUrl", "youtubeId", "addedBy", status, "partyId", "createdAt")
               VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, 'PENDING', $6, NOW())
               RETURNING *`,
            [title, artist, coverUrl || null, youtubeId || null, addedBy, id]
        );

        res.status(201).json({
            success: true,
            song: result.rows[0],
            message: 'Song added to queue'
        });

    } catch (err) {
        console.error('Error adding to queue:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to add song to queue'
        });
    }
});


// ============================================================================
// PATCH /api/party/:id/queue/:songId - Update song status (PLAYING, PLAYED)
// ============================================================================
router.patch('/:id/queue/:songId', async (req, res) => {
    try {
        const { id, songId } = req.params;
        const { status } = req.body;

        // Validate status
        const validStatuses = ['PENDING', 'PLAYING', 'PLAYED'];
        if (!validStatuses.includes(status)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid status. Must be PENDING, PLAYING, or PLAYED'
            });
        }

        // Update song status
        const result = await pgclient.query(
            `UPDATE "Song"
               SET status = $1
               WHERE id = $2 AND "partyId" = $3
               RETURNING *`,
            [status, songId, id]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Song not found'
            });
        }

        res.json({
            success: true,
            song: result.rows[0]
        });

    } catch (err) {
        console.error('Error updating song:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to update song'
        });
    }
});


// ============================================================================
// POST /api/party/:id/join - Join a party
// ============================================================================

router.post('/:id/join', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;

        // Check if party exists
        const partyResult = await pgclient.query(
            'SELECT * FROM "Party" WHERE id = $1',
            [id]
        );

        if (partyResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Party not found'
            });
        }

        // Check if already joined
        const existingMember = await pgclient.query(
            'SELECT * FROM "PartyMember" WHERE "partyId" = $1 AND "userId" = $2',
            [id, userId]
        );

        if (existingMember.rows.length > 0) {
            // Already a member, just return success
            return res.json({
                success: true,
                message: 'Already a member',
                party: partyResult.rows[0]
            });
        }

        // Add user to party
        await pgclient.query(
            'INSERT INTO "PartyMember" ("partyId", "userId") VALUES ($1, $2)',
            [id, userId]
        );

        res.json({
            success: true,
            message: 'Joined party successfully',
            party: partyResult.rows[0]
        });

    } catch (err) {
        console.error('Error joining party:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to join party'
        });
    }
});

// ============================================================================
// GET /api/party/:id/members - Get all party members
// ============================================================================

router.get('/:id/members', async (req, res) => {
    try {
        const { id } = req.params;

        const result = await pgclient.query(
            `SELECT u.id, u.name, u.email, u."avatarUrl", pm."joinedAt"
               FROM "PartyMember" pm
               JOIN "User" u ON pm."userId" = u.id
               WHERE pm."partyId" = $1
               ORDER BY pm."joinedAt" ASC`,
            [id]
        );

        res.json({
            success: true,
            members: result.rows
        });

    } catch (err) {
        console.error('Error fetching members:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch members'
        });
    }
});


// ============================================================================
// DELETE /api/party/:id - Delete a party and all related data
// ============================================================================

router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;

        // Verify the user is the host
        const partyResult = await pgclient.query(
            'SELECT * FROM "Party" WHERE id = $1',
            [id]
        );

        if (partyResult.rows.length === 0) {
            return res.status(404).json({
                success: false,
                message: 'Party not found'
            });
        }

        if (partyResult.rows[0].hostId !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Only the host can delete this party'
            });
        }

        // Delete in order (due to foreign keys):
        // 1. ChatMessages
        await pgclient.query('DELETE FROM "ChatMessage" WHERE "partyId" = $1', [id]);

        // 2. Songs
        await pgclient.query('DELETE FROM "Song" WHERE "partyId" = $1', [id]);

        // 3. PartyMembers
        await pgclient.query('DELETE FROM "PartyMember" WHERE "partyId" = $1', [id]);

        // 4. Party itself
        await pgclient.query('DELETE FROM "Party" WHERE id = $1', [id]);

        res.json({
            success: true,
            message: 'Party deleted successfully'
        });

    } catch (err) {
        console.error('Error deleting party:', err);
        res.status(500).json({
            success: false,
            message: 'Failed to delete party'
        });
    }
});

export default router;