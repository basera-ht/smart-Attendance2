import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import { connectDB } from './src/config/db.js';
import { validateEnv } from './src/utils/validateEnv.js';
import authRoutes from './src/routes/authRoutes.js';
import employeeRoutes from './src/routes/employeeRoutes.js';
import attendanceRoutes from './src/routes/attendanceRoutes.js';
import reportRoutes from './src/routes/reportRoutes.js';
import taskRoutes from './src/routes/taskRoutes.js';
import leaveRoutes from './src/routes/leaveRoutes.js';
import holidayRoutes from './src/routes/holidayRoutes.js';
import qrRoutes from './src/routes/qrRoutes.js';
import officeRoutes from './src/routes/officeRoutes.js';
import { errorHandler } from './src/middleware/errorMiddleware.js';

// Load environment variables
dotenv.config();

// Validate required environment variables
validateEnv();

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy for correct client IP handling (set explicitly to avoid permissive default)
const trustProxySetting = process.env.TRUST_PROXY || 'loopback';
app.set('trust proxy', trustProxySetting);

// Enforce HTTPS in production (allow localhost/private IPs and explicit override)
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    const allowInsecure = process.env.ALLOW_INSECURE_HTTP === 'true';
    const host = req.hostname || '';
    const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1';
    const isPrivateIp = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host);
    const forwardedProto = req.headers['x-forwarded-proto'];
    if (!allowInsecure && !isLocalhost && !isPrivateIp && !req.secure && forwardedProto !== 'https') {
      return res.status(403).json({ success: false, message: 'HTTPS is required.' });
    }
  }
  next();
});

// Connect to PostgreSQL
connectDB().catch((error) => {
  console.error('Failed to connect to database:', error);
  process.exit(1);
});

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
    },
  },
  crossOriginEmbedderPolicy: false,
}));

const defaultAllowedOrigins = [
  'http://localhost:3000',
  'https://localhost:3000',
  'https://localhost:3443',
  'http://192.168.1.7:3000',
  'https://192.168.1.7:3000',
  'https://192.168.1.7:3443',
];
const envFrontendUrls = process.env.FRONTEND_URL
  ? process.env.FRONTEND_URL.split(',').map((value) => value.trim()).filter(Boolean)
  : [];
const allowedOrigins = [...new Set([...defaultAllowedOrigins, ...envFrontendUrls])];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      return callback(null, true);
    }
    if (allowedOrigins.includes(origin) || origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    console.log('Blocked Origin:', origin);
    return callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Rate limiting - more lenient for auth routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // limit each IP to 20 auth requests per windowMs (login, register, etc.)
  message: 'Too many authentication requests. Please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter rate limiting for other routes
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Apply auth rate limiter to auth routes
app.use('/api/auth', authLimiter);

// Apply general rate limiter to all other API routes (excluding auth)
app.use('/api', (req, res, next) => {
  // Skip rate limiting for auth routes (already handled above)
  if (req.path.startsWith('/auth')) {
    return next();
  }
  // Skip rate limiting for low-risk read endpoints
  if (req.path.startsWith('/offices')) {
    return next();
  }
  // Apply rate limiter for all other routes
  return apiLimiter(req, res, next);
});

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/analytics', reportRoutes); // Alias for analytics endpoints
app.use('/api/tasks', taskRoutes);
app.use('/api/leaves', leaveRoutes);
app.use('/api/holidays', holidayRoutes);
app.use('/api/qr', qrRoutes);
app.use('/api/offices', officeRoutes);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'Corporate Smart Attendance System API is running',
    timestamp: new Date().toISOString(),
    database: 'PostgreSQL with Drizzle ORM'
  });
});

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found'
  });
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM signal received: closing HTTP server');
  const { closeDB } = await import('./src/config/db.js');
  await closeDB();
  console.log('HTTP server closed');
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT signal received: closing HTTP server');
  const { closeDB } = await import('./src/config/db.js');
  await closeDB();
  console.log('HTTP server closed');
  process.exit(0);
});

// Only start the server if not running in Vercel (serverless)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/api/health`);
    console.log('HTTP server started');
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`💾 Database: PostgreSQL`);
    console.log('Database connected');
  });
}

export default app;
