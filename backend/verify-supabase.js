import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const result = dotenv.config({ path: path.resolve(__dirname, '.env') });

if (result.error) {
    console.error('Error loading .env file:', result.error);
} else {
    console.log('Dotenv loaded successfully.');
}

console.log('DB_HOST:', process.env.DB_HOST);
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not Set');

const { Pool } = pg;
const pool = new Pool({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432', 10),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function testConnection() {
    try {
        const client = await pool.connect();
        console.log('✅ Connected to Database!');
        const res = await client.query('SELECT inet_server_addr(), current_database();');
        console.log('Server IP:', res.rows[0].inet_server_addr);
        console.log('Database:', res.rows[0].current_database);
        client.release();
        pool.end();
    } catch (err) {
        console.error('❌ Connection failed:', err.message);
        pool.end();
    }
}

testConnection();
