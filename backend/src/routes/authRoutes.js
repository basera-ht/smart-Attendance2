import express from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { body, validationResult } from 'express-validator';
import bcrypt from 'bcryptjs';
import { eq, and, gte } from 'drizzle-orm';
import { getDB, connectDB, closeDB } from '../config/db.js';
import { users, refreshTokens } from '../db/schema.js';
import { authenticate } from '../middleware/authMiddleware.js';
import { verifyDevice } from '../services/deviceService.js';

const router = express.Router();

const isTransientDbError = (error) => {
  const message = error?.message || '';
  return message.includes('Connection terminated unexpectedly') || message.includes('terminating connection');
};

// Generate Access Token (short-lived, 15 minutes)
const generateAccessToken = (id) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  return jwt.sign(
    { id, type: 'access' },
    process.env.JWT_SECRET,
    {
      expiresIn: process.env.ACCESS_TOKEN_EXPIRY || '15m'
    }
  );
};

// Generate Refresh Token (long-lived, 7 days)
const generateRefreshTokenString = () => {
  return crypto.randomBytes(40).toString('hex');
};

// Store refresh token in database
const storeRefreshToken = async (token, userId, req) => {
  try {
    const db = getDB();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days expiry

    await db.insert(refreshTokens).values({
      token,
      userId,
      expiresAt,
      ipAddress: req.ip || null,
      userAgent: req.get('User-Agent') || null,
      revoked: false,
    });
  } catch (error) {
    console.error('Error storing refresh token:', error);
    // Don't throw error - allow login to continue even if refresh token storage fails
    return null;
  }
};

// @route   POST /api/auth/register
// @desc    Register a new user
// @access  Public
router.post('/register', [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(['admin', 'hr', 'employee']).withMessage('Invalid role')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, email, password, role = 'employee', department, position, phone } = req.body;
    const db = getDB();

    // Check if user already exists
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'User already exists with this email'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Role assignment logic:
    // 1. If trying to be admin, check if an admin already exists.
    // 2. If an admin exists, force role to 'employee' (First user policy).
    let assignedRole = role || 'employee';

    if (assignedRole === 'admin') {
      const [adminExists] = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.role, 'admin'))
        .limit(1);

      if (adminExists) {
        // Silently downgrade to employee if admin already exists
        assignedRole = 'employee';
      }
    }

    // Generate employee ID
    const timestamp = Date.now().toString().slice(-6);
    const employeeId = `EMP${timestamp}`;

    // Create user
    const [user] = await db
      .insert(users)
      .values({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        role: assignedRole,
        employeeId,
        department: department?.trim() || null,
        position: position?.trim() || null,
        phone: phone?.trim() || null,
        isActive: true,
      })
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        employeeId: users.employeeId,
        department: users.department,
        position: users.position,
      });

    // Generate tokens
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshTokenString();

    // Store refresh token (non-blocking - registration succeeds even if this fails)
    try {
      await storeRefreshToken(refreshToken, user.id, req);
    } catch (tokenStoreError) {
      console.error('Failed to store refresh token, but registration continues:', tokenStoreError);
    }

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          employeeId: user.employeeId,
          department: user.department,
          position: user.position
        },
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    console.error('Registration error:', error);

    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'User with this email or employee ID already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: `Server error during registration: ${error.message}`,
      // Optionally include stack in dev/test, but message is crucial for now
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// @route   POST /api/auth/login
// @desc    Login user
// @access  Public
router.post('/login', [
  body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
  body('password').notEmpty().withMessage('Password is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { email, password, deviceId } = req.body;
    const db = getDB();

    // Check if user exists
    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        password: users.password,
        role: users.role,
        employeeId: users.employeeId,
        department: users.department,
        position: users.position,
        isActive: users.isActive,
        lastLogin: users.lastLogin,
      })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Check if user is active
    if (!user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Account is deactivated'
      });
    }

    // Check password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: 'Invalid credentials'
      });
    }

    // Update last login
    await db
      .update(users)
      .set({ lastLogin: new Date() })

      .where(eq(users.id, user.id));

    // Attempt to bind/verify device if provided
    if (deviceId) {
      try {
        await verifyDevice(user.id, deviceId);
        console.log(`[Login] Device verified/linked for user ${user.id}: ${deviceId}`);
      } catch (deviceError) {
        // Log error but allow login (dashboard access shouldn't be blocked by device mismatch, only check-in)
        console.warn(`[Login] Device verification warning for user ${user.id}: ${deviceError.message}`);
      }
    }

    // Generate tokens
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshTokenString();

    // Store refresh token (non-blocking - login succeeds even if this fails)
    try {
      await storeRefreshToken(refreshToken, user.id, req);
    } catch (tokenStoreError) {
      console.error('Failed to store refresh token, but login continues:', tokenStoreError);
    }

    res.json({
      success: true,
      message: 'Login successful',
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          employeeId: user.employeeId,
          department: user.department,
          position: user.position,
          lastLogin: new Date()
        },
        accessToken,
        refreshToken
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during login'
    });
  }
});

// @route   GET /api/auth/profile
// @desc    Get current user profile
// @access  Private
router.get('/profile', authenticate, async (req, res) => {
  try {
    const db = getDB();
    const [user] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        employeeId: users.employeeId,
        department: users.department,
        position: users.position,
        phone: users.phone,
        address: users.address,
        isActive: users.isActive,
        lastLogin: users.lastLogin,
        profilePicture: users.profilePicture,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
        registeredDeviceId: users.registeredDeviceId
      })
      .from(users)
      .where(eq(users.id, req.user.id))
      .limit(1);

    res.json({
      success: true,
      data: { user }
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching profile'
    });
  }
});

// @route   PUT /api/auth/profile
// @desc    Update user profile
// @access  Private
router.put('/profile', authenticate, [
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('phone').optional().trim(),
  body('address').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { name, phone, address } = req.body;
    const db = getDB();
    const updateData = {
      updatedAt: new Date(),
    };

    if (name) updateData.name = name.trim();
    if (phone !== undefined) updateData.phone = phone?.trim() || null;
    if (address !== undefined) updateData.address = address?.trim() || null;

    const [user] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, req.user.id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        employeeId: users.employeeId,
        department: users.department,
        position: users.position,
        phone: users.phone,
        address: users.address,
        isActive: users.isActive,
        lastLogin: users.lastLogin,
        profilePicture: users.profilePicture,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: { user }
    });
  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating profile'
    });
  }
});

// @route   POST /api/auth/refresh
// @desc    Refresh access token using refresh token
// @access  Public
router.post('/refresh', [
  body('refreshToken').notEmpty().withMessage('Refresh token is required')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const { refreshToken } = req.body;
    let db = getDB();

    const loadStoredToken = async (dbClient) => {
      const [stored] = await dbClient
        .select({
          token: refreshTokens.token,
          userId: refreshTokens.userId,
          expiresAt: refreshTokens.expiresAt,
          revoked: refreshTokens.revoked,
          user: {
            id: users.id,
            isActive: users.isActive,
          }
        })
        .from(refreshTokens)
        .leftJoin(users, eq(refreshTokens.userId, users.id))
        .where(
          and(
            eq(refreshTokens.token, refreshToken),
            eq(refreshTokens.revoked, false)
          )
        )
        .limit(1);
      return stored;
    };

    let storedToken;
    try {
      storedToken = await loadStoredToken(db);
    } catch (error) {
      if (!isTransientDbError(error)) {
        throw error;
      }
      await closeDB();
      await connectDB();
      db = getDB();
      storedToken = await loadStoredToken(db);
    }

    if (!storedToken) {
      return res.status(401).json({
        success: false,
        message: 'Invalid refresh token'
      });
    }

    // Check if token is expired
    if (new Date() > new Date(storedToken.expiresAt)) {
      // Mark as revoked
      await db
        .update(refreshTokens)
        .set({
          revoked: true,
          revokedAt: new Date(),
        })
        .where(eq(refreshTokens.token, refreshToken));

      return res.status(401).json({
        success: false,
        message: 'Refresh token expired'
      });
    }

    // Check if user is still active
    if (!storedToken.user?.isActive) {
      return res.status(401).json({
        success: false,
        message: 'User account is deactivated'
      });
    }

    // Generate new access token
    const accessToken = generateAccessToken(storedToken.userId);

    res.json({
      success: true,
      message: 'Token refreshed successfully',
      data: {
        accessToken
      }
    });
  } catch (error) {
    console.error('Refresh token error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during token refresh'
    });
  }
});

// @route   POST /api/auth/logout
// @desc    Logout user and revoke refresh token
// @access  Private
router.post('/logout', authenticate, [
  body('refreshToken').optional().notEmpty().withMessage('Refresh token is required')
], async (req, res) => {
  try {
    const { refreshToken } = req.body;
    const db = getDB();

    if (refreshToken) {
      // Revoke the refresh token
      await db
        .update(refreshTokens)
        .set({
          revoked: true,
          revokedAt: new Date(),
        })
        .where(
          and(
            eq(refreshTokens.token, refreshToken),
            eq(refreshTokens.userId, req.user.id)
          )
        );
    } else {
      // Revoke all refresh tokens for this user
      await db
        .update(refreshTokens)
        .set({
          revoked: true,
          revokedAt: new Date(),
        })
        .where(
          and(
            eq(refreshTokens.userId, req.user.id),
            eq(refreshTokens.revoked, false)
          )
        );
    }

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during logout'
    });
  }
});

// @route   GET /api/auth/tokens
// @desc    Get all active refresh tokens for current user
// @access  Private
router.get('/tokens', authenticate, async (req, res) => {
  try {
    const db = getDB();
    const tokens = await db
      .select({
        id: refreshTokens.id,
        ipAddress: refreshTokens.ipAddress,
        userAgent: refreshTokens.userAgent,
        createdAt: refreshTokens.createdAt,
        expiresAt: refreshTokens.expiresAt,
      })
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.userId, req.user.id),
          eq(refreshTokens.revoked, false),
          gte(refreshTokens.expiresAt, new Date())
        )
      );

    res.json({
      success: true,
      data: {
        tokens
      }
    });
  } catch (error) {
    console.error('Get tokens error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching tokens'
    });
  }
});


// @route   GET /api/auth/admin-check
// @desc    Check if an admin account already exists
// @access  Public
router.get('/admin-check', async (req, res) => {
  try {
    const db = getDB();
    const [admin] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.role, 'admin'))
      .limit(1);

    res.json({
      success: true,
      exists: !!admin
    });
  } catch (error) {
    console.error('Check admin exists error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error'
    });
  }
});

export default router;
