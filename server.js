/**
  * MAZAJ - AI DJ Party Backend
  * Main server file - Entry point for the application
  */

// ============================================================================
// 1. IMPORTS
// ============================================================================

import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import cors from 'cors';
import morgan from 'morgan';


import { pgclient } from './db.js';

// Import routes (uncomment when I create them)
// import partyRoutes from './routes/partyRoutes.js';
// import chatRoutes from './routes/chatRoutes.js';


// ============================================================================
// 2. EXPRESS APP SETUP
// ============================================================================

const app = express();
const PORT = process.env.PORT || 3000;


// ============================================================================
// 3. MIDDLEWARE
// ============================================================================

app.use(cors());
app.use(morgan('dev'));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));


// ============================================================================
// 4. ROUTES
// ============================================================================

// Health Check
app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: '🎵 Mazaj AI DJ Party Backend is running!',
        timestamp: new Date().toISOString()
    });
});

// API Routes (uncomment when created)
// app.use('/api/party', partyRoutes);
// app.use('/api/chat', chatRoutes);


// ============================================================================
// 5. ERROR HANDLING
// ============================================================================

// 404 Handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Not Found',
        message: `Cannot ${req.method} ${req.path}`
    });
});

// Global Error Handler
app.use((err, req, res, next) => {
    console.error('Error:', err);
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal Server Error'
    });
});


// ============================================================================
// 6. DATABASE CONNECTION & SERVER START
// ============================================================================

pgclient.connect()
    .then(() => {
        console.log('✅ Connected to PostgreSQL database');

        app.listen(PORT, () => {
            console.log('\n🎵 ═══════════════════════════════════════');
            console.log('   MAZAJ AI DJ PARTY BACKEND');
            console.log('   ═══════════════════════════════════════');
            console.log(`   🚀 Server: http://localhost:${PORT}`);
            console.log(`   📡 Health: http://localhost:${PORT}/health`);
            console.log('   ═══════════════════════════════════════\n');
        });
    })
    .catch((err) => {
        console.error('❌ Database connection failed:', err);
        process.exit(1);
    });


// ============================================================================
// 7. GRACEFUL SHUTDOWN
// ============================================================================

process.on('SIGINT', async () => {
    console.log('\n🛑 Shutting down...');
    await pgclient.end();
    process.exit(0);
});