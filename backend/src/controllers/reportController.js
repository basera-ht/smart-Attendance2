import { eq, and, gte, lte, inArray, sql, desc, asc, isNotNull } from 'drizzle-orm';
import moment from 'moment';
import { getDB } from '../config/db.js';
import { attendance, users } from '../db/schema.js';

// Helper function to generate chart data
const generateChartData = (attendanceData, period) => {
  const grouped = {};
  
  attendanceData.forEach(record => {
    let key;
    const date = new Date(record.date);
    
    switch (period) {
      case 'daily':
        key = moment(date).format('YYYY-MM-DD');
        break;
      case 'weekly':
        key = moment(date).format('YYYY-[W]WW');
        break;
      case 'monthly':
        key = moment(date).format('YYYY-MM');
        break;
      case 'yearly':
        key = moment(date).format('YYYY');
        break;
      default:
        key = moment(date).format('YYYY-MM-DD');
    }
    
    if (!grouped[key]) {
      grouped[key] = { 
        statusPresent: 0, 
        statusLate: 0, 
        statusAbsent: 0, 
        statusLeave: 0,
        statusHalfDay: 0,
        early: 0,
        onTime: 0,
        timeLate: 0,
        veryLate: 0,
        checkOuts: 0
      };
    }
    
    // Check status first
    const status = record.status?.toLowerCase();
    if (status === 'present') {
      grouped[key].statusPresent++;
    } else if (status === 'late') {
      grouped[key].statusLate++;
    } else if (status === 'absent') {
      grouped[key].statusAbsent++;
    } else if (status === 'leave') {
      grouped[key].statusLeave++;
    } else if (status === 'half-day' || status === 'halfday') {
      grouped[key].statusHalfDay++;
    }
    
    // Only apply timing-based categorization if NOT half-day
    if (status !== 'half-day' && status !== 'halfday' && record.checkInTime) {
      const checkInTime = new Date(record.checkInTime);
      if (!isNaN(checkInTime.getTime())) {
        const checkInTotalMinutes = checkInTime.getHours() * 60 + checkInTime.getMinutes();
        
        if (checkInTotalMinutes < 600) {
          grouped[key].early++;
        } else if (checkInTotalMinutes >= 600 && checkInTotalMinutes < 660) {
          grouped[key].onTime++;
        } else if (checkInTotalMinutes >= 660 && checkInTotalMinutes < 720) {
          grouped[key].timeLate++;
        } else {
          grouped[key].veryLate++;
        }
      }
    }
    
    if (record.checkOutTime) {
      grouped[key].checkOuts++;
    }
  });
  
  return Object.entries(grouped).map(([date, counts]) => ({
    date,
    present: counts.statusPresent,
    late: counts.statusLate,
    absent: counts.statusAbsent,
    leave: counts.statusLeave,
    halfDay: counts.statusHalfDay,
    early: counts.early,
    onTime: counts.onTime,
    timeLate: counts.timeLate,
    veryLate: counts.veryLate,
    checkOuts: counts.checkOuts
  })).sort((a, b) => a.date.localeCompare(b.date));
};

// Helper function to generate pie chart data
const generatePieData = (attendanceData) => {
  const counts = {
    present: 0,
    late: 0,
    absent: 0,
    leave: 0,
    'half-day': 0
  };
  
  attendanceData.forEach(record => {
    if (counts[record.status] !== undefined) {
      counts[record.status]++;
    }
  });
  
  return Object.entries(counts).map(([name, value]) => ({
    name,
    value
  })).filter(item => item.value > 0);
};

// Helper function to generate detailed report
const generateDetailedReport = (attendanceData) => {
  return attendanceData.map(record => ({
    date: record.date,
    employee: record.employee ? {
      name: record.employee.name,
      email: record.employee.email,
      employeeId: record.employee.employeeId,
      department: record.employee.department,
      position: record.employee.position,
    } : null,
    checkIn: record.checkInTime,
    checkOut: record.checkOutTime,
    status: record.status,
    workingHours: record.workingHours ? (record.workingHours / 60).toFixed(2) : 0,
    overtime: record.overtime ? (record.overtime / 60).toFixed(2) : 0,
  }));
};

export const getDashboardStats = async (req, res) => {
  try {
    const db = getDB();
    const today = moment().startOf('day').toDate();
    const tomorrow = moment(today).add(1, 'day').toDate();
    
    // Get today's attendance
    const todayAttendanceRecords = await db
      .select({
        attendance: attendance,
        employee: {
          id: users.id,
          department: users.department,
        }
      })
      .from(attendance)
      .leftJoin(users, eq(attendance.employeeId, users.id))
      .where(
        and(
          gte(attendance.date, today),
          lte(attendance.date, tomorrow),
          isNotNull(attendance.checkInTime)
        )
      );

    // Get total active employees
    const totalEmployeesResult = await db
      .select({ count: sql`count(*)` })
      .from(users)
      .where(eq(users.isActive, true));
    const totalEmployees = Number(totalEmployeesResult[0]?.count || 0);
    
    // Calculate today's stats
    const presentToday = todayAttendanceRecords.length;
    const lateToday = todayAttendanceRecords.filter(record => {
      const checkInTime = record.attendance.checkInTime ? new Date(record.attendance.checkInTime) : null;
      if (!checkInTime || isNaN(checkInTime.getTime())) return false;
      const totalMinutes = checkInTime.getHours() * 60 + checkInTime.getMinutes();
      return totalMinutes >= 660; // 11:00 AM or later
    }).length;
    const absentToday = totalEmployees - presentToday;

    // Get monthly stats
    const monthStart = moment().startOf('month').toDate();
    const monthEnd = moment().endOf('month').toDate();
    
    const monthlyAttendanceRecords = await db
      .select()
      .from(attendance)
      .where(
        and(
          gte(attendance.date, monthStart),
          lte(attendance.date, monthEnd),
          isNotNull(attendance.checkInTime)
        )
      );

    const totalWorkDays = moment().date(); // Days passed in current month
    const expectedAttendanceDays = totalEmployees * totalWorkDays;
    const actualAttendanceDays = monthlyAttendanceRecords.length;
    
    const attendanceRate = expectedAttendanceDays > 0 
      ? (actualAttendanceDays / expectedAttendanceDays) * 100 
      : 0;

    // Get department-wise stats
    const departmentsResult = await db
      .selectDistinct({ department: users.department })
      .from(users)
      .where(
        and(
          eq(users.isActive, true),
          isNotNull(users.department)
        )
      );
    
    const departments = departmentsResult.map(d => d.department).filter(Boolean);
    
    const departmentStats = await Promise.all(
      departments.map(async (dept) => {
        const deptEmployeesResult = await db
          .select({ count: sql`count(*)` })
          .from(users)
          .where(
            and(
              eq(users.department, dept),
              eq(users.isActive, true)
            )
          );
        const deptEmployees = Number(deptEmployeesResult[0]?.count || 0);
        
        const deptPresent = todayAttendanceRecords.filter(
          a => a.employee?.department === dept
        ).length;
        
        return {
          department: dept,
          total: deptEmployees,
          present: deptPresent,
          attendanceRate: deptEmployees > 0 ? (deptPresent / deptEmployees) * 100 : 0
        };
      })
    );

    res.json({
      success: true,
      data: {
        totalEmployees,
        presentToday,
        lateToday,
        absentToday,
        attendanceRate: Math.round(attendanceRate * 100) / 100,
        departmentStats
      }
    });
  } catch (error) {
    console.error('Dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching dashboard statistics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const getAttendanceReport = async (req, res) => {
  try {
    const db = getDB();
    const { period = 'monthly', startDate, endDate, department } = req.query;
    
    let dateStart, dateEnd;
    const now = moment();
    
    // Set date range based on period
    switch (period) {
      case 'daily':
        dateStart = now.startOf('day').toDate();
        dateEnd = now.endOf('day').toDate();
        break;
      case 'weekly':
        dateStart = now.startOf('week').toDate();
        dateEnd = now.endOf('week').toDate();
        break;
      case 'monthly':
        dateStart = now.startOf('month').toDate();
        dateEnd = now.endOf('month').toDate();
        break;
      case 'yearly':
        dateStart = now.startOf('year').toDate();
        dateEnd = now.endOf('year').toDate();
        break;
      case 'custom':
        if (startDate && endDate) {
          dateStart = moment(startDate).startOf('day').toDate();
          dateEnd = moment(endDate).endOf('day').toDate();
        } else {
          return res.status(400).json({
            success: false,
            message: 'Start date and end date are required for custom period'
          });
        }
        break;
      default:
        return res.status(400).json({
          success: false,
          message: 'Invalid period specified'
        });
    }

    // Build conditions
    let conditions = [
      gte(attendance.date, dateStart),
      lte(attendance.date, dateEnd)
    ];

    // Build employee filter if department is specified
    if (department && department !== 'all') {
      const employeesInDept = await db
        .select({ id: users.id })
        .from(users)
        .where(
          and(
            eq(users.department, department),
            eq(users.isActive, true)
          )
        );
      
      if (employeesInDept.length > 0) {
        conditions.push(inArray(attendance.employeeId, employeesInDept.map(emp => emp.id)));
      } else {
        // No employees in this department, return empty result
        return res.json({
          success: true,
          data: {
            chartData: [],
            pieData: [],
            detailedReport: [],
            summary: {
              totalRecords: 0,
              presentCount: 0,
              absentCount: 0,
              lateCount: 0,
              averageHours: 0
            }
          }
        });
      }
    }

    const whereClause = and(...conditions);

    // Get attendance data with employee details
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
      .orderBy(asc(attendance.date), asc(attendance.checkInTime));

    // Format data for helper functions
    const attendanceData = attendanceRecords.map(record => ({
      ...record.attendance,
      employee: record.employee
    }));

    // Generate analytics data
    const chartData = generateChartData(attendanceData, period);
    const pieData = generatePieData(attendanceData);
    const detailedReport = generateDetailedReport(attendanceData);

    // Calculate summary
    const presentCount = attendanceData.filter(a => a.status === 'present' || a.status === 'late').length;
    const absentCount = attendanceData.filter(a => a.status === 'absent').length;
    const lateCount = attendanceData.filter(a => a.status === 'late').length;
    const totalWorkingHours = attendanceData.reduce((sum, a) => sum + (a.workingHours || 0), 0);
    const averageHours = attendanceData.length > 0 
      ? (totalWorkingHours / attendanceData.length / 60).toFixed(2)
      : 0;

    res.json({
      success: true,
      data: {
        chartData,
        pieData,
        detailedReport,
        summary: {
          totalRecords: attendanceData.length,
          presentCount,
          absentCount,
          lateCount,
          averageHours: parseFloat(averageHours)
        }
      }
    });
  } catch (error) {
    console.error('Attendance report error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating attendance report',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error'
    });
  }
};

export const getAdvancedAnalytics = async (req, res) => {
  try {
    const db = getDB();
    const rawDays = parseInt(req.query.days || '30', 10);
    const days = Number.isFinite(rawDays) ? Math.min(Math.max(rawDays, 7), 90) : 30;
    const windowEnd = moment().endOf('day');
    const windowStart = moment(windowEnd).subtract(days - 1, 'days').startOf('day');

    const [attendanceRecords, activeEmployeesResult] = await Promise.all([
      db
        .select({
          attendance: attendance,
          employee: {
            id: users.id,
            name: users.name,
            department: users.department,
            email: users.email,
            employeeId: users.employeeId,
          },
        })
        .from(attendance)
        .leftJoin(users, eq(attendance.employeeId, users.id))
        .where(
          and(
            gte(attendance.date, windowStart.toDate()),
            lte(attendance.date, windowEnd.toDate())
          )
        )
        .orderBy(asc(attendance.date)),
      db
        .select({ count: sql`count(*)` })
        .from(users)
        .where(eq(users.isActive, true)),
    ]);

    const totalEmployees = Number(activeEmployeesResult[0]?.count || 0);
    const employeeBuckets = new Map();
    const departmentBuckets = new Map();
    const trendBuckets = new Map();

    attendanceRecords.forEach((row) => {
      const record = row.attendance;
      const employee = row.employee;
      const dayKey = moment(record.date).format('YYYY-MM-DD');
      if (!trendBuckets.has(dayKey)) {
        trendBuckets.set(dayKey, { date: dayKey, present: 0, late: 0, absent: 0, leave: 0, halfDay: 0 });
      }
      const status = (record.status || '').toLowerCase();
      const trendItem = trendBuckets.get(dayKey);
      
      // Detect lateness based on check-in time (11:00 AM = 660 minutes)
      const isLateByTime = record.checkInTime && (() => {
        try {
          const checkIn = new Date(record.checkInTime);
          if (isNaN(checkIn.getTime())) return false;
          const checkInMinutes = checkIn.getHours() * 60 + checkIn.getMinutes();
          return checkInMinutes >= 660; // 11:00 AM or later
        } catch {
          return false;
        }
      })();
      
      if (status === 'present' || status === 'late') {
        trendItem.present += 1;
        // Count as late if status is 'late' OR check-in time is after 11:00 AM
        if (status === 'late' || isLateByTime) {
          trendItem.late += 1;
        }
      } else if (status === 'absent') {
        trendItem.absent += 1;
      } else if (status === 'leave') {
        trendItem.leave += 1;
      } else if (status === 'half-day' || status === 'halfday') {
        trendItem.halfDay += 1;
      }

      if (!employee?.id) return;
      if (!employeeBuckets.has(employee.id)) {
        employeeBuckets.set(employee.id, {
          employee,
          records: [],
        });
      }
      employeeBuckets.get(employee.id).records.push(record);
    });

    const employeeStats = [];
    let orgPresent = 0;
    let orgLate = 0;
    let orgRecords = 0;
    let orgAbsences = 0;
    let totalWorkingMinutes = 0;

    employeeBuckets.forEach(({ employee, records }) => {
      records.sort((a, b) => new Date(a.date) - new Date(b.date));
      let present = 0;
      let late = 0;
      let absent = 0;
      let leaveCount = 0;
      let halfDay = 0;
      let currentPresentStreak = 0;
      let longestPresentStreak = 0;
      let currentAbsentStreak = 0;
      let longestAbsentStreak = 0;

      records.forEach((record) => {
        const status = (record.status || '').toLowerCase();
        orgRecords += 1;
        totalWorkingMinutes += record.workingHours || 0;

        // Detect lateness based on check-in time (11:00 AM = 660 minutes)
        const isLateByTime = record.checkInTime && (() => {
          try {
            const checkIn = new Date(record.checkInTime);
            if (isNaN(checkIn.getTime())) return false;
            const checkInMinutes = checkIn.getHours() * 60 + checkIn.getMinutes();
            return checkInMinutes >= 660; // 11:00 AM or later
          } catch {
            return false;
          }
        })();

        if (status === 'present' || status === 'late') {
          present += 1;
          orgPresent += 1;
          // Count as late if status is 'late' OR check-in time is after 11:00 AM
          if (status === 'late' || isLateByTime) {
            late += 1;
            orgLate += 1;
          }
          currentPresentStreak += 1;
          currentAbsentStreak = 0;
        } else if (status === 'absent') {
          absent += 1;
          orgAbsences += 1;
          currentAbsentStreak += 1;
          currentPresentStreak = 0;
        } else if (status === 'leave') {
          leaveCount += 1;
          currentPresentStreak = 0;
          currentAbsentStreak = 0;
        } else if (status === 'half-day' || status === 'halfday') {
          halfDay += 1;
          currentPresentStreak = 0;
          currentAbsentStreak = 0;
        }

        if (currentPresentStreak > longestPresentStreak) {
          longestPresentStreak = currentPresentStreak;
        }
        if (currentAbsentStreak > longestAbsentStreak) {
          longestAbsentStreak = currentAbsentStreak;
        }
      });

      const total = records.length || 1;
      const attendanceRate = present / total;
      // Late rate should be percentage of present days that were late
      const lateRate = present > 0 ? late / present : 0;

      employeeStats.push({
        id: employee.id,
        name: employee.name,
        email: employee.email,
        employeeId: employee.employeeId,
        department: employee.department,
        present,
        late,
        absent,
        leaveCount,
        halfDay,
        totalRecords: total,
        attendanceRate,
        lateRate,
        longestPresentStreak,
        longestAbsentStreak,
      });

      if (employee.department) {
        if (!departmentBuckets.has(employee.department)) {
          departmentBuckets.set(employee.department, { department: employee.department, present: 0, late: 0, total: 0 });
        }
        const deptBucket = departmentBuckets.get(employee.department);
        deptBucket.present += present;
        deptBucket.late += late;
        deptBucket.total += total;
      }
    });

    const departmentInsights = Array.from(departmentBuckets.values()).map((dept) => ({
      department: dept.department,
      attendanceRate: dept.total > 0 ? (dept.present / dept.total) * 100 : 0,
      // Late rate should be percentage of present days that were late
      lateRate: dept.present > 0 ? (dept.late / dept.present) * 100 : 0,
    })).sort((a, b) => b.attendanceRate - a.attendanceRate);

    const topPerformers = employeeStats
      .filter((stat) => stat.totalRecords >= Math.min(days, 5))
      .sort((a, b) => {
        if (b.attendanceRate === a.attendanceRate) {
          return a.lateRate - b.lateRate;
        }
        return b.attendanceRate - a.attendanceRate;
      })
      .slice(0, 5)
      .map((stat) => ({
        id: stat.id,
        name: stat.name,
        employeeId: stat.employeeId,
        department: stat.department,
        attendanceRate: Math.round(stat.attendanceRate * 10000) / 100,
        lateRate: Math.round(stat.lateRate * 10000) / 100,
        longestPresentStreak: stat.longestPresentStreak,
      }));

    const riskEmployees = employeeStats
      .filter((stat) => stat.totalRecords >= Math.min(days, 4))
      .filter((stat) => stat.attendanceRate < 0.75 || stat.longestAbsentStreak >= 3)
      .sort((a, b) => {
        const aScore = (1 - a.attendanceRate) + a.longestAbsentStreak * 0.1;
        const bScore = (1 - b.attendanceRate) + b.longestAbsentStreak * 0.1;
        return bScore - aScore;
      })
      .slice(0, 5)
      .map((stat) => ({
        id: stat.id,
        name: stat.name,
        employeeId: stat.employeeId,
        department: stat.department,
        attendanceRate: Math.round(stat.attendanceRate * 10000) / 100,
        longestAbsentStreak: stat.longestAbsentStreak,
        lateRate: Math.round(stat.lateRate * 10000) / 100,
        riskReason: stat.attendanceRate < 0.75 ? 'Low attendance rate' : 'Consecutive absences',
      }));

    const orgAttendanceRate = orgRecords > 0 ? (orgPresent / orgRecords) * 100 : 0;
    // Late rate should be percentage of present days that were late
    const orgLateRate = orgPresent > 0 ? (orgLate / orgPresent) * 100 : 0;
    const avgWorkingHours = orgRecords > 0 ? (totalWorkingMinutes / orgRecords) / 60 : 0;

    const trendline = Array.from(trendBuckets.values()).sort((a, b) => a.date.localeCompare(b.date));

    res.json({
      success: true,
      data: {
        timeframe: {
          start: windowStart.toISOString(),
          end: windowEnd.toISOString(),
          days,
        },
        organization: {
          attendanceRate: Math.round(orgAttendanceRate * 100) / 100,
          lateRate: Math.round(orgLateRate * 100) / 100,
          totalAbsences: orgAbsences,
          avgWorkingHours: Math.round(avgWorkingHours * 100) / 100,
          activeEmployees: totalEmployees,
        },
        departmentInsights,
        topPerformers,
        riskEmployees,
        trendline,
      },
    });
  } catch (error) {
    console.error('Advanced analytics error:', error);
    res.status(500).json({
      success: false,
      message: 'Error generating advanced analytics',
      error: process.env.NODE_ENV === 'development' ? error.message : 'Internal server error',
    });
  }
};
