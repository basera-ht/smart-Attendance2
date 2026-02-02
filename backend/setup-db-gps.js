import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Fix for ES modules __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load .env from backend root
dotenv.config({ path: path.join(__dirname, '.env') });

import { connectDB, getDB } from './src/config/db.js';
import { sql } from 'drizzle-orm';

async function setup() {
    console.log('--- Setting up DB for GPS ---');

    // Debug: Check if env is loaded
    if (!process.env.DATABASE_URL) {
        console.error('❌ DATABASE_URL is undefined.');
        process.exit(1);
    } else {
        console.log('✅ DATABASE_URL found (length: ' + process.env.DATABASE_URL.length + ')');
    }

    await connectDB();
    const db = getDB();

    try {
        // Add columns if they don't exist
        // Note: Drizzle raw SQL execution
        console.log('Adding latitude...');
        await db.execute(sql`ALTER TABLE smart_attendance.offices ADD COLUMN IF NOT EXISTS latitude VARCHAR(50)`);

        console.log('Adding longitude...');
        await db.execute(sql`ALTER TABLE smart_attendance.offices ADD COLUMN IF NOT EXISTS longitude VARCHAR(50)`);

        console.log('✅ DB Schema Updated Successfully.');
    } catch (err) {
        console.error('❌ Migration Failed:', err);
    }
    process.exit(0);
}

setup();
