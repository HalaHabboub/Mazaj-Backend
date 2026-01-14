/**
   * Party Routes
   * Handles party creation and retrieval endpoints
   *
   * Base URL: /api/party
   */

import express from 'express';
import pgclient from '../db.js';

const router = express.Router();


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

        // Generate a random party code (e.g., "MZ-8821")
        const code = 'MZ-' + Math.random().toString(36).substring(2, 6).toUpperCase();

        // Insert into database
        const result = await pgclient.query(
            `INSERT INTO "Party" (id, code, "hostId", "vibeDescription", "isActive", "createdAt", "updatedAt")
               VALUES (gen_random_uuid(), $1, $2, $3, true, NOW(), NOW())
               RETURNING *`,
            [code, hostId, vibeDescription]
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


export default router;