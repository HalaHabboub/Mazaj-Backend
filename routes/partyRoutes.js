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


export default router;