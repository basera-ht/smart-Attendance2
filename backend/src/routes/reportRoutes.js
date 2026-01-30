import express from 'express';
import { eq, and, gte, lte, isNotNull, sql, desc, asc, inArray } from 'drizzle-orm';
import moment from 'moment';
import { getDB } from '../config/db.js';
import { attendance, users } from '../db/schema.js';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { getDashboardStats, getAttendanceReport, getAdvancedAnalytics } from '../controllers/reportController.js';

const router = express.Router();

const DEFAULT_TIMEZONE = process.env.DEFAULT_TIMEZONE || 'Asia/Kolkata';

// @route   GET /api/reports/dashboard
// @desc    Get dashboard statistics
// @access  Private (Admin/HR only)
router.get('/dashboard', authenticate, authorize('admin', 'hr'), getDashboardStats);

// @route   GET /api/reports/attendance
// @desc    Get attendance report
// @access  Private (Admin/HR only)
router.get('/attendance', authenticate, authorize('admin', 'hr'), getAttendanceReport);

// @route   GET /api/reports/advanced
// @desc    Get advanced analytics insights
// @access  Private (Admin/HR only)
router.get('/advanced', authenticate, authorize('admin', 'hr'), getAdvancedAnalytics);

// @route   GET /api/reports/employee/:id
// @desc    Get individual employee report
// @access  Private
router.get('/employee/:id', authenticate, async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;
    const { startDate, endDate } = req.query;

    // Check if user can access this employee's data
    if (req.user.role === 'employee' && req.user.id !== id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    let conditions = [eq(attendance.employeeId, id)];

    if (startDate && endDate) {
      conditions.push(gte(attendance.date, moment(startDate).startOf('day').toDate()));
      conditions.push(lte(attendance.date, moment(endDate).endOf('day').toDate()));
    }

    const whereClause = and(...conditions);

    // Get attendance records (limit to last 100)
    const attendanceRecords = await db
      .select()
      .from(attendance)
      .where(whereClause)
      .orderBy(desc(attendance.date))
      .limit(100);

    // Calculate employee statistics
    const totalDays = attendanceRecords.length;
    const present = attendanceRecords.filter(a => a.status === 'present').length;
    const absent = attendanceRecords.filter(a => a.status === 'absent').length;
    const late = attendanceRecords.filter(a => a.status === 'late').length;
    const totalWorkingHours = attendanceRecords.reduce((sum, a) => sum + (a.workingHours || 0), 0);
    const averageWorkingHours = totalDays > 0 ? totalWorkingHours / totalDays : 0;
    const totalOvertime = attendanceRecords.reduce((sum, a) => sum + (a.overtime || 0), 0);

    const stats = {
      totalDays,
      present,
      absent,
      late,
      averageWorkingHours: Math.round(averageWorkingHours / 60 * 100) / 100, // Convert to hours
      totalOvertime: Math.round(totalOvertime / 60 * 100) / 100, // Convert to hours
    };

    res.json({
      success: true,
      data: {
        attendance: attendanceRecords,
        stats
      }
    });
  } catch (error) {
    console.error('Employee report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while generating employee report'
    });
  }
});

export default router;
