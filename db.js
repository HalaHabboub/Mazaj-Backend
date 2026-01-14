/**
   * Database Connection Configuration
   * Sets up PostgreSQL client connection using pg library
   */

import pg from 'pg';
import dotenv from 'dotenv';
dotenv.config();

// ============================================================================
// CREATE POSTGRESQL CLIENT
// ============================================================================

/**
 * Create a new PostgreSQL client instance
 */
export const pgclient = new pg.Client({
    connectionString: process.env.DATABASE_URL,

});


// ============================================================================
// CONNECTION ERROR HANDLING
// ============================================================================

/**
 * Handle connection errors
 * This catches errors AFTER initial connection is established
 */
pgclient.on('error', (err) => {
    console.error('❌ Unexpected database error:', err);
    process.exit(1); // Exit the application on database error
});

export default pgclient;
