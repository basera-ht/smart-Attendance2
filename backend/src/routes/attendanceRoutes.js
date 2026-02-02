import express from 'express';
import { body, validationResult } from 'express-validator';
import { eq, and, gte, lte, desc, asc, sql, isNotNull } from 'drizzle-orm';
import moment from 'moment';
import { getDB } from '../config/db.js';
import { attendance, users, leaves, offices } from '../db/schema.js';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { checkIn, checkOut, exportMonthlyExcel } from '../controllers/attendanceController.js';
import { getClientIp, isIpInRanges } from '../utils/ipUtils.js';


const router = express.Router();

// @route   POST /api/attendance/checkin
// @desc    Check in for attendance
// @access  Private
router.post('/checkin', authenticate, [
  body('location').optional().trim(),
  body('notes').optional().trim(),
  body('deviceId').notEmpty().withMessage('Device ID is required')
], checkIn);

// @route   POST /api/attendance/checkout
// @desc    Check out for attendance
// @access  Private
router.post('/checkout', authenticate, [
  body('location').optional().trim(),
  body('notes').optional().trim()
], checkOut);

// @route   POST /api/attendance/validate
// @desc    Deprecated: use /attendance/submit
// @access  Private

// @route   POST /api/attendance/checkin-secure
// @desc    Secure Geofence Check-In (No QR)
// @access  Private


router.post('/checkin-secure', authenticate, async (req, res) => {
  try {
    const db = getDB();
    const userId = req.user.id;
    const ipAddress = getClientIp(req);
    const userAgent = req.get('User-Agent') || '';

    // 1. Get Active Offices
    const activeOffices = await db.select().from(offices).where(eq(offices.isActive, true));

    if (!activeOffices.length) {
      return res.status(400).json({ success: false, message: 'No active offices found.' });
    }

    // 2. Strict IP Check (Wi-Fi Validation)
    let matchedOffice = null;

    for (const office of activeOffices) {
      if (office.allowedIPRanges && office.allowedIPRanges.length > 0) {
        if (isIpInRanges(ipAddress, office.allowedIPRanges)) {
          matchedOffice = office;
          break;
        }
        // IP Check (Primary Guard)
        let ipMatch = true;
        if (office.allowedIPRanges && office.allowedIPRanges.length > 0) {
          ipMatch = isIpInRanges(ipAddress, office.allowedIPRanges);
        }

        if (!ipMatch) continue; // Must match IP first

        // GPS Check (Secondary Guard)
        if (office.latitude && office.longitude) {
          const officeLoc = { lat: parseFloat(office.latitude), lon: parseFloat(office.longitude) };
          const dist = haversine(userLoc, officeLoc); // Meters

          if (dist <= MAX_DISTANCE && dist < minDistance) {
            minDistance = dist;
            matchedOffice = office;
          }
        }
      }
    }

    if (!matchedOffice) {
      // Construct detailed error
      // If IP matched none:
      const ipMatches = activeOffices.some(o => o.allowedIPRanges && o.allowedIPRanges.length > 0 && isIpInRanges(ipAddress, o.allowedIPRanges));
      if (!ipMatches) {
        return res.status(400).json({ success: false, message: 'Network Mismatch: Connect to Office Wi-Fi.' });
      }
      return res.status(400).json({
        success: false,
        message: `Location Mismatch: You are too far from the office.`,
        details: { distance: minDistance === Infinity ? 'Unknown' : Math.round(minDistance) }
      });
    }

    // 4. Record Attendance
    const today = moment().startOf('day').toDate();
    const [existing] = await db.select().from(attendance)
      .where(and(eq(attendance.employeeId, userId), gte(attendance.date, today)))
      .limit(1);

    if (existing) return res.status(400).json({ success: false, message: "Already checked in today" });

    const [record] = await db.insert(attendance).values({
      employeeId: userId,
      date: today,
      checkInTime: new Date(),
      checkInLocation: `Secure: ${matchedOffice.name} (${Math.round(minDistance)}m)`,
      checkInIpAddress: ipAddress,
      checkInDeviceInfo: userAgent,
      status: 'present'
    }).returning();

    res.json({
      success: true,
      message: `Checked in at ${matchedOffice.name}`,
      data: {
        attendance: record,
        office: matchedOffice.name,
        distance: Math.round(minDistance)
      }
    });

  } catch (error) {
    console.error('Secure Checkin Error:', error);
    res.status(500).json({ success: false, message: 'Server Error' });
  }
});



// @route   GET /api/attendance
// @desc    Get attendance records
// @access  Private (Admin/HR can see all, employees see only their own)
router.get('/', authenticate, async (req, res) => {
  try {
    const db = getDB();
    const { page = 1, limit = 10, employeeId, startDate, endDate, status } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let conditions = [];

    // If not admin or HR, only show own records
    if (req.user.role === 'employee') {
      conditions.push(eq(attendance.employeeId, req.user.id));
    } else if (employeeId) {
      conditions.push(eq(attendance.employeeId, employeeId));
    }

    // Date range filter
    if (startDate || endDate) {
      if (startDate) {
        conditions.push(gte(attendance.date, moment(startDate).startOf('day').toDate()));
      }
      if (endDate) {
        conditions.push(lte(attendance.date, moment(endDate).endOf('day').toDate()));
      }
    }

    // Status filter
    if (status) {
      conditions.push(eq(attendance.status, status));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const totalResult = await db
      .select({ count: sql`count(*)` })
      .from(attendance)
      .where(whereClause);
    const total = Number(totalResult[0]?.count || 0);

    // Get attendance records with employee details
    const attendanceRecords = await db
      .select({
        attendance: attendance,
        employee: {
          id: users.id,
          name: users.name,
          email: users.email,
          employeeId: users.employeeId,
          department: users.department,
          position: users.position,
        }
      })
      .from(attendance)
      .leftJoin(users, eq(attendance.employeeId, users.id))
      .where(whereClause)
      .orderBy(desc(attendance.date))
      .limit(parseInt(limit))
      .offset(offset);

    // Format response
    const formattedData = attendanceRecords.map(record => ({
      ...record.attendance,
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
    console.error('Attendance fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching attendance'
    });
  }
});

// @route   GET /api/attendance/today
// @desc    Get today's attendance records
// @access  Private (Admin/HR can see all, employees see only their own)
router.get('/today', authenticate, async (req, res) => {
  try {
    const db = getDB();
    const today = moment().startOf('day').toDate();
    const todayEnd = moment(today).endOf('day').toDate();

    let conditions = [
      gte(attendance.date, today),
      lte(attendance.date, todayEnd)
    ];

    // If employee, return full record for their dashboard
    if (req.user.role === 'employee') {
      conditions.push(eq(attendance.employeeId, req.user.id));

      const [record] = await db
        .select()
        .from(attendance)
        .where(and(...conditions))
        .limit(1);

      if (record) {
        return res.json({
          success: true,
          data: {
            id: record.id,
            checkIn: record.checkInTime ? new Date(record.checkInTime).toISOString() : null,
            checkOut: record.checkOutTime ? new Date(record.checkOutTime).toISOString() : null,
            status: record.status || (record.checkInTime ? 'present' : 'absent'),
            workingHours: record.workingHours || 0,
            overtime: record.overtime || 0,
            date: moment(record.date).format('YYYY-MM-DD')
          }
        });
      } else {
        return res.json({
          success: true,
          data: {
            checkIn: null,
            checkOut: null,
            status: 'absent',
            workingHours: 0,
            overtime: 0,
            date: moment(today).format('YYYY-MM-DD')
          }
        });
      }
    }

    // Admin/HR see all records
    const attendanceRecords = await db
      .select({
        attendance: attendance,
        employee: {
          id: users.id,
          name: users.name,
          email: users.email,
          employeeId: users.employeeId,
          department: users.department,
          position: users.position,
        }
      })
      .from(attendance)
      .leftJoin(users, eq(attendance.employeeId, users.id))
      .where(and(...conditions))
      .orderBy(asc(attendance.checkInTime));

    // Format response
    const data = attendanceRecords.map(r => ({
      id: r.attendance.id,
      employeeId: r.attendance.employeeId,
      employeeName: r.employee?.name || 'Unknown',
      employee: r.employee,
      checkIn: r.attendance.checkInTime ? new Date(r.attendance.checkInTime).toLocaleTimeString() : null,
      checkInTime: r.attendance.checkInTime ? new Date(r.attendance.checkInTime) : null,
      checkOut: r.attendance.checkOutTime ? new Date(r.attendance.checkOutTime).toLocaleTimeString() : null,
      status: r.attendance.status ? r.attendance.status.charAt(0).toUpperCase() + r.attendance.status.slice(1) : (r.attendance.checkInTime ? 'Present' : 'Absent'),
      date: moment(r.attendance.date).format('YYYY-MM-DD')
    }));

    res.json({ success: true, data });
  } catch (error) {
    console.error('Today attendance fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching today\'s attendance'
    });
  }
});

// @route   GET /api/attendance/employee/:id
// @desc    Get specific employee's attendance
// @access  Private
router.get('/employee/:id', authenticate, async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;
    const { page = 1, limit = 10, startDate, endDate } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Check if user can access this employee's data
    if (req.user.role === 'employee' && req.user.id !== id) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    let conditions = [eq(attendance.employeeId, id)];

    if (startDate || endDate) {
      if (startDate) {
        conditions.push(gte(attendance.date, moment(startDate).startOf('day').toDate()));
      }
      if (endDate) {
        conditions.push(lte(attendance.date, moment(endDate).endOf('day').toDate()));
      }
    }

    const whereClause = and(...conditions);

    // Get total count
    const totalResult = await db
      .select({ count: sql`count(*)` })
      .from(attendance)
      .where(whereClause);
    const total = Number(totalResult[0]?.count || 0);

    // Get attendance records
    const attendanceRecords = await db
      .select()
      .from(attendance)
      .where(whereClause)
      .orderBy(desc(attendance.date))
      .limit(parseInt(limit))
      .offset(offset);

    res.json({
      success: true,
      data: {
        docs: attendanceRecords,
        totalDocs: total,
        limit: parseInt(limit),
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit)),
        hasNextPage: offset + parseInt(limit) < total,
        hasPrevPage: parseInt(page) > 1,
      }
    });
  } catch (error) {
    console.error('Employee attendance fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching employee attendance'
    });
  }
});

// @route   PUT /api/attendance/:id
// @desc    Update attendance record
// @access  Private (Admin/HR only)
router.put('/:id', authenticate, authorize('admin', 'hr'), [
  body('status').optional().isIn(['present', 'absent', 'late', 'half-day', 'leave']),
  body('notes').optional().trim()
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
    const { status, notes } = req.body;

    const updateData = {
      updatedAt: new Date(),
    };
    if (status) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    const [updatedAttendance] = await db
      .update(attendance)
      .set(updateData)
      .where(eq(attendance.id, id))
      .returning();

    if (!updatedAttendance) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found'
      });
    }

    res.json({
      success: true,
      message: 'Attendance record updated successfully',
      data: { attendance: updatedAttendance }
    });
  } catch (error) {
    console.error('Attendance update error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating attendance'
    });
  }
});

// --- Admin check-in/check-out ---
// @route   POST /api/attendance/admin/checkin
// @desc    Admin check in an employee
// @access  Private (Admin/HR only)
router.post('/admin/checkin', authenticate, authorize('admin', 'hr'), [
  body('employeeId').notEmpty().withMessage('Employee ID is required'),
  body('location').optional().trim(),
  body('notes').optional().trim()
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
    const { employeeId, location, notes } = req.body;

    // Find employee
    const [employee] = await db
      .select()
      .from(users)
      .where(eq(users.id, employeeId))
      .limit(1);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    const today = moment().startOf('day').toDate();
    const todayEnd = moment(today).endOf('day').toDate();

    // Check if employee is on leave today
    const [activeLeave] = await db
      .select()
      .from(leaves)
      .where(
        and(
          eq(leaves.employeeId, employeeId),
          eq(leaves.status, 'approved'),
          lte(leaves.startDate, todayEnd),
          gte(leaves.endDate, today)
        )
      )
      .limit(1);

    if (activeLeave) {
      return res.status(400).json({
        success: false,
        message: `Cannot mark employee as present. Employee is on approved leave from ${moment(activeLeave.startDate).format('YYYY-MM-DD')} to ${moment(activeLeave.endDate).format('YYYY-MM-DD')}`
      });
    }

    // Check if already checked in today
    const [existingAttendance] = await db
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.employeeId, employeeId),
          gte(attendance.date, today),
          lte(attendance.date, todayEnd),
          isNotNull(attendance.checkInTime)
        )
      )
      .limit(1);

    if (existingAttendance) {
      return res.status(400).json({
        success: false,
        message: 'Employee already checked in today'
      });
    }

    const checkInTime = new Date();
    const checkInData = {
      employeeId,
      date: today,
      checkInTime,
      checkInLocation: location || 'Office',
      checkInIpAddress: req.ip || null,
      checkInDeviceInfo: req.get('User-Agent') || null,
      status: 'present',
      notes: notes || null,
    };

    // Check if record exists without check-in
    if (existingAttendance && !existingAttendance.checkInTime) {
      const [updated] = await db
        .update(attendance)
        .set({
          checkInTime,
          checkInLocation: location || 'Office',
          checkInIpAddress: req.ip || null,
          checkInDeviceInfo: req.get('User-Agent') || null,
          status: 'present',
          notes: notes || existingAttendance.notes,
          updatedAt: new Date(),
        })
        .where(eq(attendance.id, existingAttendance.id))
        .returning();

      const [employeeData] = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          employeeId: users.employeeId,
          department: users.department,
          position: users.position,
        })
        .from(users)
        .where(eq(users.id, employeeId))
        .limit(1);

      return res.json({
        success: true,
        message: `Checked in ${employee.name} successfully`,
        data: {
          attendance: { ...updated, employee: employeeData },
          checkInTime,
          location: location || 'Office'
        }
      });
    }

    // Create new record
    const [newAttendance] = await db
      .insert(attendance)
      .values(checkInData)
      .returning();

    const [employeeData] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        employeeId: users.employeeId,
        department: users.department,
        position: users.position,
      })
      .from(users)
      .where(eq(users.id, employeeId))
      .limit(1);

    res.json({
      success: true,
      message: `Checked in ${employee.name} successfully`,
      data: {
        attendance: { ...newAttendance, employee: employeeData },
        checkInTime,
        location: location || 'Office'
      }
    });
  } catch (error) {
    console.error('Admin check-in error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during check-in'
    });
  }
});

// @route   POST /api/attendance/admin/checkout
// @desc    Admin check out an employee
// @access  Private (Admin/HR only)
router.post('/admin/checkout', authenticate, authorize('admin', 'hr'), [
  body('employeeId').notEmpty().withMessage('Employee ID is required'),
  body('location').optional().trim(),
  body('notes').optional().trim()
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
    const { employeeId, location, notes } = req.body;

    // Find employee
    const [employee] = await db
      .select()
      .from(users)
      .where(eq(users.id, employeeId))
      .limit(1);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    const today = moment().startOf('day').toDate();
    const todayEnd = moment(today).endOf('day').toDate();

    // Find today's attendance record
    const [attendanceRecord] = await db
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.employeeId, employeeId),
          gte(attendance.date, today),
          lte(attendance.date, todayEnd)
        )
      )
      .limit(1);

    if (!attendanceRecord) {
      return res.status(400).json({
        success: false,
        message: 'No check-in record found for today'
      });
    }

    if (attendanceRecord.checkOutTime) {
      return res.status(400).json({
        success: false,
        message: 'Employee already checked out today'
      });
    }

    const checkOutTime = new Date();
    const checkInTime = new Date(attendanceRecord.checkInTime);
    const diffInMs = checkOutTime - checkInTime;
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const workingHours = Math.max(0, diffInMinutes);
    const standardHours = 480;
    const overtime = Math.max(0, workingHours - standardHours);

    const [updatedAttendance] = await db
      .update(attendance)
      .set({
        checkOutTime,
        checkOutLocation: location || 'Office',
        checkOutIpAddress: req.ip || null,
        checkOutDeviceInfo: req.get('User-Agent') || null,
        workingHours,
        overtime,
        notes: notes || attendanceRecord.notes,
        updatedAt: new Date(),
      })
      .where(eq(attendance.id, attendanceRecord.id))
      .returning();

    const [employeeData] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        employeeId: users.employeeId,
        department: users.department,
        position: users.position,
      })
      .from(users)
      .where(eq(users.id, employeeId))
      .limit(1);

    res.json({
      success: true,
      message: `Checked out ${employee.name} successfully`,
      data: {
        attendance: { ...updatedAttendance, employee: employeeData },
        checkOutTime,
        workingHours,
        overtime
      }
    });
  } catch (error) {
    console.error('Admin check-out error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error during check-out'
    });
  }
});

// @route   POST /api/attendance/admin/update-status
// @desc    Admin update attendance status by date and employee
// @access  Private (Admin/HR only)
router.post('/admin/update-status', authenticate, authorize('admin', 'hr'), [
  body('employeeId').notEmpty().withMessage('Employee ID is required'),
  body('date').notEmpty().withMessage('Date is required'),
  body('status').isIn(['present', 'absent', 'late', 'half-day', 'leave']).withMessage('Invalid status'),
  body('notes').optional().trim()
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
    const { employeeId, date, status, notes } = req.body;

    // Find employee
    const [employee] = await db
      .select()
      .from(users)
      .where(eq(users.id, employeeId))
      .limit(1);

    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    // Parse and normalize date to start of day
    const targetDate = moment(date).startOf('day').toDate();
    const endOfDay = moment(targetDate).endOf('day').toDate();
    const today = moment().startOf('day').toDate();

    // Only allow editing today's date
    if (targetDate.getTime() < today.getTime()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit past dates. Only today\'s attendance can be modified.'
      });
    }

    // Check if date is in the future
    if (targetDate.getTime() > today.getTime()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot edit future dates.'
      });
    }

    // Check if employee is on leave for the target date (only if marking as present)
    if (status === 'present') {
      const [activeLeave] = await db
        .select()
        .from(leaves)
        .where(
          and(
            eq(leaves.employeeId, employeeId),
            eq(leaves.status, 'approved'),
            lte(leaves.startDate, endOfDay),
            gte(leaves.endDate, targetDate)
          )
        )
        .limit(1);

      if (activeLeave) {
        return res.status(400).json({
          success: false,
          message: `Cannot mark employee as present. Employee is on approved leave from ${moment(activeLeave.startDate).format('YYYY-MM-DD')} to ${moment(activeLeave.endDate).format('YYYY-MM-DD')}`
        });
      }
    }

    // Find or create attendance record for the date
    const [existingAttendance] = await db
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.employeeId, employeeId),
          gte(attendance.date, targetDate),
          lte(attendance.date, endOfDay)
        )
      )
      .limit(1);

    let attendanceRecord;

    if (existingAttendance) {
      // Update existing record
      const updateData = {
        status,
        notes: notes || existingAttendance.notes,
        updatedAt: new Date(),
      };

      // If marking as present and no check-in exists, create a check-in
      if (status === 'present' && !existingAttendance.checkInTime) {
        updateData.checkInTime = new Date();
        updateData.checkInLocation = 'Office';
        updateData.checkInIpAddress = req.ip || null;
        updateData.checkInDeviceInfo = req.get('User-Agent') || null;
      }

      // If marking as absent, clear check-in/check-out
      if (status === 'absent') {
        updateData.checkInTime = null;
        updateData.checkOutTime = null;
        updateData.workingHours = 0;
        updateData.overtime = 0;
      }

      const [updated] = await db
        .update(attendance)
        .set(updateData)
        .where(eq(attendance.id, existingAttendance.id))
        .returning();

      attendanceRecord = updated;
    } else {
      // Create new attendance record
      const attendanceData = {
        employeeId,
        date: targetDate,
        status,
        notes: notes || null,
      };

      // If marking as present, add check-in time
      if (status === 'present') {
        attendanceData.checkInTime = new Date();
        attendanceData.checkInLocation = 'Office';
        attendanceData.checkInIpAddress = req.ip || null;
        attendanceData.checkInDeviceInfo = req.get('User-Agent') || null;
      }

      const [created] = await db
        .insert(attendance)
        .values(attendanceData)
        .returning();

      attendanceRecord = created;
    }

    const [employeeData] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        employeeId: users.employeeId,
        department: users.department,
        position: users.position,
      })
      .from(users)
      .where(eq(users.id, employeeId))
      .limit(1);

    res.json({
      success: true,
      message: `Attendance status updated to ${status} for ${employee.name}`,
      data: {
        attendance: {
          ...attendanceRecord,
          employee: employeeData
        }
      }
    });
  } catch (error) {
    console.error('Update attendance status error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating attendance status'
    });
  }
});

// @route   GET /api/attendance/export/monthly
// @desc    Export monthly attendance to Excel
// @access  Private (Admin/HR only)
router.get('/export/monthly', authenticate, authorize('admin', 'hr'), exportMonthlyExcel);

export default router;