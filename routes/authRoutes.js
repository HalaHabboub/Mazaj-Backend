
// routes/authRoutes.js
import express from 'express';
import pgclient from '../db.js';

const router = express.Router();

// POST /api/auth/signup
router.post('/signup', async (req, res) => {
    try {
        const { email, password, name, avatarUrl } = req.body;

        // Check if user exists
        const exists = await pgclient.query(
            'SELECT * FROM "User" WHERE email = $1',
            [email]
        );

        if (exists.rows.length > 0) {
            return res.status(400).json({
                success: false,
                message: 'User already exists'
            });
        }

        // Create user with avatar
        const result = await pgclient.query(
            'INSERT INTO "User" (email, password, name, "avatarUrl") VALUES ($1, $2, $3, $4) RETURNING id, email, name, "avatarUrl"',
            [email, password, name, avatarUrl || null]
        );

        res.status(201).json({
            success: true,
            user: result.rows[0]
        });

    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create account'
        });
    }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        const result = await pgclient.query(
            'SELECT id, email, name, "avatarUrl" FROM "User" WHERE email = $1 AND password = $2',
            [email, password]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        res.json({
            success: true,
            user: result.rows[0]
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Login failed'
        });
    }
});

export default router;