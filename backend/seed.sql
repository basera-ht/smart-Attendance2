-- Seed Admin User
-- Password is 'password123' hashed with bcrypt (placeholder, real script should generate this)
INSERT INTO smart_attendance.users (
  name, 
  email, 
  password, 
  role, 
  is_active, 
  created_at, 
  updated_at
)
VALUES (
  'Admin User', 
  'admin@lushai.com', 
  '$2a$10$YourHashedPasswordHere', 
  'admin', 
  true, 
  NOW(), 
  NOW()
)
ON CONFLICT (email) DO NOTHING;

-- Seed Default Office
INSERT INTO smart_attendance.offices (
  name, 
  address, 
  is_active, 
  created_at, 
  updated_at
)
SELECT 'Main Office', '123 Corporate Blvd', true, NOW(), NOW()
WHERE NOT EXISTS (
    SELECT 1 FROM smart_attendance.offices WHERE name = 'Main Office'
);
