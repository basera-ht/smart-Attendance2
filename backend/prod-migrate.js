import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { getDB, connectDB, closeDB } from './src/config/db.js';
import { sql } from 'drizzle-orm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from the same directory as this script
dotenv.config({ path: join(__dirname, '.env') });

const run = async () => {
    try {
        await connectDB();
        const db = getDB();

        console.log('Starting production migration...');

        // Add columns to users table safely
        console.log('Checking/Adding registered_device_id to users...');
        await db.execute(sql`ALTER TABLE smart_attendance.users ADD COLUMN IF NOT EXISTS registered_device_id text`);

        console.log('Checking/Adding device_last_seen to users...');
        await db.execute(sql`ALTER TABLE smart_attendance.users ADD COLUMN IF NOT EXISTS device_last_seen timestamp`);

        console.log('Columns verified/added successfully.');

        // Cleanup QR tables if they exist (ignoring errors if they don't)
        try {
            console.log('Attempting to drop obsolete QR tables...');
            await db.execute(sql`DROP TABLE IF EXISTS smart_attendance.qr_codes CASCADE`);
            await db.execute(sql`DROP TABLE IF EXISTS smart_attendance.qr_validation_logs CASCADE`);
            console.log('QR tables cleanup completed.');
        } catch (e) {
            console.warn('QR table cleanup warning (safe to ignore):', e.message);
        }

    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await closeDB();
        console.log('Migration script finished.');
        process.exit(0);
    }
};

run();
