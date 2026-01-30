import express from 'express';
import { body, validationResult } from 'express-validator';
import { eq, and, or, gte, lte, inArray, desc, sql } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { leaves, users } from '../db/schema.js';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { calculateWorkingDays } from '../utils/holidays.js';

const router = express.Router();

// @route   GET /api/leaves
// @desc    Get leave requests
// @access  Private (Admin/HR can see all, employees see only their own)
router.get('/', authenticate, async (req, res) => {
  try {
    const db = getDB();
    const { page = 1, limit = 10, status, leaveType, startDate, endDate, employeeId } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Get all active employee IDs to filter out deactivated users
    const activeEmployees = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.isActive, true));
    const activeEmployeeIds = activeEmployees.map(emp => emp.id);
    
    let conditions = [
      inArray(leaves.employeeId, activeEmployeeIds.length > 0 ? activeEmployeeIds : [0])
    ];

    // If employee, only show their own leaves
    if (req.user.role === 'employee') {
      // Convert user.id to integer for comparison (since IDs are now integers)
      const userId = typeof req.user.id === 'string' ? parseInt(req.user.id, 10) : req.user.id;
      if (isNaN(userId) || !activeEmployeeIds.some(id => id === userId)) {
        return res.status(403).json({
          success: false,
          message: 'Your account is deactivated'
        });
      }
      conditions = [eq(leaves.employeeId, userId)];
    } else if (employeeId) {
      // Admin/HR can filter by employee - ensure the employee is active
      // Convert employeeId to integer for comparison (since IDs are now integers)
      const employeeIdInt = parseInt(employeeId, 10);
      if (isNaN(employeeIdInt) || !activeEmployeeIds.some(id => id === employeeIdInt)) {
        return res.status(400).json({
          success: false,
          message: 'Employee is deactivated or invalid'
        });
      }
      conditions.push(eq(leaves.employeeId, employeeIdInt));
    }

    // Filters
    if (status) conditions.push(eq(leaves.status, status));
    if (leaveType) conditions.push(eq(leaves.leaveType, leaveType));
    
    if (startDate || endDate) {
      if (startDate) {
        try {
          // Handle both ISO strings and YYYY-MM-DD format
          let startDateObj;
          if (typeof startDate === 'string' && startDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            startDateObj = new Date(startDate + 'T00:00:00');
          } else {
            startDateObj = new Date(startDate);
          }
          if (!isNaN(startDateObj.getTime())) {
            conditions.push(gte(leaves.startDate, startDateObj));
          }
        } catch (err) {
          console.error('Invalid startDate:', startDate, err);
        }
      }
      if (endDate) {
        try {
          // Handle both ISO strings and YYYY-MM-DD format
          let endDateObj;
          if (typeof endDate === 'string' && endDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            // For end date, set to end of day
            endDateObj = new Date(endDate + 'T23:59:59.999');
          } else {
            endDateObj = new Date(endDate);
          }
          if (!isNaN(endDateObj.getTime())) {
            conditions.push(lte(leaves.endDate, endDateObj));
          }
        } catch (err) {
          console.error('Invalid endDate:', endDate, err);
        }
      }
    }

    const whereClause = and(...conditions);

    // Get total count
    const totalResult = await db
      .select({ count: sql`count(*)` })
      .from(leaves)
      .where(whereClause);
    const total = Number(totalResult[0]?.count || 0);

    // Get leaves with employee details
    const leaveRecords = await db
      .select({
        leave: leaves,
        employee: {
          id: users.id,
          name: users.name,
          email: users.email,
          employeeId: users.employeeId,
          department: users.department,
          position: users.position,
        }
      })
      .from(leaves)
      .leftJoin(users, eq(leaves.employeeId, users.id))
      .where(whereClause)
      .orderBy(desc(leaves.appliedDate))
      .limit(parseInt(limit))
      .offset(offset);

    // Format response
    const formattedData = leaveRecords.map(record => ({
      ...record.leave,
      employee: record.employee
    }));

    res.json({
      success: true,
      data: {
        docs: formattedData,
        totalDocs: total,
        limit: parseInt(limit),
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        hasNextPage: offset + parseInt(limit) < total,
        hasPrevPage: parseInt(page) > 1,
      }
    });
  } catch (error) {
    console.error('Get leaves error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching leaves'
    });
  }
});

// @route   POST /api/leaves
// @desc    Create a new leave request
// @access  Private (Employee)
router.post('/', authenticate, [
  body('leaveType').isIn(['sick', 'vacation', 'personal', 'emergency', 'maternity', 'paternity', 'bereavement', 'marriage', 'funeral', 'other']).withMessage('Invalid leave type'),
  body('startDate').custom((value) => {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new Error('Start date must be a valid date');
    }
    return true;
  }),
  body('endDate').custom((value) => {
    const date = new Date(value);
    if (isNaN(date.getTime())) {
      throw new Error('End date must be a valid date');
    }
    return true;
  }),
  body('reason').notEmpty().withMessage('Reason is required').isLength({ max: 500 }).withMessage('Reason cannot exceed 500 characters')
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

    const { leaveType, startDate, endDate, reason, attachments, isPaid } = req.body;
    const db = getDB();

    // Validate dates
    let start, end;
    
    try {
      if (typeof startDate === 'string' && startDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        start = new Date(startDate + 'T00:00:00');
      } else {
        start = new Date(startDate);
      }
      
      if (typeof endDate === 'string' && endDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
        end = new Date(endDate + 'T00:00:00');
      } else {
        end = new Date(endDate);
      }
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          message: 'Invalid date format. Please provide valid dates.',
          received: { startDate, endDate }
        });
      }
    } catch (dateError) {
      console.error('Date parsing error:', dateError);
      return res.status(400).json({
        success: false,
        message: 'Invalid date format. Please provide valid dates.'
      });
    }
    
    if (start > end) {
      return res.status(400).json({
        success: false,
        message: 'Start date must be before or equal to end date'
      });
    }

    // Check if start date is in the past (allow today)
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (start < today) {
      return res.status(400).json({
        success: false,
        message: 'Cannot apply for leave in the past'
      });
    }

    // Check for overlapping leaves
    const [overlappingLeave] = await db
      .select()
      .from(leaves)
      .where(
        and(
          eq(leaves.employeeId, req.user.id),
          inArray(leaves.status, ['pending', 'approved']),
          lte(leaves.startDate, end),
          gte(leaves.endDate, start)
        )
      )
      .limit(1);

    if (overlappingLeave) {
      return res.status(400).json({
        success: false,
        message: 'You have an overlapping leave request that is pending or approved'
      });
    }

    const trimmedReason = reason ? reason.trim() : '';
    
    if (!trimmedReason) {
      return res.status(400).json({
        success: false,
        message: 'Reason is required'
      });
    }

    // Check paid leave limit: 2 paid leaves per month
    const leaveMonth = start.getMonth();
    const leaveYear = start.getFullYear();
    const monthStart = new Date(leaveYear, leaveMonth, 1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(leaveYear, leaveMonth + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);
    
    const paidLeavesCountResult = await db
      .select({ count: sql`count(*)` })
      .from(leaves)
      .where(
        and(
          eq(leaves.employeeId, req.user.id),
          inArray(leaves.status, ['approved', 'pending']),
          eq(leaves.isPaid, true),
          lte(leaves.startDate, monthEnd),
          gte(leaves.endDate, monthStart)
        )
      );
    const paidLeavesCount = Number(paidLeavesCountResult[0]?.count || 0);

    // Determine if this leave should be paid or unpaid
    let finalIsPaid = isPaid !== undefined ? isPaid : true;
    let autoUnpaidMessage = null;
    
    if (paidLeavesCount >= 2) {
      finalIsPaid = false;
      autoUnpaidMessage = `You have already used your 2 paid leaves for this month. This leave will be marked as unpaid.`;
    }

    // Calculate working days (excluding weekends, fixed holidays, and selected optional holidays)
    const totalDays = await calculateWorkingDays(start, end);

    const [leave] = await db
      .insert(leaves)
      .values({
        employeeId: req.user.id,
        leaveType,
        startDate: start,
        endDate: end,
        totalDays,
        reason: trimmedReason,
        attachments: attachments || [],
        isPaid: finalIsPaid,
        status: 'pending',
      })
      .returning();

    // Get employee data
    const [employee] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        employeeId: users.employeeId,
        department: users.department,
        position: users.position,
      })
      .from(users)
      .where(
        and(
          eq(users.id, req.user.id),
          eq(users.isActive, true)
        )
      )
      .limit(1);
      
    if (!employee) {
      return res.status(400).json({
        success: false,
        message: 'Cannot create leave request for deactivated user'
      });
    }

    res.status(201).json({
      success: true,
      message: autoUnpaidMessage || 'Leave request submitted successfully',
      data: {
        ...leave,
        employee
      },
      ...(autoUnpaidMessage && { warning: autoUnpaidMessage })
    });
  } catch (error) {
    console.error('Create leave error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating leave request',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// @route   PUT /api/leaves/:id
// @desc    Update leave request (employee can update pending, admin can approve/reject)
// @access  Private
router.put('/:id', authenticate, [
  body('leaveType').optional().isIn(['sick', 'vacation', 'personal', 'emergency', 'maternity', 'paternity', 'bereavement', 'other']),
  body('startDate').optional().isISO8601(),
  body('endDate').optional().isISO8601(),
  body('reason').optional().trim().isLength({ max: 500 }),
  body('status').optional().isIn(['pending', 'approved', 'rejected', 'cancelled']),
  body('reviewComments').optional().trim().isLength({ max: 500 })
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
    const [leave] = await db
      .select()
      .from(leaves)
      .where(eq(leaves.id, req.params.id))
      .limit(1);

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found'
      });
    }

    // Check permissions
    const isEmployee = req.user.role === 'employee';
    const isAdmin = ['admin', 'hr'].includes(req.user.role);
    
    if (isEmployee && leave.employeeId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    const { leaveType, startDate, endDate, reason, status, reviewComments, attachments, isPaid } = req.body;
    let autoUnpaidMessage = null;
    const updateData = { updatedAt: new Date() };

    // Employees can only update pending leaves
    if (isEmployee) {
      if (leave.status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'Can only update pending leave requests'
        });
      }
      
      if (status && status !== 'cancelled' && status !== 'pending') {
        return res.status(400).json({
          success: false,
          message: 'You can only cancel your leave requests'
        });
      }

      const checkStartDate = startDate ? new Date(startDate) : leave.startDate;
      const checkEndDate = endDate ? new Date(endDate) : leave.endDate;
      
      if ((startDate || endDate || isPaid !== undefined) && (status !== 'cancelled')) {
        const checkMonth = checkStartDate.getMonth();
        const checkYear = checkStartDate.getFullYear();
        const monthStart = new Date(checkYear, checkMonth, 1);
        monthStart.setHours(0, 0, 0, 0);
        const monthEnd = new Date(checkYear, checkMonth + 1, 0);
        monthEnd.setHours(23, 59, 59, 999);
        
        const paidLeavesCountResult = await db
          .select({ count: sql`count(*)` })
          .from(leaves)
          .where(
            and(
              eq(leaves.employeeId, req.user.id),
              sql`${leaves.id} != ${leave.id}`,
              inArray(leaves.status, ['approved', 'pending']),
              eq(leaves.isPaid, true),
              lte(leaves.startDate, monthEnd),
              gte(leaves.endDate, monthStart)
            )
          );
        const paidLeavesCount = Number(paidLeavesCountResult[0]?.count || 0);
        
        let finalIsPaid = isPaid !== undefined ? isPaid : leave.isPaid;
        
        if (paidLeavesCount >= 2 && finalIsPaid) {
          finalIsPaid = false;
          autoUnpaidMessage = `You have already used your 2 paid leaves for this month. This leave will be marked as unpaid.`;
        }
        
        if (leaveType) updateData.leaveType = leaveType;
        if (startDate) {
          // Parse date consistently with POST endpoint to avoid timezone issues
          if (typeof startDate === 'string' && startDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            updateData.startDate = new Date(startDate + 'T00:00:00');
          } else {
            updateData.startDate = new Date(startDate);
          }
        }
        if (endDate) {
          // Parse date consistently with POST endpoint to avoid timezone issues
          if (typeof endDate === 'string' && endDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            updateData.endDate = new Date(endDate + 'T00:00:00');
          } else {
            updateData.endDate = new Date(endDate);
          }
        }
        if (reason) updateData.reason = reason;
        if (attachments) updateData.attachments = attachments;
        updateData.isPaid = finalIsPaid;
        if (status === 'cancelled') updateData.status = 'cancelled';
      } else {
        if (leaveType) updateData.leaveType = leaveType;
        if (startDate) {
          // Parse date consistently with POST endpoint to avoid timezone issues
          if (typeof startDate === 'string' && startDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            updateData.startDate = new Date(startDate + 'T00:00:00');
          } else {
            updateData.startDate = new Date(startDate);
          }
        }
        if (endDate) {
          // Parse date consistently with POST endpoint to avoid timezone issues
          if (typeof endDate === 'string' && endDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
            updateData.endDate = new Date(endDate + 'T00:00:00');
          } else {
            updateData.endDate = new Date(endDate);
          }
        }
        if (reason) updateData.reason = reason;
        if (attachments) updateData.attachments = attachments;
        if (isPaid !== undefined) updateData.isPaid = isPaid;
        if (status === 'cancelled') updateData.status = 'cancelled';
      }
    }

    // Admin/HR can approve/reject
    if (isAdmin) {
      if (status && ['approved', 'rejected'].includes(status)) {
        updateData.status = status;
        updateData.reviewedById = req.user.id;
        updateData.reviewedAt = new Date();
        if (reviewComments) updateData.reviewComments = reviewComments;
      }
      if (leaveType) updateData.leaveType = leaveType;
      if (startDate) {
        // Parse date consistently with POST endpoint to avoid timezone issues
        if (typeof startDate === 'string' && startDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
          updateData.startDate = new Date(startDate + 'T00:00:00');
        } else {
          updateData.startDate = new Date(startDate);
        }
      }
      if (endDate) {
        // Parse date consistently with POST endpoint to avoid timezone issues
        if (typeof endDate === 'string' && endDate.match(/^\d{4}-\d{2}-\d{2}$/)) {
          updateData.endDate = new Date(endDate + 'T00:00:00');
        } else {
          updateData.endDate = new Date(endDate);
        }
      }
      if (reason) updateData.reason = reason;
      if (isPaid !== undefined) updateData.isPaid = isPaid;
    }

    // Recalculate working days if dates changed (excluding weekends, fixed holidays, and selected optional holidays)
    if (startDate || endDate) {
      const finalStart = updateData.startDate || leave.startDate;
      const finalEnd = updateData.endDate || leave.endDate;
      updateData.totalDays = await calculateWorkingDays(finalStart, finalEnd);
    }

    const [updatedLeave] = await db
      .update(leaves)
      .set(updateData)
      .where(eq(leaves.id, req.params.id))
      .returning();

    // Get employee and reviewer details
    const [employee] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        employeeId: users.employeeId,
        department: users.department,
        position: users.position,
      })
      .from(users)
      .where(
        and(
          eq(users.id, updatedLeave.employeeId),
          eq(users.isActive, true)
        )
      )
      .limit(1);
    
    if (!employee) {
      return res.status(400).json({
        success: false,
        message: 'Cannot update leave request for deactivated user'
      });
    }

    let reviewer = null;
    if (updatedLeave.reviewedById) {
      const [reviewerData] = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
        })
        .from(users)
        .where(eq(users.id, updatedLeave.reviewedById))
        .limit(1);
      reviewer = reviewerData;
    }

    let responseMessage = 'Leave request updated successfully';
    let responseWarning = null;
    
    if (isEmployee && autoUnpaidMessage) {
      responseMessage = autoUnpaidMessage;
      responseWarning = autoUnpaidMessage;
    }
    
    res.json({
      success: true,
      message: responseMessage,
      data: {
        ...updatedLeave,
        employee,
        reviewedBy: reviewer
      },
      ...(responseWarning && { warning: responseWarning })
    });
  } catch (error) {
    console.error('Update leave error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating leave request'
    });
  }
});

// @route   DELETE /api/leaves/:id
// @desc    Delete leave request (only pending leaves can be deleted)
// @access  Private
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const db = getDB();
    const [leave] = await db
      .select()
      .from(leaves)
      .where(eq(leaves.id, req.params.id))
      .limit(1);

    if (!leave) {
      return res.status(404).json({
        success: false,
        message: 'Leave request not found'
      });
    }

    // Check permissions
    if (req.user.role === 'employee' && leave.employeeId !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Only allow deletion of pending leaves
    if (leave.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: 'Can only delete pending leave requests'
      });
    }

    await db
      .delete(leaves)
      .where(eq(leaves.id, req.params.id));

    res.json({
      success: true,
      message: 'Leave request deleted successfully'
    });
  } catch (error) {
    console.error('Delete leave error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting leave request'
    });
  }
});

// @route   GET /api/leaves/stats
// @desc    Get leave statistics
// @access  Private
router.get('/stats', authenticate, async (req, res) => {
  try {
    const db = getDB();
    const activeEmployees = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.isActive, true));
    const activeEmployeeIds = activeEmployees.map(emp => emp.id);
    
    let conditions = [
      inArray(leaves.employeeId, activeEmployeeIds.length > 0 ? activeEmployeeIds : [0])
    ];
    
    if (req.user.role === 'employee') {
      conditions = [eq(leaves.employeeId, req.user.id)];
    }

    const whereClause = and(...conditions);

    const [totalResult] = await db
      .select({ count: sql`count(*)` })
      .from(leaves)
      .where(whereClause);
    const total = Number(totalResult?.count || 0);

    const [pendingResult] = await db
      .select({ count: sql`count(*)` })
      .from(leaves)
      .where(and(whereClause, eq(leaves.status, 'pending')));
    const pending = Number(pendingResult?.count || 0);

    const [approvedResult] = await db
      .select({ count: sql`count(*)` })
      .from(leaves)
      .where(and(whereClause, eq(leaves.status, 'approved')));
    const approved = Number(approvedResult?.count || 0);

    const [rejectedResult] = await db
      .select({ count: sql`count(*)` })
      .from(leaves)
      .where(and(whereClause, eq(leaves.status, 'rejected')));
    const rejected = Number(rejectedResult?.count || 0);

    const yearStart = new Date(new Date().getFullYear(), 0, 1);
    const yearEnd = new Date(new Date().getFullYear() + 1, 0, 1);
    const [thisYearResult] = await db
      .select({ count: sql`count(*)` })
      .from(leaves)
      .where(
        and(
          whereClause,
          gte(leaves.appliedDate, yearStart),
          lte(leaves.appliedDate, yearEnd)
        )
      );
    const thisYear = Number(thisYearResult?.count || 0);

    res.json({
      success: true,
      data: {
        total,
        pending,
        approved,
        rejected,
        thisYear
      }
    });
  } catch (error) {
    console.error('Get leave stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching leave statistics'
    });
  }
});

export default router;
