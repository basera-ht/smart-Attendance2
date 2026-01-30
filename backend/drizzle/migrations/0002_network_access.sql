ALTER TABLE smart_attendance.offices
ADD COLUMN IF NOT EXISTS allowed_ssids JSONB DEFAULT '[]'::jsonb;

ALTER TABLE smart_attendance.offices
ADD COLUMN IF NOT EXISTS allowed_ip_ranges JSONB DEFAULT '[]'::jsonb;

ALTER TABLE smart_attendance.users
ADD COLUMN IF NOT EXISTS fingerprint_hash TEXT;

ALTER TABLE smart_attendance.qr_codes
ALTER COLUMN geofence_id DROP NOT NULL;
