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
      let connectionString;
      console.log('NODE_ENV', process.env.NODE_ENV);
      // Use DATABASE_URL if provided, otherwise construct from individual variables
      if (process.env.NODE_ENV === 'production') {
        const dbConfig = {
          host: process.env.DB_HOST,
          port: parseInt(process.env.DB_PORT || '5432', 10),
          database: process.env.DB_NAME || 'smart_attendance',
          user: process.env.DB_USER || 'postgres',
          password: process.env.DB_PASSWORD || 'password',
          ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
          
          // Connection pool settings
          max: 20,
          min: 2,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 10000,
          maxUses: 7500,
          
          // PostgreSQL configuration for snake_case support
          // This ensures proper handling of snake_case identifiers
          options: '-c search_path=smart_attendance',
          schemaFilter: 'smart_attendance',
        };
        
        // Create connection pool
        connection = new Pool(dbConfig);
        db = drizzleNodePostgres(connection, { schema: drizzleSchema });
        await connection.query('SELECT 1');
        console.log(`📦 PostgreSQL Connected: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);
        
      } else {
        const dbUser = process.env.DB_USER || 'postgres';
        const dbPassword = process.env.DB_PASSWORD || 'postgres';
        const dbHost = process.env.DB_HOST || 'localhost';
        const dbPort = process.env.DB_PORT || '5432';
        const dbName = process.env.DB_NAME || 'smart_attendance';
        
        connectionString = `postgresql://${dbUser}:${dbPassword}@${dbHost}:${dbPort}/${dbName}`;
      
      connection = postgres(connectionString, {
        max: 10,
        idle_timeout: 20,
        connect_timeout: 10,
      });

        db = drizzlePostgresJs(connection, { schema: drizzleSchema });
      
        // Test connection for local/postgres-js client
      await connection`SELECT 1`;
      console.log(`📦 PostgreSQL Connected: ${dbHost}:${dbPort}/${dbName}`);
        return db;
      }
    }
    
    return db;
  } catch (error) {
    console.error('❌ Database connection error:', error.message);
    console.error('\n💡 Troubleshooting tips:');
    console.error('   1. Check your .env file has the correct database credentials');
    console.error('   2. Verify PostgreSQL is running: pg_isready');
    console.error('   3. Test connection: psql -U postgres -h localhost');
    console.error('   4. If using DATABASE_URL, format: postgresql://user:password@host:port/database');
    console.error('   5. If password has special characters, URL encode them in DATABASE_URL\n');
    process.exit(1);
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
