import { eq, and, gte, lte, desc, asc, sql, inArray } from 'drizzle-orm';
import moment from 'moment';
import ExcelJS from 'exceljs';
import { getDB } from '../config/db.js';
import { attendance, users, leaves, offices } from '../db/schema.js';
import { getAllowedIpRangesFromEnv, getClientIp, isIpInRanges } from '../utils/ipUtils.js';

export const checkIn = async (req, res) => {
  try {
    const db = getDB();
    const employeeId = req.user.id;
    const today = moment().startOf('day').toDate();
    const clientIp = getClientIp(req);

    if (!clientIp) {
      return res.status(400).json({
        success: false,
        message: 'Unable to determine client IP'
      });
    }

    const activeOffices = await db
      .select()
      .from(offices)
      .where(eq(offices.isActive, true));

    const officeRanges = activeOffices.flatMap((office) => office.allowedIPRanges || []);
    const envRanges = getAllowedIpRangesFromEnv();
    const allowedRanges = [...officeRanges, ...envRanges];
    if (!allowedRanges.length) {
      return res.status(400).json({
        success: false,
        message: 'Office network is not configured (allowed IP ranges missing). Set OFFICE_ALLOWED_IPS or configure office IP ranges.'
      });
    }

    if (!isIpInRanges(clientIp, allowedRanges)) {
      return res.status(403).json({
        success: false,
        message: 'Not on corporate network'
      });
    }
    
    // Check if already checked in today
    const todayStart = moment().startOf('day').toDate();
    const todayEnd = moment().endOf('day').toDate();
    
    const [existingAttendance] = await db
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.employeeId, employeeId),
          gte(attendance.date, todayStart),
          lte(attendance.date, todayEnd)
        )
      )
      .limit(1);

    if (existingAttendance) {
      return res.status(400).json({
        success: false,
        message: 'Already checked in for today'
      });
    }

    // Create attendance record
    const [newAttendance] = await db
      .insert(attendance)
      .values({
        employeeId,
        date: today,
        checkInTime: new Date(),
        checkInIpAddress: clientIp || null,
        checkInDeviceInfo: req.get('User-Agent') || null,
        status: 'present',
      })
      .returning();

    // Get employee details
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
      .where(eq(users.id, employeeId))
      .limit(1);

    res.status(201).json({
      success: true,
      message: 'Check-in successful',
      data: {
        ...newAttendance,
        employee
      }
    });
  } catch (error) {
    console.error('Check-in error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during check-in',
      error: error.message
    });
  }
};

export const checkOut = async (req, res) => {
  try {
    const db = getDB();
    const employeeId = req.user.id;
    const today = moment().startOf('day').toDate();
    
    // Find today's attendance record
    const todayStart = moment().startOf('day').toDate();
    const todayEnd = moment().endOf('day').toDate();
    
    const [attendanceRecord] = await db
      .select()
      .from(attendance)
      .where(
        and(
          eq(attendance.employeeId, employeeId),
          gte(attendance.date, todayStart),
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
        message: 'Already checked out for today'
      });
    }

    const checkOutTime = new Date();
    const checkInTime = new Date(attendanceRecord.checkInTime);
    const diffInMs = checkOutTime - checkInTime;
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const workingHours = Math.max(0, diffInMinutes);
    const standardHours = 480; // 8 hours in minutes
    const overtime = Math.max(0, workingHours - standardHours);

    // Update check-out time
    const [updatedAttendance] = await db
      .update(attendance)
      .set({
        checkOutTime,
        checkOutIpAddress: req.ip || null,
        checkOutDeviceInfo: req.get('User-Agent') || null,
        workingHours,
        overtime,
      })
      .where(eq(attendance.id, attendanceRecord.id))
      .returning();

    // Get employee details
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
      .where(eq(users.id, employeeId))
      .limit(1);

    res.json({
      success: true,
      message: 'Check-out successful',
      data: {
        ...updatedAttendance,
        employee
      }
    });
  } catch (error) {
    console.error('Check-out error:', error);
    res.status(500).json({
      success: false,
      message: 'Error during check-out',
      error: error.message
    });
  }
};

export const getAttendance = async (req, res) => {
  try {
    const db = getDB();
    const { page = 1, limit = 20, employee, startDate, endDate, department } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Build filter conditions
    let conditions = [];
    
    if (employee) {
      conditions.push(eq(attendance.employeeId, employee));
    }
    
    if (startDate || endDate) {
      if (startDate) {
        conditions.push(gte(attendance.date, moment(startDate).startOf('day').toDate()));
      }
      if (endDate) {
        conditions.push(lte(attendance.date, moment(endDate).endOf('day').toDate()));
      }
    }

    // If department filter is provided, we need to join with users
    let employeeIds = null;
    if (department) {
      const deptEmployees = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.department, department));
      employeeIds = deptEmployees.map(emp => emp.id);
      if (employeeIds.length > 0) {
        conditions.push(inArray(attendance.employeeId, employeeIds));
      } else {
        // No employees in this department, return empty result
        return res.json({
          success: true,
          data: [],
          pagination: {
            current: parseInt(page),
            pages: 0,
            total: 0
          }
        });
      }
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
      .orderBy(desc(attendance.date), desc(attendance.checkInTime))
      .limit(parseInt(limit))
      .offset(offset);

    // Format response
    const formattedData = attendanceRecords.map(record => ({
      ...record.attendance,
      employee: record.employee
    }));

    res.json({
      success: true,
      data: formattedData,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total
      }
    });
  } catch (error) {
    console.error('Get attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching attendance records',
      error: error.message
    });
  }
};

export const getEmployeeAttendance = async (req, res) => {
  try {
    const db = getDB();
    const employeeId = req.params.id || req.user.id;
    const { page = 1, limit = 30, startDate, endDate } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Build filter conditions
    let conditions = [eq(attendance.employeeId, employeeId)];
    
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
      data: formattedData,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total
      }
    });
  } catch (error) {
    console.error('Get employee attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching employee attendance',
      error: error.message
    });
  }
};

export const updateAttendance = async (req, res) => {
  try {
    const db = getDB();
    const { checkInTime, checkOutTime, status, notes } = req.body;
    
    const updateData = {};
    if (checkInTime) updateData.checkInTime = new Date(checkInTime);
    if (checkOutTime) updateData.checkOutTime = new Date(checkOutTime);
    if (status) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;

    // Calculate working hours if both check-in and check-out are provided
    if (checkInTime && checkOutTime) {
      const checkIn = new Date(checkInTime);
      const checkOut = new Date(checkOutTime);
      const diffInMs = checkOut - checkIn;
      const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
      updateData.workingHours = Math.max(0, diffInMinutes);
      const standardHours = 480;
      updateData.overtime = Math.max(0, diffInMinutes - standardHours);
    }

    const [updatedAttendance] = await db
      .update(attendance)
      .set({
        ...updateData,
        updatedAt: new Date(),
      })
      .where(eq(attendance.id, req.params.id))
      .returning();

    if (!updatedAttendance) {
      return res.status(404).json({
        success: false,
        message: 'Attendance record not found'
      });
    }

    // Get employee details
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
      .where(eq(users.id, updatedAttendance.employeeId))
      .limit(1);

    res.json({
      success: true,
      message: 'Attendance record updated successfully',
      data: {
        ...updatedAttendance,
        employee
      }
    });
  } catch (error) {
    console.error('Update attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating attendance record',
      error: error.message
    });
  }
};

export const getTodayAttendance = async (req, res) => {
  try {
    const db = getDB();
    const today = moment().startOf('day').toDate();
    const tomorrow = moment(today).add(1, 'day').toDate();
    
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
      .where(
        and(
          gte(attendance.date, today),
          lte(attendance.date, tomorrow)
        )
      )
      .orderBy(attendance.checkInTime);

    // Format response
    const formattedData = attendanceRecords.map(record => ({
      ...record.attendance,
      employee: record.employee
    }));

    res.json({
      success: true,
      data: formattedData
    });
  } catch (error) {
    console.error('Get today attendance error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching today\'s attendance',
      error: error.message
    });
  }
};

// Helper function to format date as YYYY-MM-DD
const formatDateForComparison = (date) => {
  if (!date) return null;
  const d = moment(date);
  return d.format('YYYY-MM-DD');
};

// Helper function to check if date is a holiday (simplified - you may want to import from a holidays utility)
const isHoliday = (dateStr) => {
  // This is a simplified version - you may want to import from a holidays utility file
  // For now, we'll check weekends
  const date = moment(dateStr);
  const dayOfWeek = date.day();
  return dayOfWeek === 0 || dayOfWeek === 6; // Sunday or Saturday
};

// Helper function to get leave code based on leave type and isPaid
const getLeaveCode = (leaveType, isPaid) => {
  if (isPaid === false) {
    return 'UL'; // Unpaid Leave
  }
  
  switch (leaveType) {
    case 'vacation':
      return 'PL'; // Paid Leave
    case 'sick':
      return 'ML'; // Medical Leave
    case 'emergency':
      return 'E'; // Emergency
    case 'maternity':
      return 'ML'; // Maternity Leave
    case 'paternity':
      return 'PL'; // Paternity Leave
    case 'bereavement':
      return 'BL'; // Bereavement Leave
    default:
      return 'PL'; // Default to Paid Leave
  }
};

// Helper function to get attendance status code
const getStatusCode = (status) => {
  if (!status) return null;
  
  switch (status.toLowerCase()) {
    case 'present':
      return 'P';
    case 'absent':
      return 'A';
    case 'half-day':
      return 'HD';
    case 'leave':
      return 'UL';
    default:
      return status.toUpperCase().substring(0, 2);
  }
};

export const exportMonthlyExcel = async (req, res) => {
  try {
    const db = getDB();
    const { year, month } = req.query;
    
    if (!year || !month) {
      return res.status(400).json({
        success: false,
        message: 'Year and month are required'
      });
    }

    const yearNum = parseInt(year);
    const monthNum = parseInt(month); // 0-11 (JavaScript month format)
    
    // Validate month (0-11)
    if (monthNum < 0 || monthNum > 11) {
      return res.status(400).json({
        success: false,
        message: 'Invalid month. Must be between 0-11'
      });
    }

    // Calculate date range for the month
    const startDate = moment([yearNum, monthNum, 1]).startOf('month').toDate();
    const endDate = moment([yearNum, monthNum, 1]).endOf('month').toDate();
    const daysInMonth = moment([yearNum, monthNum, 1]).daysInMonth();

    // Get all active employees
    const allEmployees = await db
      .select({
        id: users.id,
        name: users.name,
        employeeId: users.employeeId,
        department: users.department,
        position: users.position,
      })
      .from(users)
      .where(eq(users.isActive, true))
      .orderBy(asc(users.name));

    // Get all attendance records for the month
    const attendanceRecords = await db
      .select({
        attendance: attendance,
        employee: {
          id: users.id,
        }
      })
      .from(attendance)
      .leftJoin(users, eq(attendance.employeeId, users.id))
      .where(
        and(
          gte(attendance.date, startDate),
          lte(attendance.date, endDate)
        )
      );

    // Get all leaves for the month
    const leaveRecords = await db
      .select({
        leave: leaves,
        employee: {
          id: users.id,
        }
      })
      .from(leaves)
      .leftJoin(users, eq(leaves.employeeId, users.id))
      .where(
        and(
          gte(leaves.startDate, startDate),
          lte(leaves.endDate, endDate),
          eq(leaves.status, 'approved') // Only approved leaves
        )
      );

    // Organize attendance data by employee and date
    const attendanceMap = {};
    attendanceRecords.forEach(record => {
      const empId = record.employee?.id || record.attendance.employeeId;
      const dateStr = formatDateForComparison(record.attendance.date);
      if (!attendanceMap[empId]) {
        attendanceMap[empId] = {};
      }
      attendanceMap[empId][dateStr] = record.attendance;
    });

    // Organize leave data by employee and date
    const leaveMap = {};
    leaveRecords.forEach(record => {
      const empId = record.employee?.id || record.leave.employeeId;
      const start = moment(record.leave.startDate);
      const end = moment(record.leave.endDate);
      
      if (!leaveMap[empId]) {
        leaveMap[empId] = {};
      }
      
      // Mark all days in leave range
      const current = moment(start);
      while (current.isSameOrBefore(end)) {
        const dateStr = formatDateForComparison(current.toDate());
        if (dateStr) {
          leaveMap[empId][dateStr] = {
            code: getLeaveCode(record.leave.leaveType, record.leave.isPaid),
            leave: record.leave
          };
        }
        current.add(1, 'day');
      }
    });

    // Create a new workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('Monthly Attendance');

    // Generate all dates in the month
    const monthDates = [];
    for (let day = 1; day <= daysInMonth; day++) {
      const date = moment([yearNum, monthNum, day]);
      const dayName = date.format('ddd');
      monthDates.push({
        day,
        dayName,
        date: date.toDate(),
        dateStr: formatDateForComparison(date.toDate())
      });
    }

    // Create header row
    const headerRow = ['Employee'];
    monthDates.forEach(({ day, dayName }) => {
      headerRow.push(`${dayName}\n${day}`);
    });
    headerRow.push('Total');

    worksheet.addRow(headerRow);

    // Style header row
    const headerRowObj = worksheet.getRow(1);
    headerRowObj.font = { bold: true };
    headerRowObj.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FFE0E0E0' }
    };
    headerRowObj.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    headerRowObj.height = 40;

    // Style header cells for holidays/weekends
    monthDates.forEach(({ dateStr }, index) => {
      const colIndex = index + 2; // +2 because first column is Employee
      const cell = worksheet.getCell(1, colIndex);
      if (isHoliday(dateStr)) {
        cell.fill = {
          type: 'pattern',
          pattern: 'solid',
          fgColor: { argb: 'FFFFE699' } // Yellow for holidays/weekends
        };
      }
    });

    // Add data rows for each employee
    allEmployees.forEach(employee => {
      const row = [employee.name || `${employee.employeeId || employee.id}`];
      let totalPresent = 0;
      let totalHalfDay = 0;
      let totalLeave = 0;

      monthDates.forEach(({ dateStr }) => {
        let statusCode = '';
        
        // Check if it's a holiday first
        if (isHoliday(dateStr)) {
          statusCode = 'H';
        }
        // Check leave (leaves override attendance)
        else if (leaveMap[employee.id] && leaveMap[employee.id][dateStr]) {
          statusCode = leaveMap[employee.id][dateStr].code;
          if (statusCode === 'PL' || statusCode === 'ML' || statusCode === 'BL' || statusCode === 'E') {
            totalLeave++;
          } else if (statusCode === 'UL') {
            totalLeave++;
          }
        }
        // Check attendance
        else if (attendanceMap[employee.id] && attendanceMap[employee.id][dateStr]) {
          const att = attendanceMap[employee.id][dateStr];
          statusCode = getStatusCode(att.status);
          if (statusCode === 'P') {
            totalPresent++;
          } else if (statusCode === 'HD') {
            totalHalfDay++;
          } else if (statusCode === 'A') {
            // Absent
          }
        }
        
        row.push(statusCode);
      });

      // Add total column
      row.push(`P:${totalPresent} HD:${totalHalfDay} L:${totalLeave}`);

      const dataRow = worksheet.addRow(row);

      // Style the row
      dataRow.alignment = { horizontal: 'center', vertical: 'middle' };
      
      // Style cells based on status
      monthDates.forEach(({ dateStr }, index) => {
        const colIndex = index + 2;
        const cell = dataRow.getCell(colIndex);
        const statusCode = row[colIndex - 1];
        
        if (statusCode === 'P') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFC6EFCE' } }; // Green
        } else if (statusCode === 'HD') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE1BEE7' } }; // Purple
        } else if (statusCode === 'A') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFC7CE' } }; // Red
        } else if (statusCode === 'H') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFE699' } }; // Yellow
        } else if (['PL', 'UL', 'ML', 'BL', 'E'].includes(statusCode)) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFF9999' } }; // Light Red
        }
      });

      // Style employee name column
      dataRow.getCell(1).alignment = { horizontal: 'left' };
      dataRow.getCell(1).font = { bold: true };
      
      // Style total column
      const totalCell = dataRow.getCell(monthDates.length + 2);
      totalCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFB4C6E7' } }; // Light Blue
      totalCell.font = { bold: true };
    });

    // Set column widths
    worksheet.getColumn(1).width = 25; // Employee name
    for (let i = 2; i <= monthDates.length + 1; i++) {
      worksheet.getColumn(i).width = 8; // Day columns
    }
    worksheet.getColumn(monthDates.length + 2).width = 20; // Total column

    // Set response headers
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'];
    const filename = `Attendance_${monthNames[monthNum]}_${yearNum}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    // Write to response
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Excel export error:', error);
    res.status(500).json({
      success: false,
      message: 'Error exporting attendance to Excel',
      error: error.message
    });
  }
};
