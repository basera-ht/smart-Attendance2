import dotenv from 'dotenv';
import { defineConfig } from 'drizzle-kit';

dotenv.config();


// Parse DATABASE_URL if provided, otherwise use individual variables
let dbCredentials;

if (process.env.DATABASE_URL) {
  console.log('DATABASE_URL exists');
  // Parse DATABASE_URL: postgresql://user:password@host:port/database
  const url = new URL(process.env.DATABASE_URL);
  dbCredentials = {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    schemaFilter: 'smart_attendance',
  };
} else {
  dbCredentials = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'smart_attendance',
    ssl: process.env.DB_SSL === 'true' || process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  };
}

export default defineConfig({
  schema: './src/db/schema.js',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials,
});

