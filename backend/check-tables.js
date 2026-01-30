import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '.env') });

const { Pool } = pg;
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function checkTables() {
    try {
        const client = await pool.connect();
        console.log('✅ Connected to Supabase');

        const res = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'smart_attendance';
    `);

        if (res.rows.length === 0) {
            console.log('❌ No tables found in smart_attendance schema.');
            process.exit(1);
        } else {
            console.log('Found tables:');
            res.rows.forEach(r => console.log(`- ${r.table_name}`));
            process.exit(0);
        }
    } catch (err) {
        console.error('❌ Error:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

checkTables();
