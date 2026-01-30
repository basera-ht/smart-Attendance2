import express from 'express';
import { body, validationResult } from 'express-validator';
import { eq, and, or, like, sql, desc, inArray } from 'drizzle-orm';
import bcrypt from 'bcryptjs';
import { getDB } from '../config/db.js';
import { geofences, offices, qrCodes, qrValidationLogs, users } from '../db/schema.js';
import { authenticate, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// @route   GET /api/employees
// @desc    Get all employees
// @access  Private (Admin/HR only)
router.get('/', authenticate, authorize('admin', 'hr'), async (req, res) => {
  try {
    const db = getDB();
    const { page = 1, limit = 10, search, department, role, isActive } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    let conditions = [];

    // Search filter
    if (search) {
      conditions.push(
        or(
          like(users.name, `%${search}%`),
          like(users.email, `%${search}%`),
          like(users.employeeId, `%${search}%`)
        )
      );
    }

    // Department filter
    if (department) {
      conditions.push(like(users.department, `%${department}%`));
    }

    // Role filter
    if (role) {
      conditions.push(eq(users.role, role));
    }

    // Active status filter - by default, only show active employees
    if (isActive !== undefined) {
      conditions.push(eq(users.isActive, isActive === 'true'));
    } else {
      // Default: only show active employees
      conditions.push(eq(users.isActive, true));
    }

    const whereClause = and(...conditions);

    // Get total count
    const totalResult = await db
      .select({ count: sql`count(*)` })
      .from(users)
      .where(whereClause);
    const total = Number(totalResult[0]?.count || 0);

    // Get employees
    const employees = await db
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
      })
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(parseInt(limit))
      .offset(offset);

    res.json({
      success: true,
      data: {
        docs: employees,
        totalDocs: total,
        limit: parseInt(limit),
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        hasNextPage: offset + parseInt(limit) < total,
        hasPrevPage: parseInt(page) > 1,
      }
    });
  } catch (error) {
    console.error('Employees fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching employees'
    });
  }
});

// @route   GET /api/employees/:id
// @desc    Get single employee
// @access  Private
router.get('/:id', authenticate, async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;

    // Check if user can access this employee's data
    if (req.user.role === 'employee' && req.user.id !== id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const [employee] = await db
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
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    res.json({
      success: true,
      data: { employee }
    });
  } catch (error) {
    console.error('Employee fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching employee'
    });
  }
});

// @route   POST /api/employees
// @desc    Create new employee
// @access  Private (Admin/HR only)
router.post('/', authenticate, authorize('admin', 'hr'), [
  body('name').trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').isEmail().normalizeEmail().withMessage('Please enter a valid email'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').isIn(['admin', 'hr', 'employee']).withMessage('Invalid role'),
  body('department').optional().trim(),
  body('position').optional().trim(),
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

    const db = getDB();
    const { name, email, password, role, department, position, phone, address } = req.body;

    // Check if user already exists
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existingUser) {
      return res.status(400).json({
        success: false,
        message: 'Employee already exists with this email'
      });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    // Generate employee ID
    const timestamp = Date.now().toString().slice(-6);
    const employeeId = `EMP${timestamp}`;

    const [employee] = await db
      .insert(users)
      .values({
        name: name.trim(),
        email: email.toLowerCase().trim(),
        password: hashedPassword,
        role,
        employeeId,
        department: department?.trim() || null,
        position: position?.trim() || null,
        phone: phone?.trim() || null,
        address: address?.trim() || null,
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
        phone: users.phone,
        address: users.address,
        isActive: users.isActive,
      });

    res.status(201).json({
      success: true,
      message: 'Employee created successfully',
      data: {
        employee
      }
    });
  } catch (error) {
    console.error('Employee creation error:', error);
    
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Employee with this email or employee ID already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error during employee creation'
    });
  }
});

// @route   PUT /api/employees/:id
// @desc    Update employee
// @access  Private (Admin/HR only)
router.put('/:id', authenticate, authorize('admin', 'hr'), [
  body('name').optional().trim().isLength({ min: 2 }).withMessage('Name must be at least 2 characters'),
  body('email').optional().isEmail().normalizeEmail().withMessage('Please enter a valid email'),
  body('role').optional().isIn(['admin', 'hr', 'employee']).withMessage('Invalid role'),
  body('department').optional().trim(),
  body('position').optional().trim(),
  body('phone').optional().trim(),
  body('address').optional().trim(),
  body('isActive').optional().isBoolean().withMessage('isActive must be boolean')
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

    const db = getDB();
    const { id } = req.params;
    const updateData = {
      updatedAt: new Date(),
    };

    // Build update data
    if (req.body.name) updateData.name = req.body.name.trim();
    if (req.body.email) updateData.email = req.body.email.toLowerCase().trim();
    if (req.body.role) updateData.role = req.body.role;
    if (req.body.department !== undefined) updateData.department = req.body.department?.trim() || null;
    if (req.body.position !== undefined) updateData.position = req.body.position?.trim() || null;
    if (req.body.phone !== undefined) updateData.phone = req.body.phone?.trim() || null;
    if (req.body.address !== undefined) updateData.address = req.body.address?.trim() || null;
    if (req.body.isActive !== undefined) updateData.isActive = req.body.isActive;

    const [employee] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, id))
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

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    res.json({
      success: true,
      message: 'Employee updated successfully',
      data: { employee }
    });
  } catch (error) {
    console.error('Employee update error:', error);
    
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Email or employee ID already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Server error during employee update'
    });
  }
});

// @route   DELETE /api/employees/:id
// @desc    Delete employee (soft delete by default, or permanent delete if permanent=true)
// @access  Private (Admin only)
router.delete('/:id', authenticate, authorize('admin'), async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;
    const { permanent } = req.query; // Check if permanent deletion is requested

    // Check if employee exists
    const [existingEmployee] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, id))
      .limit(1);

    if (!existingEmployee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Permanent deletion
    if (permanent === 'true') {
      const [qrCodeCountResult] = await db
        .select({ count: sql`count(*)` })
        .from(qrCodes)
        .where(eq(qrCodes.createdById, id));
      const qrCodeCount = Number(qrCodeCountResult?.count || 0);
      if (qrCodeCount > 0) {
        return res.status(409).json({
          success: false,
          message: 'Cannot permanently delete employee who created QR codes. Reassign or delete those QR codes first.'
        });
      }

      await db
        .update(offices)
        .set({ createdById: null })
        .where(eq(offices.createdById, id));

      await db
        .update(geofences)
        .set({ createdById: null })
        .where(eq(geofences.createdById, id));

      await db
        .update(qrValidationLogs)
        .set({ userId: null })
        .where(eq(qrValidationLogs.userId, id));

      // Delete the employee permanently from database
      await db
        .delete(users)
        .where(eq(users.id, id));

      return res.json({
        success: true,
        message: 'Employee permanently deleted from database',
        data: { employee: existingEmployee }
      });
    }

    // Soft delete (deactivate) - default behavior
    const [employee] = await db
      .update(users)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, id))
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
      message: 'Employee deactivated successfully',
      data: { employee }
    });
  } catch (error) {
    console.error('Employee deletion error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during employee deletion',
      ...(process.env.NODE_ENV === 'development' && {
        error: error.message
      })
    });
  }
});

// @route   GET /api/employees/stats/overview
// @desc    Get employee statistics
// @access  Private (Admin/HR only)
router.get('/stats/overview', authenticate, authorize('admin', 'hr'), async (req, res) => {
  try {
    const db = getDB();
    
    // Get total active employees
    const totalResult = await db
      .select({ count: sql`count(*)` })
      .from(users)
      .where(eq(users.isActive, true));
    const totalEmployees = Number(totalResult[0]?.count || 0);

    // Get employees by role
    const employeesByRole = await db
      .select({
        role: users.role,
        count: sql`count(*)`,
      })
      .from(users)
      .where(eq(users.isActive, true))
      .groupBy(users.role);

    // Get employees by department
    const employeesByDepartment = await db
      .select({
        department: users.department,
        count: sql`count(*)`,
      })
      .from(users)
      .where(
        and(
          eq(users.isActive, true),
          sql`${users.department} IS NOT NULL AND ${users.department} != ''`
        )
      )
      .groupBy(users.department);

    res.json({
      success: true,
      data: {
        totalEmployees,
        employeesByRole: employeesByRole.map(r => ({
          _id: r.role,
          count: Number(r.count)
        })),
        employeesByDepartment: employeesByDepartment.map(d => ({
          _id: d.department,
          count: Number(d.count)
        }))
      }
    });
  } catch (error) {
    console.error('Employee stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching employee statistics'
    });
  }
});

export default router;
