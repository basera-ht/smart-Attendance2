import dotenv from 'dotenv';
import { defineConfig } from 'drizzle-kit';

dotenv.config();


// Parse DATABASE_URL if provided, otherwise use individual variables
let dbCredentials;

if (process.env.DATABASE_URL) {
  // Parse DATABASE_URL: postgresql://user:password@host:port/database
  // We can just pass the url to drizzle-kit, but if we need individual fields:
  // Note: drizzle-kit mostly uses the `url` property or individual params.
  // We will prioritize the URL.

  dbCredentials = {
    url: process.env.DATABASE_URL,
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

