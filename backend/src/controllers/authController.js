import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { users } from '../db/schema.js';
import { generateToken } from '../utils/generateToken.js';

export const register = async (req, res) => {
  try {
    // Input validation
    const errors = req.validationErrors || [];
    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors
      });
    }

    const { name, email, password, role, department, position, phone } = req.body;

    const db = getDB();

    // Check if user exists
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

    // Validate role assignment (prevent privilege escalation)
    const requestingUser = req.user;
    if (role === 'admin' && requestingUser?.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Only admins can create admin users'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate employee ID
    const timestamp = Date.now().toString().slice(-6);
    const employeeId = `EMP${timestamp}`;

    // Create user
    const [newUser] = await db
      .insert(users)
      .values({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        role: role || 'employee',
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
        createdAt: users.createdAt,
      });

    if (newUser) {
      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        data: {
          ...newUser,
          token: generateToken(newUser.id)
        }
      });
    }
  } catch (error) {
    console.error('Registration error:', error);
    
    // Handle duplicate key errors
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'User with this email or employee ID already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error in user registration',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

// Add validation middleware
export const validateRegistration = [
  // Validation is handled by express-validator in routes
];
