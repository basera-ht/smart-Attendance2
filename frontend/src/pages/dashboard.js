'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/router'
import { useAuth } from '../hooks/useAuth'
import { analyticsAPI, attendanceAPI, tasksAPI, leavesAPI, employeesAPI } from '../services/api'
import { AttendanceBarChart, StatusPieChart } from '../components/AnalyticsChart'
import DashboardLayout from '../components/DashboardLayout'
import InlineAlert from '../components/InlineAlert'
import { CheckCircle, Clock, AlertCircle, Plus, Edit, Trash2, Calendar, X, Users } from 'lucide-react'
import { getDeviceId } from '../utils/deviceUtils'

export default function Dashboard() {
  const router = useRouter()
  const { user, hasRole, isAuthenticated } = useAuth()
  const [stats, setStats] = useState({})
  const [chartData, setChartData] = useState([])
  const [pieData, setPieData] = useState([])
  const [loading, setLoading] = useState(true)
  const [hasMounted, setHasMounted] = useState(false)
  const [checking, setChecking] = useState({ checkIn: false, checkOut: false })

  // Employee-specific data
  const [todayAttendance, setTodayAttendance] = useState(null)
  const [tasks, setTasks] = useState([])
  const [tasksLoading, setTasksLoading] = useState(false)
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [newTask, setNewTask] = useState({ title: '', description: '', priority: 'medium', dueDate: '' })
  const [editingTask, setEditingTask] = useState(null)
  const [upcomingLeaves, setUpcomingLeaves] = useState([])
  const [leaveStats, setLeaveStats] = useState(null)

  // Modal state for employee lists
  const [showEmployeeModal, setShowEmployeeModal] = useState(false)
  const [modalType, setModalType] = useState(null) // 'total', 'present', 'late', 'absent'
  const [employeeList, setEmployeeList] = useState([])
  const [loadingEmployees, setLoadingEmployees] = useState(false)
  const [pageAlert, setPageAlert] = useState(null)

  const isEmployee = hasRole('employee')

  useEffect(() => {
    if (!pageAlert) return
    const timer = setTimeout(() => setPageAlert(null), 6000)
    return () => clearTimeout(timer)
  }, [pageAlert])

  const showPageAlert = (message, type = 'info') => {
    setPageAlert({ message, type })
  }

  // Helper function to retry API calls on 429 errors
  const retryApiCall = async (apiCall, retryCount = 0, maxRetries = 2) => {
    try {
      return await apiCall()
    } catch (error) {
      if (error.response?.status === 429 && retryCount < maxRetries) {
        const retryAfter = error.response.headers['retry-after']
        const waitTime = retryAfter
          ? parseInt(retryAfter) * 1000
          : Math.min(2000 * Math.pow(2, retryCount), 10000) // Max 10 seconds

        console.log(`Rate limited. Retrying after ${waitTime}ms (attempt ${retryCount + 1}/${maxRetries})`)

        await new Promise(resolve => setTimeout(resolve, waitTime))
        return retryApiCall(apiCall, retryCount + 1, maxRetries)
      }
      throw error
    }
  }

  useEffect(() => {
    setHasMounted(true)

    const fetchDashboardData = async () => {
      try {
        if (!isAuthenticated || !user) {
          setLoading(false)
          return
        }

        if (isEmployee) {
          // Fetch employee-specific data with retry logic
          const [attendanceResponse, tasksResponse, leavesResponse, statsResponse] = await Promise.all([
            retryApiCall(() => attendanceAPI.getTodayAttendance()),
            retryApiCall(() => tasksAPI.getTasks()),
            retryApiCall(() => leavesAPI.getLeaves({ status: 'approved', limit: 5 })),
            retryApiCall(() => leavesAPI.getLeaveStats())
          ])

          if (attendanceResponse.data?.success) {
            const attendanceData = attendanceResponse.data.data
            // Employee gets single object, admin gets array
            if (attendanceData && !Array.isArray(attendanceData)) {
              setTodayAttendance(attendanceData)
            } else if (Array.isArray(attendanceData) && attendanceData.length > 0) {
              setTodayAttendance(attendanceData[0])
            }
          }

          if (tasksResponse.data?.success) {
            setTasks(tasksResponse.data.data || [])
          }

          if (leavesResponse.data?.success) {
            const leavesData = leavesResponse.data.data.docs || leavesResponse.data.data || []
            setUpcomingLeaves(leavesData.filter(leave => {
              const endDate = new Date(leave.endDate)
              return endDate >= new Date().setHours(0, 0, 0, 0)
            }))
          }

          if (statsResponse.data?.success) {
            setLeaveStats(statsResponse.data.data)
          }
        } else {
          // Admin/HR dashboard data with retry logic
          const today = new Date()
          const sevenDaysAgo = new Date(today)
          sevenDaysAgo.setDate(today.getDate() - 6)

          const reportParams = {
            period: 'custom',
            startDate: sevenDaysAgo.toISOString().split('T')[0],
            endDate: today.toISOString().split('T')[0]
          }

          const [statsResponse, reportResponse] = await Promise.all([
            retryApiCall(() => analyticsAPI.getDashboardStats()),
            retryApiCall(() => analyticsAPI.getAttendanceReport(reportParams))
          ])

          let departmentPieData = []

          if (statsResponse?.data && statsResponse.data.success) {
            setStats(statsResponse.data.data)

            const deptStats = statsResponse.data.data?.departmentStats
            if (Array.isArray(deptStats)) {
              departmentPieData = deptStats
                .filter(dept => typeof dept.present === 'number' && dept.present >= 0)
                .map(dept => ({
                  name: dept.department || dept._id || 'Unknown',
                  value: Number(dept.present) || 0
                }))
            }
          } else {
            console.error('Failed to fetch dashboard stats:', statsResponse?.data)
            setStats({
              totalEmployees: 0,
              presentToday: 0,
              lateToday: 0,
              absentToday: 0
            })
          }

          // Get chart data from attendance report (daily)
          if (reportResponse?.data && reportResponse.data.success && reportResponse.data.data) {
            const reportData = reportResponse.data.data

            // Process chart data
            if (reportData.chartData && Array.isArray(reportData.chartData)) {
              const chartData = reportData.chartData.map(day => {
                try {
                  // Handle date format YYYY-MM-DD
                  if (!day.date) return null
                  let date
                  if (typeof day.date === 'string' && day.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    date = new Date(day.date + 'T00:00:00')
                  } else {
                    date = new Date(day.date)
                  }

                  if (isNaN(date.getTime())) {
                    console.warn('Invalid date:', day.date)
                    return null
                  }

                  return {
                    name: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
                    early: Number(day.early) || 0,
                    onTime: Number(day.onTime) || 0,
                    late: Number(day.timeLate ?? day.late) || 0,
                    veryLate: Number(day.veryLate) || 0,
                    halfDay: Number(day.halfDay ?? day.statusHalfDay) || 0,
                    checkOuts: Number(day.checkOuts) || 0,
                    present: Number(day.present) || 0,
                    absent: Number(day.absent) || 0
                  }
                } catch (error) {
                  console.error('Error parsing date:', day, error)
                  return null
                }
              }).filter(day => day !== null)

              console.log('Processed chart data:', chartData)
              setChartData(chartData)
            } else {
              setChartData([])
            }

            // Process pie chart data (prefer department stats)
            if (departmentPieData.length > 0) {
              setPieData(departmentPieData)
            } else if (reportData.pieData && Array.isArray(reportData.pieData)) {
              setPieData(reportData.pieData)
            } else {
              setPieData([])
            }
          } else {
            // Fallback: try to use weeklyAttendance from stats if available (converted to daily if possible)
            const weeklyData = statsResponse?.data?.data?.weeklyAttendance || []
            if (weeklyData.length > 0) {
              const chartData = weeklyData.map(day => {
                try {
                  let date
                  if (typeof day._id === 'string' && day._id.match(/^\d{4}-\d{2}-\d{2}$/)) {
                    date = new Date(day._id + 'T00:00:00')
                  } else {
                    date = new Date(day._id)
                  }

                  if (isNaN(date.getTime())) {
                    return null
                  }

                  return {
                    name: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
                    early: Number(day.present) || 0,
                    onTime: 0,
                    late: Number(day.late) || 0,
                    veryLate: 0,
                    halfDay: Number(day.halfDay ?? day.statusHalfDay) || 0,
                    checkOuts: Number(day.present) || 0,
                    present: Number(day.present) || 0,
                    absent: Number(day.absent) || 0
                  }
                } catch (error) {
                  return null
                }
              }).filter(day => day !== null)
              setChartData(chartData)
            } else {
              setChartData([])
            }

            // Fallback pie data from department stats if available
            if (departmentPieData.length > 0) {
              setPieData(departmentPieData)
            } else {
              setPieData([])
            }
          }
        }
      } catch (error) {
        console.error('Error fetching dashboard data:', error)
        console.error('Error details:', {
          message: error.message,
          response: error.response?.data,
          status: error.response?.status
        })

        // Handle 429 errors gracefully
        if (error.response?.status === 429) {
          console.warn('Rate limit exceeded while fetching dashboard data. Using cached or empty data.')
          // Don't show error to user, just use empty/default data
        } else if (error.response?.status === 401) {
          console.error('Unauthorized - user may need to login again')
        } else if (error.response?.status >= 500) {
          console.error('Server error - backend may be down')
        } else {
          console.error('Failed to fetch dashboard data:', error.message)
        }

        setStats({
          totalEmployees: 0,
          presentToday: 0,
          lateToday: 0,
          absentToday: 0
        })
        setChartData([])
        setPieData([])
      } finally {
        setLoading(false)
      }
    }

    fetchDashboardData()
  }, [isAuthenticated, user, isEmployee])

  const handleCheckIn = async () => {
    try {
      setChecking(prev => ({ ...prev, checkIn: true }))
      const response = await attendanceAPI.checkIn({
        location: 'Office',
        notes: 'Checked in via dashboard',
        deviceId: getDeviceId()
      })

      if (response.data && response.data.success) {
        showPageAlert('Check-in successful!', 'success')
        // Refresh attendance data with retry logic
        const attendanceResponse = await retryApiCall(() => attendanceAPI.getTodayAttendance())
        if (attendanceResponse.data?.success) {
          const attendanceData = attendanceResponse.data.data
          if (attendanceData && !Array.isArray(attendanceData)) {
            setTodayAttendance(attendanceData)
          } else if (Array.isArray(attendanceData) && attendanceData.length > 0) {
            setTodayAttendance(attendanceData[0])
          }
        }
      } else {
        showPageAlert('Check-in failed. Please try again.', 'error')
      }
    } catch (err) {
      console.error('Check-in error:', err)
      const errorMessage = err.response?.data?.message || 'Check-in failed. Please try again.'
      showPageAlert(errorMessage, 'error')
    } finally {
      setChecking(prev => ({ ...prev, checkIn: false }))
    }
  }

  const handleCheckOut = async () => {
    try {
      setChecking(prev => ({ ...prev, checkOut: true }))
      const response = await attendanceAPI.checkOut({
        location: 'Office',
        notes: 'Checked out via dashboard',
        deviceId: getDeviceId()
      })

      if (response.data && response.data.success) {
        showPageAlert('Check-out successful!', 'success')
        // Refresh attendance data with retry logic
        const attendanceResponse = await retryApiCall(() => attendanceAPI.getTodayAttendance())
        if (attendanceResponse.data?.success) {
          const attendanceData = attendanceResponse.data.data
          if (attendanceData && !Array.isArray(attendanceData)) {
            setTodayAttendance(attendanceData)
          } else if (Array.isArray(attendanceData) && attendanceData.length > 0) {
            setTodayAttendance(attendanceData[0])
          }
        }
      } else {
        showPageAlert('Check-out failed. Please try again.', 'error')
      }
    } catch (err) {
      console.error('Check-out error:', err)
      const errorMessage = err.response?.data?.message || 'Check-out failed. Please try again.'
      showPageAlert(errorMessage, 'error')
    } finally {
      setChecking(prev => ({ ...prev, checkOut: false }))
    }
  }

  const handleCreateTask = async (e) => {
    e.preventDefault()
    try {
      setTasksLoading(true)
      const response = await tasksAPI.createTask(newTask)
      if (response.data?.success) {
        setTasks([response.data.data, ...tasks])
        setNewTask({ title: '', description: '', priority: 'medium', dueDate: '' })
        setShowTaskForm(false)
      }
    } catch (err) {
      console.error('Create task error:', err)
      showPageAlert('Failed to create task', 'error')
    } finally {
      setTasksLoading(false)
    }
  }

  const handleUpdateTask = async (taskId, updates) => {
    try {
      setTasksLoading(true)
      const response = await tasksAPI.updateTask(taskId, updates)
      if (response.data?.success) {
        setTasks(tasks.map(t => t._id === taskId ? response.data.data : t))
        setEditingTask(null)
      }
    } catch (err) {
      console.error('Update task error:', err)
      showPageAlert('Failed to update task', 'error')
    } finally {
      setTasksLoading(false)
    }
  }

  const handleDeleteTask = async (taskId) => {
    if (!confirm('Are you sure you want to delete this task?')) return

    try {
      setTasksLoading(true)
      const response = await tasksAPI.deleteTask(taskId)
      if (response.data?.success) {
        setTasks(tasks.filter(t => t._id !== taskId))
      }
    } catch (err) {
      console.error('Delete task error:', err)
      showPageAlert('Failed to delete task', 'error')
    } finally {
      setTasksLoading(false)
    }
  }

  const toggleTaskStatus = async (task) => {
    let newStatus = task.status
    if (task.status === 'pending') {
      newStatus = 'in-progress'
    } else if (task.status === 'in-progress') {
      newStatus = 'completed'
    } else if (task.status === 'completed') {
      newStatus = 'pending'
    }
    await handleUpdateTask(task._id, { status: newStatus })
  }

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-800 border-red-200'
      case 'high': return 'bg-orange-100 text-orange-800 border-orange-200'
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'low': return 'bg-blue-100 text-blue-800 border-blue-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800'
      case 'in-progress': return 'bg-blue-100 text-blue-800'
      case 'pending': return 'bg-gray-100 text-gray-800'
      case 'cancelled': return 'bg-red-100 text-red-800'
      default: return 'bg-gray-100 text-gray-800'
    }
  }

  const formatTime = (timeString) => {
    if (!timeString) return '-'
    try {
      const date = new Date(timeString)
      if (isNaN(date.getTime())) return '-'
      return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
    } catch {
      return '-'
    }
  }

  const formatWorkHours = (minutes) => {
    if (!minutes) return '0h 0m'
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}h ${mins}m`
  }

  // Fetch employee list based on type
  const handleStatCardClick = async (type) => {
    setModalType(type)
    setShowEmployeeModal(true)
    setLoadingEmployees(true)
    setEmployeeList([])

    try {
      if (type === 'total') {
        // Get all employees
        const response = await employeesAPI.getEmployees()
        if (response?.data?.success) {
          const employeesData = response.data.data
          // Handle both array and paginated response
          const employees = Array.isArray(employeesData)
            ? employeesData
            : (employeesData?.docs || [])
          setEmployeeList(employees)
        }
      } else {
        // Get today's attendance records using the today endpoint with retry logic
        const todayResponse = await retryApiCall(() => attendanceAPI.getTodayAttendance())

        if (todayResponse?.data?.success) {
          // Handle both array and single object responses
          const todayData = todayResponse.data.data
          const attendanceRecords = Array.isArray(todayData) ? todayData : (todayData ? [todayData] : [])

          // If no records, try getting from attendance endpoint with date filter
          let allRecords = attendanceRecords

          if (attendanceRecords.length === 0 || !attendanceRecords[0]?.employee) {
            // Fallback: Get from attendance endpoint with retry logic
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            const response = await retryApiCall(() => attendanceAPI.getAttendance({
              startDate: today.toISOString().split('T')[0],
              endDate: today.toISOString().split('T')[0],
              limit: 1000
            }))

            if (response?.data?.success) {
              const attendanceData = response.data.data || {}
              allRecords = Array.isArray(attendanceData)
                ? attendanceData
                : (attendanceData.docs || [])
            }
          }

          let filteredEmployees = []
          const today = new Date()
          today.setHours(0, 0, 0, 0)

          if (type === 'present') {
            // Employees who checked in today (have checkIn.time or checkIn string)
            filteredEmployees = allRecords
              .filter(record => {
                if (!record) return false
                // Handle different record structures
                // checkIn can be: { time: Date } or a string like "09:00 AM" or null
                // Also check checkInTime which is the Date object
                const checkInTime = record.checkInTime || record.checkIn?.time || record.checkIn
                if (!checkInTime) return false

                // Ensure employee data exists (either employee object or employeeName string)
                const hasEmployee = record.employee || record.employeeName
                return hasEmployee != null
              })
              .map(record => {
                // Handle both populated employee object and simplified employeeName structure
                const employee = record.employee || {}
                const checkInTime = record.checkInTime || record.checkIn?.time || record.checkIn

                // If we have employee object, use it; otherwise use simplified structure
                if (employee && employee._id) {
                  // Full employee object from attendance endpoint
                  return {
                    _id: employee._id,
                    name: employee.name || 'Unknown',
                    email: employee.email || '',
                    employeeId: employee.employeeId || '',
                    department: employee.department || '',
                    position: employee.position || '',
                    checkInTime: checkInTime,
                    status: record.status || 'present'
                  }
                } else {
                  // Simplified structure from /today endpoint
                  // Use employeeId if available, otherwise use record.id
                  return {
                    _id: record.employeeId || record.id || record._id || null,
                    name: record.employeeName || 'Unknown',
                    email: record.email || '',
                    employeeId: record.employeeId || '',
                    department: record.department || '',
                    position: record.position || '',
                    checkInTime: checkInTime,
                    status: record.status || 'present'
                  }
                }
              })
              .filter(emp => emp && emp.name && emp.name !== 'Unknown')
          } else if (type === 'late') {
            // Employees who checked in after 11 AM (new threshold)
            const lateThreshold = new Date(today)
            lateThreshold.setHours(11, 0, 0, 0)

            filteredEmployees = allRecords
              .filter(record => {
                if (!record) return false
                const checkInTime = record.checkIn?.time || record.checkIn
                if (!checkInTime) return false

                try {
                  // Handle both Date objects and time strings
                  let checkInDate
                  if (typeof checkInTime === 'string') {
                    // If it's a time string like "09:45 AM", parse it
                    // Try to parse as ISO string first, then as time string
                    checkInDate = new Date(checkInTime)
                    if (isNaN(checkInDate.getTime())) {
                      // If parsing failed, try to construct date from time string
                      const timeMatch = checkInTime.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i)
                      if (timeMatch) {
                        let hours = parseInt(timeMatch[1])
                        const minutes = parseInt(timeMatch[2])
                        const ampm = timeMatch[3].toUpperCase()
                        if (ampm === 'PM' && hours !== 12) hours += 12
                        if (ampm === 'AM' && hours === 12) hours = 0
                        checkInDate = new Date(today)
                        checkInDate.setHours(hours, minutes, 0, 0)
                      } else {
                        return false
                      }
                    }
                  } else {
                    checkInDate = new Date(checkInTime)
                  }

                  if (isNaN(checkInDate.getTime())) return false

                  // Check if check-in time is after 11 AM
                  return checkInDate > lateThreshold
                } catch {
                  return false
                }
              })
              .map(record => {
                const employee = record.employee || {}
                const checkInTime = record.checkIn?.time || record.checkIn

                if (employee && employee._id) {
                  return {
                    _id: employee._id,
                    name: employee.name || 'Unknown',
                    email: employee.email || '',
                    employeeId: employee.employeeId || '',
                    department: employee.department || '',
                    position: employee.position || '',
                    checkInTime: checkInTime,
                    status: record.status || 'late'
                  }
                } else {
                  return {
                    _id: record.id || record._id || null,
                    name: record.employeeName || 'Unknown',
                    email: record.email || '',
                    employeeId: record.employeeId || '',
                    department: record.department || '',
                    position: record.position || '',
                    checkInTime: checkInTime,
                    status: record.status || 'late'
                  }
                }
              })
              .filter(emp => emp && emp.name && emp.name !== 'Unknown')
          } else if (type === 'absent') {
            // Get all employees and find those without attendance today
            const employeesResponse = await employeesAPI.getEmployees()
            const allEmployeesData = employeesResponse?.data?.success ? (employeesResponse.data.data || {}) : {}
            const allEmployees = Array.isArray(allEmployeesData)
              ? allEmployeesData
              : (allEmployeesData?.docs || [])

            // Get IDs of employees who have checked in today
            const presentEmployeeIds = new Set()
            allRecords.forEach(record => {
              const checkInTime = record.checkIn?.time || record.checkIn
              if (checkInTime) {
                const emp = record.employee
                if (emp) {
                  const empId = emp._id?.toString() || emp.toString()
                  if (empId) presentEmployeeIds.add(empId)
                } else if (record.employeeId) {
                  presentEmployeeIds.add(record.employeeId.toString())
                }
              }
            })

            filteredEmployees = allEmployees
              .filter(emp => {
                if (!emp || !emp.isActive) return false
                const empId = emp._id?.toString()
                return empId && !presentEmployeeIds.has(empId)
              })
              .map(emp => ({
                _id: emp._id,
                name: emp.name || 'Unknown',
                email: emp.email || '',
                employeeId: emp.employeeId || '',
                department: emp.department || '',
                position: emp.position || '',
                status: 'absent'
              }))
              .filter(emp => emp.name && emp.name !== 'Unknown')
          }

          setEmployeeList(filteredEmployees)
        } else {
          // If getTodayAttendance fails, try alternative approach
          const today = new Date()
          today.setHours(0, 0, 0, 0)
          const response = await attendanceAPI.getAttendance({
            startDate: today.toISOString().split('T')[0],
            endDate: today.toISOString().split('T')[0],
            limit: 1000
          })

          if (response?.data?.success) {
            const attendanceData = response.data.data || {}
            const attendanceRecords = Array.isArray(attendanceData)
              ? attendanceData
              : (attendanceData.docs || [])

            // Use the same filtering logic as above
            let filteredEmployees = []
            const lateThreshold = new Date(today)
            lateThreshold.setHours(11, 0, 0, 0)

            if (type === 'present') {
              filteredEmployees = attendanceRecords
                .filter(record => record?.checkIn?.time && record?.employee)
                .map(record => ({
                  ...(record.employee || {}),
                  checkInTime: record.checkIn.time,
                  status: record.status || 'present'
                }))
            } else if (type === 'late') {
              filteredEmployees = attendanceRecords
                .filter(record => {
                  if (!record?.checkIn?.time || !record?.employee) return false
                  const checkInDate = new Date(record.checkIn.time)
                  return checkInDate > lateThreshold
                })
                .map(record => ({
                  ...(record.employee || {}),
                  checkInTime: record.checkIn.time,
                  status: record.status || 'late'
                }))
            } else if (type === 'absent') {
              const employeesResponse = await employeesAPI.getEmployees()
              const allEmployeesData = employeesResponse?.data?.success ? (employeesResponse.data.data || {}) : {}
              const allEmployees = Array.isArray(allEmployeesData)
                ? allEmployeesData
                : (allEmployeesData?.docs || [])

              const presentIds = new Set(
                attendanceRecords
                  .filter(r => r?.checkIn?.time)
                  .map(r => r.employee?._id?.toString())
                  .filter(Boolean)
              )

              filteredEmployees = allEmployees
                .filter(emp => emp?.isActive && !presentIds.has(emp._id?.toString()))
                .map(emp => ({ ...emp, status: 'absent' }))
            }

            setEmployeeList(filteredEmployees)
          }
        }
      }
    } catch (error) {
      console.error('Error fetching employee list:', error)
      setEmployeeList([])
    } finally {
      setLoadingEmployees(false)
    }
  }

  if (!hasMounted) {
    return null
  }

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="loading-spinner"></div>
        </div>
      </DashboardLayout>
    )
  }

  // Employee Dashboard
  if (isEmployee) {
    const pendingTasks = tasks.filter(t => t.status === 'pending')
    const inProgressTasks = tasks.filter(t => t.status === 'in-progress')
    const completedTasks = tasks.filter(t => t.status === 'completed')
    // Handle attendance data - backend returns ISO strings or null
    const isCheckedIn = todayAttendance?.checkIn !== null && todayAttendance?.checkIn !== undefined
    const isCheckedOut = todayAttendance?.checkOut !== null && todayAttendance?.checkOut !== undefined

    return (
      <DashboardLayout>
        <div className="space-y-6">
          {pageAlert && (
            <InlineAlert
              message={pageAlert.message}
              type={pageAlert.type}
              onClose={() => setPageAlert(null)}
            />
          )}
          {/* Welcome Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-800 text-white p-6 rounded-lg shadow-lg">
            <p className="text-blue-100">
              {user?.department && `${user.department} • `}
              {user?.position || 'Employee'}
            </p>
          </div>

          {/* Today's Attendance Card */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-xl font-semibold text-gray-900">Today's Attendance</h2>
              <span className="text-sm text-gray-500">
                {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Check In</span>
                  {isCheckedIn ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <Clock className="w-5 h-5 text-gray-400" />
                  )}
                </div>
                <p className="text-2xl font-semibold text-gray-900">
                  {isCheckedIn ? formatTime(todayAttendance?.checkIn) : 'Not checked in'}
                </p>
              </div>

              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Check Out</span>
                  {isCheckedOut ? (
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  ) : (
                    <Clock className="w-5 h-5 text-gray-400" />
                  )}
                </div>
                <p className="text-2xl font-semibold text-gray-900">
                  {isCheckedOut ? formatTime(todayAttendance?.checkOut) : 'Not checked out'}
                </p>
              </div>

              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600">Work Hours</span>
                  <Clock className="w-5 h-5 text-blue-600" />
                </div>
                <p className="text-2xl font-semibold text-gray-900">
                  {todayAttendance?.workingHours ? formatWorkHours(todayAttendance.workingHours) : '0h 0m'}
                </p>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                onClick={handleCheckIn}
                disabled={checking.checkIn || isCheckedIn}
                className="flex-1 bg-green-500 hover:bg-green-600 disabled:bg-green-300 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
              >
                {checking.checkIn ? (
                  <>
                    <Clock className="w-5 h-5 animate-spin" />
                    <span>Checking In...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    <span>{isCheckedIn ? 'Already Checked In' : 'Check In'}</span>
                  </>
                )}
              </button>
              <button
                onClick={handleCheckOut}
                disabled={checking.checkOut || !isCheckedIn || isCheckedOut}
                className="flex-1 bg-red-500 hover:bg-red-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white px-6 py-3 rounded-lg font-medium transition-colors flex items-center justify-center space-x-2"
              >
                {checking.checkOut ? (
                  <>
                    <Clock className="w-5 h-5 animate-spin" />
                    <span>Checking Out...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-5 h-5" />
                    <span>{isCheckedOut ? 'Already Checked Out' : isCheckedIn ? 'Check Out' : 'Check In First'}</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Tasks Section */}
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
              <h2 className="text-xl font-semibold text-gray-900">My Tasks</h2>
              <button
                onClick={() => setShowTaskForm(!showTaskForm)}
                className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add Task</span>
              </button>
            </div>

            {/* Task Form */}
            {showTaskForm && (
              <form onSubmit={handleCreateTask} className="mb-6 p-4 bg-gray-50 rounded-lg">
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Task Title</label>
                    <input
                      type="text"
                      required
                      value={newTask.title}
                      onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Enter task title..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={newTask.description}
                      onChange={(e) => setNewTask({ ...newTask, description: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      rows="2"
                      placeholder="Enter task description..."
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                      <select
                        value={newTask.priority}
                        onChange={(e) => setNewTask({ ...newTask, priority: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="low">Low</option>
                        <option value="medium">Medium</option>
                        <option value="high">High</option>
                        <option value="urgent">Urgent</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Due Date</label>
                      <input
                        type="date"
                        value={newTask.dueDate}
                        onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <button
                      type="submit"
                      disabled={tasksLoading}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
                    >
                      Create Task
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setShowTaskForm(false)
                        setNewTask({ title: '', description: '', priority: 'medium', dueDate: '' })
                      }}
                      className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Task Stats */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-800 font-medium">Pending</p>
                <p className="text-2xl font-bold text-yellow-900">{pendingTasks.length}</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800 font-medium">In Progress</p>
                <p className="text-2xl font-bold text-blue-900">{inProgressTasks.length}</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-800 font-medium">Completed</p>
                <p className="text-2xl font-bold text-green-900">{completedTasks.length}</p>
              </div>
            </div>

            {/* Tasks List */}
            <div className="space-y-3">
              {tasks.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <p>No tasks yet. Create your first task!</p>
                </div>
              ) : (
                tasks.slice(0, 5).map((task) => (
                  <div
                    key={task._id}
                    className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2 mb-2">
                          <button
                            onClick={() => toggleTaskStatus(task)}
                            className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(task.status)}`}
                          >
                            {task.status === 'completed' ? 'Completed' : task.status === 'in-progress' ? 'In Progress' : 'Pending'}
                          </button>
                          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getPriorityColor(task.priority)}`}>
                            {task.priority.toUpperCase()}
                          </span>
                          {task.dueDate && (
                            <span className="flex items-center space-x-1 text-xs text-gray-500">
                              <Calendar className="w-3 h-3" />
                              <span>{new Date(task.dueDate).toLocaleDateString()}</span>
                            </span>
                          )}
                        </div>
                        <h3 className={`font-semibold text-gray-900 ${task.status === 'completed' ? 'line-through text-gray-500' : ''}`}>
                          {task.title}
                        </h3>
                        {task.description && (
                          <p className="text-sm text-gray-600 mt-1">{task.description}</p>
                        )}
                      </div>
                      <div className="flex space-x-2 ml-4">
                        <button
                          onClick={() => handleUpdateTask(task._id, { status: task.status === 'completed' ? 'pending' : 'completed' })}
                          className="text-green-600 hover:text-green-700"
                          title={task.status === 'completed' ? 'Mark as pending' : 'Mark as complete'}
                        >
                          <CheckCircle className="w-5 h-5" />
                        </button>
                        <button
                          onClick={() => handleDeleteTask(task._id)}
                          className="text-red-600 hover:text-red-700"
                          title="Delete task"
                        >
                          <Trash2 className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Upcoming Leaves */}
          {upcomingLeaves.length > 0 && (
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold flex items-center space-x-2">
                  <Calendar className="w-5 h-5 text-blue-600" />
                  <span>Upcoming Approved Leaves</span>
                </h3>
                <button
                  onClick={() => router.push('/dashboard/leaves')}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  View All
                </button>
              </div>
              <div className="space-y-2">
                {upcomingLeaves.slice(0, 3).map((leave) => (
                  <div key={leave._id} className="flex items-center justify-between p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div>
                      <p className="font-medium text-gray-900">
                        {new Date(leave.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {new Date(leave.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      </p>
                      <p className="text-sm text-gray-600">{leave.leaveType} • {leave.totalDays} day{leave.totalDays !== 1 ? 's' : ''}</p>
                    </div>
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Leave Stats Summary */}
          {leaveStats && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <p className="text-sm text-yellow-700 font-medium">Pending</p>
                <p className="text-2xl font-bold text-yellow-900">{leaveStats.pending || 0}</p>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <p className="text-sm text-green-700 font-medium">Approved</p>
                <p className="text-2xl font-bold text-green-900">{leaveStats.approved || 0}</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-700 font-medium">This Year</p>
                <p className="text-2xl font-bold text-blue-900">{leaveStats.thisYear || 0}</p>
              </div>
            </div>
          )}
        </div>
      </DashboardLayout>
    )
  }

  // Admin/HR Dashboard (existing)
  return (
    <DashboardLayout>
      <div className="space-y-6">
        {pageAlert && (
          <InlineAlert
            message={pageAlert.message}
            type={pageAlert.type}
            onClose={() => setPageAlert(null)}
          />
        )}
        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div
            onClick={() => handleStatCardClick('total')}
            className="bg-white p-6 rounded-lg shadow cursor-pointer hover:shadow-lg transition-shadow hover:scale-105 transform duration-200"
          >
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <span className="text-green-600 text-lg">👥</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Employees</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.totalEmployees || 0}</p>
              </div>
            </div>
          </div>

          <div
            onClick={() => handleStatCardClick('present')}
            className="bg-white p-6 rounded-lg shadow cursor-pointer hover:shadow-lg transition-shadow hover:scale-105 transform duration-200"
          >
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <span className="text-blue-600 text-lg">✅</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Present Today</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.presentToday || 0}</p>
              </div>
            </div>
          </div>

          <div
            onClick={() => handleStatCardClick('late')}
            className="bg-white p-6 rounded-lg shadow cursor-pointer hover:shadow-lg transition-shadow hover:scale-105 transform duration-200"
          >
            <div className="flex items-center">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <span className="text-yellow-600 text-lg">⏰</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Late Today</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.lateToday || 0}</p>
              </div>
            </div>
          </div>

          <div
            onClick={() => handleStatCardClick('absent')}
            className="bg-white p-6 rounded-lg shadow cursor-pointer hover:shadow-lg transition-shadow hover:scale-105 transform duration-200"
          >
            <div className="flex items-center">
              <div className="p-2 bg-red-100 rounded-lg">
                <span className="text-red-600 text-lg">❌</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Absent Today</p>
                <p className="text-2xl font-semibold text-gray-900">{stats.absentToday || 0}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-gray-900">Attendance Trend - Last 7 Days</h3>
            </div>
            <AttendanceBarChart data={chartData} period="daily" />
            <div className="mt-4 text-sm text-gray-600 space-y-2">
              <p className="font-medium text-gray-700">Daily Timing Reference</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
                  <span>Early: before 10:00 AM</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-blue-500"></span>
                  <span>On Time: 10:00 AM - 11:00 AM</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-amber-400"></span>
                  <span>Late: 11:00 AM - 12:00 PM</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-rose-500"></span>
                  <span>Very Late: after 12:00 PM</span>
                </div>
              </div>
            </div>
          </div>
          <StatusPieChart data={pieData} />
        </div>

      </div>

      {/* Employee List Modal */}
      {showEmployeeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex justify-between items-center p-6 border-b">
              <div className="flex items-center space-x-3">
                <Users className="w-6 h-6 text-blue-600" />
                <h2 className="text-xl font-bold text-gray-900">
                  {modalType === 'total' && 'All Employees'}
                  {modalType === 'present' && 'Present Today'}
                  {modalType === 'late' && 'Late Today'}
                  {modalType === 'absent' && 'Absent Today'}
                </h2>
                <span className="text-sm text-gray-500">({employeeList.length})</span>
              </div>
              <button
                onClick={() => {
                  setShowEmployeeModal(false)
                  setModalType(null)
                  setEmployeeList([])
                }}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6">
              {loadingEmployees ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center">
                    <div className="loading-spinner mx-auto mb-4"></div>
                    <p className="text-gray-600">Loading employees...</p>
                  </div>
                </div>
              ) : employeeList.length === 0 ? (
                <div className="text-center py-12">
                  <Users className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-600">No employees found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {employeeList.map((employee, index) => (
                    <div
                      key={employee._id || index}
                      className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center space-x-4 flex-1">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
                          <span className="text-blue-600 font-semibold">
                            {employee.name?.charAt(0) || employee.employeeId?.charAt(0) || '?'}
                          </span>
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-gray-900">{employee.name || 'Unknown'}</p>
                          <div className="flex items-center space-x-4 text-sm text-gray-600 mt-1">
                            {employee.employeeId && (
                              <span>ID: {employee.employeeId}</span>
                            )}
                            {employee.department && (
                              <span>• {employee.department}</span>
                            )}
                            {employee.position && (
                              <span>• {employee.position}</span>
                            )}
                          </div>
                          {employee.checkInTime && (
                            <p className="text-xs text-gray-500 mt-1">
                              Check-in: {new Date(employee.checkInTime).toLocaleTimeString('en-US', {
                                hour: '2-digit',
                                minute: '2-digit'
                              })}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        {(() => {
                          const status = employee.status?.toLowerCase()
                          if (status === 'half-day') {
                            return (
                              <span className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm font-medium">
                                Half Day
                              </span>
                            )
                          }
                          if (modalType === 'present') {
                            return (
                              <span className="px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm font-medium">
                                Present
                              </span>
                            )
                          }
                          if (modalType === 'late') {
                            return (
                              <span className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded-full text-sm font-medium">
                                Late
                              </span>
                            )
                          }
                          if (modalType === 'absent') {
                            return (
                              <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-sm font-medium">
                                Absent
                              </span>
                            )
                          }
                          return null
                        })()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}
