import { drizzle as drizzlePostgresJs } from 'drizzle-orm/postgres-js';
import { drizzle as drizzleNodePostgres } from 'drizzle-orm/node-postgres';
import postgres from 'postgres';
import { Pool } from 'pg';
import {
  users,
  attendance,
  leaves,
  tasks,
  refreshTokens,
  selectedOptionalHolidays,
} from '../db/schema.js';

const drizzleSchema = {
  users,
  attendance,
  leaves,
  tasks,
  refreshTokens,
  selectedOptionalHolidays,
};

let connection = null;
let db = null;

const connectDB = async () => {
  try {
    if (!connection) {
      console.log('NODE_ENV', process.env.NODE_ENV);

      // Determine connection config based on environment and available variables
      if (process.env.NODE_ENV === 'production') {
        let dbConfig;

        // Prioritize DATABASE_URL if available
        if (process.env.DATABASE_URL) {
          console.log('Using DATABASE_URL for connection');
          dbConfig = {
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
          };
        } else {
          console.log('Using individual DB variables for connection');
          dbConfig = {
            host: process.env.DB_HOST,
            port: parseInt(process.env.DB_PORT || '5432', 10),
            database: process.env.DB_NAME || 'smart_attendance',
            user: process.env.DB_USER || 'postgres',
            password: process.env.DB_PASSWORD || 'password',
            ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
          };
        }

        // Add common pool settings
        const poolConfig = {
          ...dbConfig,
          max: 20,
          min: 2,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 10000,
          maxUses: 7500,

          // PostgreSQL configuration for snake_case support
          options: '-c search_path=smart_attendance',
        };

        // Create connection pool
        connection = new Pool(poolConfig);
        db = drizzleNodePostgres(connection, { schema: drizzleSchema });
        await connection.query('SELECT 1');
        // Hide password in logs if printing config
        const logHost = dbConfig.host || 'DATABASE_URL';
        console.log(`📦 PostgreSQL Connected: ${logHost}`);

      } else {
        // Development configuration (Postgres.js)
        let connectionString;

        if (process.env.DATABASE_URL) {
          connectionString = process.env.DATABASE_URL;
        } else {
          const dbUser = process.env.DB_USER || 'postgres';
          const dbPassword = process.env.DB_PASSWORD || 'postgres';
          const dbHost = process.env.DB_HOST || 'localhost';
          const dbPort = process.env.DB_PORT || '5432';
          const dbName = process.env.DB_NAME || 'smart_attendance';
          connectionString = `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;
        }

        connection = postgres(connectionString, {
          max: 10,
          idle_timeout: 20,
          connect_timeout: 10,
        });

        db = drizzlePostgresJs(connection, { schema: drizzleSchema });

        // Test connection
        await connection`SELECT 1`;
        console.log(`📦 PostgreSQL Connected`);
        return db;
      }
    }

    return db;
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    // Do NOT exit process here. Let the caller handle the error.
    // In serverless, we might want to fail the request but keep the container alive,
    // or at least return a 500 error to the client.
    throw error;
  }
};

const getDB = () => {
  if (!db) {
    throw new Error('Database not initialized. Call connectDB() first.');
  }
  return db;
};

const closeDB = async () => {
  if (connection) {
    await connection.end();
    connection = null;
    db = null;
    console.log('📦 Database connection closed');
  }
};

export { connectDB, getDB, closeDB };
