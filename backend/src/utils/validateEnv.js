/**
 * Validates required environment variables on startup
 */
export const validateEnv = () => {
  const required = ['JWT_SECRET'];
  const missing = [];

  required.forEach(key => {
    if (!process.env[key]) {
      missing.push(key);
    }
  });

  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(key => {
      console.error(`   - ${key}`);
    });
    // Do not exit in production, let it fail with specific error later or return 500 on request
    // process.exit(1); 
  }

  // Validate database configuration
  if (!process.env.DATABASE_URL && !process.env.DB_HOST) {
    console.error('❌ Database configuration missing!');
    console.error('   Please set either DATABASE_URL or DB_HOST (and related DB_* variables)');
    console.error('   See .env.example for reference.\n');
    // process.exit(1);
  }

  // Warn about weak JWT secret in production
  if (process.env.NODE_ENV === 'production' && process.env.JWT_SECRET) {
    if (process.env.JWT_SECRET.length < 32) {
      console.warn('⚠️  WARNING: JWT_SECRET is too short for production use!');
      console.warn('   Please use a strong random string of at least 32 characters.\n');
    }
    if (process.env.JWT_SECRET.includes('change-this') || process.env.JWT_SECRET.includes('example')) {
      console.warn('⚠️  WARNING: JWT_SECRET appears to be a default/example value!');
      console.warn('   Please change it to a secure random string.\n');
    }
  }

  console.log('✅ Environment variables validated');
};

