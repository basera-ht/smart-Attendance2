import pg from 'pg';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const { Pool } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
  database: process.env.DB_NAME || 'smart_attendance',
  ssl: process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false } 
    : false,
});

async function applyMigration() {
  const client = await pool.connect();
  
  try {
    console.log('Applying QR migrations...');

    const migrationFiles = [
      '0001_add_qr_tables.sql',
      '0002_network_access.sql'
    ];

    for (const file of migrationFiles) {
      const migrationPath = path.join(__dirname, `../drizzle/migrations/${file}`);
      const sql = fs.readFileSync(migrationPath, 'utf8');
      await client.query(sql);
      console.log(`✅ Applied ${file}`);
    }

    console.log('All migrations applied successfully!');
  } catch (error) {
    if (error.code === '42P07') {
      // Table already exists
      console.log('⚠️  Some tables already exist. This is okay if you\'re re-running the migration.');
      console.log('If you need to recreate tables, drop them first.');
    } else {
      console.error('❌ Migration failed:', error.message);
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

applyMigration().catch(console.error);
