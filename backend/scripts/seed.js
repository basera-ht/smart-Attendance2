import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';

// Load env vars
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// Point to root .env from backend/scripts/seed.js -> backend/.env
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function seed() {
    try {
        const client = await pool.connect();
        console.log('✅ Connected to database');

        // 1. Seed Admin User
        const email = 'admin@lushai.com';
        const password = 'password123';
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const userQuery = `
      INSERT INTO smart_attendance.users (name, email, password, role, is_active, created_at, updated_at)
      VALUES ($1, $2, $3, 'admin', true, NOW(), NOW())
      ON CONFLICT (email) DO NOTHING
      RETURNING id;
    `;

        const userRes = await client.query(userQuery, ['Admin User', email, hashedPassword]);
        if (userRes.rows.length > 0) {
            console.log(`✅ Admin user created (ID: ${userRes.rows[0].id})`);
        } else {
            console.log('ℹ️ Admin user already exists');
        }

        // 2. Seed Office
        // Using simple check-then-insert since name isn't unique constraint, though we treating it as such for seeding
        const officeCheck = await client.query(`SELECT id FROM smart_attendance.offices WHERE name = $1`, ['Main Office']);

        if (officeCheck.rows.length === 0) {
            const officeRes = await client.query(`
        INSERT INTO smart_attendance.offices (name, address, is_active, created_at, updated_at)
        VALUES ($1, $2, true, NOW(), NOW())
        RETURNING id
      `, ['Main Office', '123 Corporate Blvd']);
            console.log(`✅ Default Office created (ID: ${officeRes.rows[0].id})`);
        } else {
            console.log('ℹ️ Default Office already exists');
        }

        client.release();
        pool.end();
        process.exit(0);
    } catch (err) {
        console.error('❌ Error seeding database:', err);
        pool.end();
        process.exit(1);
    }
}

seed();
