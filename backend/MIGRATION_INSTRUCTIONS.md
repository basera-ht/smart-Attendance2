# QR Tables Migration Instructions

## Problem
When running `npm run db:push`, you may encounter an error:
```
error: type "attendance_status" already exists
```

This happens because Drizzle's `push` command tries to recreate existing enum types.

## Solution

You have two options:

### Option 1: Run SQL Migration Directly (Recommended)

Run the SQL migration file directly using your PostgreSQL client:

```bash
# Using psql command line
psql -h localhost -U postgres -d smart_attendance -f drizzle/migrations/0001_add_qr_tables.sql
psql -h localhost -U postgres -d smart_attendance -f drizzle/migrations/0002_network_access.sql

# Or using the Node.js script (applies both migrations)
npm run db:apply-qr-migration
```

### Option 2: Use Drizzle Migrations

If the tables don't exist yet:

1. Generate migration (already done):
   ```bash
   npm run db:generate
   ```

2. Apply migration:
   ```bash
   npm run db:migrate
   ```

### Option 3: Manual SQL Execution

If you prefer to run SQL manually, connect to your database and execute:

```sql
-- Create offices table
CREATE TABLE IF NOT EXISTS smart_attendance.offices (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  address TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_id INTEGER REFERENCES smart_attendance.users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create geofences table
CREATE TABLE IF NOT EXISTS smart_attendance.geofences (
  id SERIAL PRIMARY KEY,
  office_id INTEGER NOT NULL REFERENCES smart_attendance.offices(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  polygon JSONB NOT NULL,
  radius INTEGER,
  tolerance INTEGER NOT NULL DEFAULT 15,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by_id INTEGER REFERENCES smart_attendance.users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create qr_codes table
CREATE TABLE IF NOT EXISTS smart_attendance.qr_codes (
  id SERIAL PRIMARY KEY,
  qr_id VARCHAR(255) NOT NULL UNIQUE,
  office_id INTEGER NOT NULL REFERENCES smart_attendance.offices(id) ON DELETE CASCADE,
  geofence_id INTEGER NOT NULL REFERENCES smart_attendance.geofences(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  is_used BOOLEAN NOT NULL DEFAULT false,
  used_at TIMESTAMP,
  used_by INTEGER REFERENCES smart_attendance.users(id),
  nonce VARCHAR(255) NOT NULL,
  created_by_id INTEGER NOT NULL REFERENCES smart_attendance.users(id),
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create qr_validation_logs table
CREATE TABLE IF NOT EXISTS smart_attendance.qr_validation_logs (
  id SERIAL PRIMARY KEY,
  qr_id VARCHAR(255),
  user_id INTEGER REFERENCES smart_attendance.users(id),
  office_id INTEGER REFERENCES smart_attendance.offices(id),
  is_valid BOOLEAN NOT NULL,
  validation_result JSONB NOT NULL,
  gps_lat VARCHAR(50),
  gps_lng VARCHAR(50),
  gps_accuracy INTEGER,
  ip_address VARCHAR(45),
  user_agent TEXT,
  failure_reason TEXT,
  is_suspicious BOOLEAN NOT NULL DEFAULT false,
  suspicious_flags JSONB DEFAULT '[]',
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS offices_name_idx ON smart_attendance.offices(name);
CREATE INDEX IF NOT EXISTS offices_is_active_idx ON smart_attendance.offices(is_active);
CREATE INDEX IF NOT EXISTS geofences_office_id_idx ON smart_attendance.geofences(office_id);
CREATE INDEX IF NOT EXISTS geofences_is_active_idx ON smart_attendance.geofences(is_active);
CREATE INDEX IF NOT EXISTS qr_codes_qr_id_idx ON smart_attendance.qr_codes(qr_id);
CREATE INDEX IF NOT EXISTS qr_codes_office_id_idx ON smart_attendance.qr_codes(office_id);
CREATE INDEX IF NOT EXISTS qr_codes_expires_at_idx ON smart_attendance.qr_codes(expires_at);
CREATE INDEX IF NOT EXISTS qr_codes_is_used_idx ON smart_attendance.qr_codes(is_used);
CREATE INDEX IF NOT EXISTS qr_codes_nonce_idx ON smart_attendance.qr_codes(nonce);
CREATE INDEX IF NOT EXISTS qr_validation_logs_qr_id_idx ON smart_attendance.qr_validation_logs(qr_id);
CREATE INDEX IF NOT EXISTS qr_validation_logs_user_id_idx ON smart_attendance.qr_validation_logs(user_id);
CREATE INDEX IF NOT EXISTS qr_validation_logs_is_valid_idx ON smart_attendance.qr_validation_logs(is_valid);
CREATE INDEX IF NOT EXISTS qr_validation_logs_is_suspicious_idx ON smart_attendance.qr_validation_logs(is_suspicious);
CREATE INDEX IF NOT EXISTS qr_validation_logs_created_at_idx ON smart_attendance.qr_validation_logs(created_at);
```

## Verify Tables Were Created

After running the migration, verify the tables exist:

```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'smart_attendance' 
  AND table_name IN ('offices', 'geofences', 'qr_codes', 'qr_validation_logs');
```

You should see all 4 tables listed.

## Notes

- The `IF NOT EXISTS` clauses ensure the migration is safe to run multiple times
- If tables already exist, the migration will skip creating them
- All foreign key relationships are preserved
- Indexes are created for optimal query performance
