'use client'
import { useEffect, useState, useRef } from 'react'
import { attendanceAPI, employeesAPI, leavesAPI, holidaysAPI } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { isHoliday, isFixedHoliday, formatDateForComparison, shouldExcludeFromLeave } from '../utils/holidays'
import InlineAlert from './InlineAlert'

export default function MonthlyCalendarView({ isAdmin }) {
  const { user, hasRole } = useAuth()
  const [selectedMonth, setSelectedMonth] = useState(new Date())
  const [attendanceData, setAttendanceData] = useState({})
  const [leaveData, setLeaveData] = useState({}) // Stores leave codes for display
  const [leaveObjects, setLeaveObjects] = useState({}) // Stores full leave objects by employee and date
  const [selectedOptionalHolidayIds, setSelectedOptionalHolidayIds] = useState([])
  const [employees, setEmployees] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [actionLoading, setActionLoading] = useState({})
  const [todayAttendance, setTodayAttendance] = useState({})
  const [editingCell, setEditingCell] = useState(null) // { employeeId, day }
  const [editingLeave, setEditingLeave] = useState(null) // Leave object being edited
  const [showLeaveEditModal, setShowLeaveEditModal] = useState(false)
  const [leaveFormData, setLeaveFormData] = useState({
    leaveType: 'vacation',
    startDate: '',
    endDate: '',
    reason: '',
    isPaid: true
  })
  const [submittingLeave, setSubmittingLeave] = useState(false)
  const [leaveError, setLeaveError] = useState('')
  const [downloadingExcel, setDownloadingExcel] = useState(false)
  const [pageAlert, setPageAlert] = useState(null)
  const dropdownRef = useRef(null)
  const isUpdatingRef = useRef(false)
  const weekContainerRef = useRef(null)
  const editingCellRef = useRef(null)
  const editingCellTimeoutRef = useRef(null)
  const [dropdownPosition, setDropdownPosition] = useState({ left: 0, top: 0 })
  
  const isEmployee = hasRole('employee')
  const isAdminUser = hasRole('admin') || hasRole('hr')

  useEffect(() => {
    if (!pageAlert) return
    const timer = setTimeout(() => setPageAlert(null), 6000)
    return () => clearTimeout(timer)
  }, [pageAlert])

  const showPageAlert = (message, type = 'info') => {
    setPageAlert({ message, type })
  }

  useEffect(() => {
    if (user || isAdmin) {
      fetchData()
    }
  }, [selectedMonth, isAdmin, user])

  // Scroll to current week on mount (horizontal scroll)
  useEffect(() => {
    if (weekContainerRef.current && !loading) {
      setTimeout(() => {
        const currentWeekElement = weekContainerRef.current?.querySelector('[data-current-week="true"]')
        if (currentWeekElement) {
          currentWeekElement.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
        }
      }, 100)
    }
  }, [loading, selectedMonth])
  
  // Recalculate dropdown position on scroll to handle horizontal table scrolling
  useEffect(() => {
    if (!editingCell || !editingCellRef.current) return

    const updatePosition = () => {
      if (editingCellRef.current) {
        const rect = editingCellRef.current.getBoundingClientRect()
        setDropdownPosition({
          left: rect.left + (rect.width / 2) - 70, // Center the dropdown (70px is half of min-width)
          top: rect.bottom + 4
        })
      }
    }

    // Initial position calculation
    updatePosition()

    // Update position on scroll events
    const scrollContainer = weekContainerRef.current
    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', updatePosition, { passive: true })
      window.addEventListener('scroll', updatePosition, { passive: true })
      window.addEventListener('resize', updatePosition, { passive: true })
    }

    return () => {
      if (scrollContainer) {
        scrollContainer.removeEventListener('scroll', updatePosition)
      }
      window.removeEventListener('scroll', updatePosition)
      window.removeEventListener('resize', updatePosition)
    }
  }, [editingCell])

  // Cleanup pending timeout on unmount
  useEffect(() => {
    return () => {
      if (editingCellTimeoutRef.current) {
        clearTimeout(editingCellTimeoutRef.current)
        editingCellTimeoutRef.current = null
      }
    }
  }, [])

  // Close editing dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      // Don't close if we're updating or if clicking inside the dropdown
      if (isUpdatingRef.current) {
        return
      }
      
      if (editingCell && dropdownRef.current) {
        // Check if click is outside the dropdown
        if (!dropdownRef.current.contains(event.target)) {
          // Also check if it's not a button click
          if (!event.target.closest('button')) {
            setEditingCell(null)
          }
        }
      }
    }

    if (editingCell) {
      // Use click instead of mousedown for better compatibility
      const timeoutId = setTimeout(() => {
        document.addEventListener('click', handleClickOutside, true)
      }, 300)
      
      return () => {
        clearTimeout(timeoutId)
        document.removeEventListener('click', handleClickOutside, true)
      }
    }
  }, [editingCell])

  const toLocalDateString = (value) => {
    if (!value) return null
    try {
      const date = new Date(value)
      if (!Number.isNaN(date.getTime())) {
        return formatDateForComparison(date)
      }
    } catch (err) {
      console.warn('Invalid date encountered:', value, err)
    }

    if (typeof value === 'string' && value.includes('T')) {
      return value.split('T')[0]
    }
    if (typeof value === 'string' && value.length === 10) {
      return value
    }
    return null
  }

  const fetchData = async () => {
    try {
      setLoading(true)
      const year = selectedMonth.getFullYear()
      const month = selectedMonth.getMonth()
      const startDate = new Date(year, month, 1)
      const endDate = new Date(year, month + 1, 0)

      // Fetch employees
      if (isAdmin) {
        const empResponse = await employeesAPI.getEmployees()
        if (empResponse.data?.success) {
          const empData = empResponse.data.data
          const empList = empData.docs || empData.data || empData || []
          const normalizedEmployees = empList.map(emp => ({
            ...emp,
            _id: emp._id || emp.id,
          }))
          setEmployees(normalizedEmployees)
        }
      } else if (user) {
        // For employees, show only their own data
        setEmployees([user])
      }

      // Fetch selected optional holidays for the year
      let fetchedHolidayIds = []
      try {
        const holidaysResponse = await holidaysAPI.getSelectedHolidays(year)
        if (holidaysResponse?.data?.success) {
          fetchedHolidayIds = holidaysResponse.data.data || []
          setSelectedOptionalHolidayIds(fetchedHolidayIds)
        }
      } catch (err) {
        console.error('Error fetching selected holidays:', err)
      }

      // Fetch leaves for the month (include all statuses so users can edit pending/approved leaves)
      const leavesResponse = await leavesAPI.getLeaves({
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        limit: 1000
      })

      if (leavesResponse.data?.success) {
        const leaves = leavesResponse.data.data?.docs || leavesResponse.data.data?.data || leavesResponse.data.data || []
        
        // Organize leaves by employee and date (for display codes)
        const organized = {}
        // Store full leave objects by employee and date
        const leaveObjectsMap = {}
        
        leaves.forEach(leave => {
          const empId = leave.employee?._id || leave.employee?.id || leave.employeeId || 'unknown'
          const start = new Date(leave.startDate)
          const end = new Date(leave.endDate)
          
          if (!organized[empId]) {
            organized[empId] = {}
            leaveObjectsMap[empId] = {}
          }
          
          // Store leave object for ALL dates in the range (for editing purposes)
          // But only display leave codes for working days
          const currentDate = new Date(start)
          const endDate = new Date(end)
          while (currentDate <= endDate) {
            // Use formatDateForComparison to avoid timezone issues
            const dateStr = formatDateForComparison(currentDate)
            if (!dateStr) break // Skip if date is invalid
            
            // Always store the leave object for this date (so we can edit it from any date in the range)
            if (!leaveObjectsMap[empId][dateStr]) {
              leaveObjectsMap[empId][dateStr] = []
            }
            // Only add if not already in the array (avoid duplicates)
            if (!leaveObjectsMap[empId][dateStr].find(l => l.id === leave.id || l._id === leave._id)) {
              leaveObjectsMap[empId][dateStr].push(leave)
            }
            
            // Only show leave codes for working days (exclude weekends and holidays from display)
            // Use fetchedHolidayIds (local variable) instead of selectedOptionalHolidayIds (state) to avoid closure issue
            if (!shouldExcludeFromLeave(dateStr, fetchedHolidayIds)) {
              // Map leave types to abbreviations based on isPaid status
              let leaveCode = 'UL' // Default to Unpaid Leave
              
              // Check if leave is unpaid
              if (leave.isPaid === false) {
                leaveCode = 'UL' // Unpaid Leave
              } else {
                // For paid leaves, use appropriate codes based on leave type
                if (leave.leaveType === 'vacation') leaveCode = 'PL' // Paid Leave
                else if (leave.leaveType === 'sick') leaveCode = 'ML' // Medical Leave
                else if (leave.leaveType === 'emergency') leaveCode = 'E' // Emergency
                else if (leave.leaveType === 'maternity') leaveCode = 'ML' // Maternity Leave
                else if (leave.leaveType === 'paternity') leaveCode = 'PL' // Paternity Leave
                else if (leave.leaveType === 'bereavement') leaveCode = 'BL' // Bereavement Leave
                else leaveCode = 'PL' // Default to Paid Leave for other types
              }
              
              organized[empId][dateStr] = leaveCode
            }
            
            currentDate.setDate(currentDate.getDate() + 1)
          }
        })
        
        setLeaveData(organized)
        setLeaveObjects(leaveObjectsMap)
      }

      // Fetch today's attendance for quick actions
      if (isAdmin) {
        try {
          const todayResponse = await attendanceAPI.getTodayAttendance()
          if (todayResponse.data?.success) {
            const todayData = todayResponse.data.data
            const todayList = Array.isArray(todayData) ? todayData : [todayData]
            const todayMap = {}
            todayList.forEach(record => {
              const empId = record.employee?._id || record.employee || record.employeeId
              if (empId) {
                todayMap[empId] = record
              }
            })
            setTodayAttendance(todayMap)
          }
        } catch (err) {
          console.error('Error fetching today attendance:', err)
        }
      }

      // Fetch attendance for the month
      const attendanceResponse = await attendanceAPI.getAttendance({
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        limit: 1000
      })

      if (attendanceResponse.data?.success) {
        const data = attendanceResponse.data.data
        const attendanceList = data.docs || data.data || data || []
        
        // Organize attendance by employee and date
        const organized = {}
        attendanceList.forEach(record => {
          const empId = record.employee?._id || record.employee || 'unknown'
          const dateStr = toLocalDateString(record.date)
          if (!dateStr) {
            return
          }
          
          if (!organized[empId]) {
            organized[empId] = {}
          }
          
          organized[empId][dateStr] = {
            status: record.status || (record.checkIn?.time ? 'present' : 'absent'),
            checkIn: record.checkIn?.time,
            checkOut: record.checkOut?.time,
            notes: record.notes
          }
        })
        
        setAttendanceData(organized)
      }
    } catch (error) {
      console.error('Error fetching calendar data:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleEmployeeClick = (employee) => {
    if (isAdmin) {
      setSelectedEmployee(selectedEmployee?._id === employee._id ? null : employee)
    }
  }

  const handleCheckIn = async (employeeId) => {
    if (!employeeId) return

    try {
      setActionLoading(prev => ({ ...prev, [`checkin-${employeeId}`]: true }))
      const response = await attendanceAPI.adminCheckIn({
        employeeId,
        location: 'Office',
        notes: `Checked in from calendar by ${user?.name || 'Admin'}`
      })

      if (response.data?.success) {
        const updatedAttendance = response.data.data?.attendance
        const todayStr = getTodayDateString()
        
        // Update today's attendance for this employee only
        if (updatedAttendance) {
          setTodayAttendance(prev => ({
            ...prev,
            [employeeId]: {
              ...updatedAttendance,
              employee: updatedAttendance.employee || prev[employeeId]?.employee
            }
          }))

          // Update attendance data for today's date
          setAttendanceData(prev => {
            const newData = { ...prev }
            if (!newData[employeeId]) {
              newData[employeeId] = {}
            }
            newData[employeeId] = {
              ...newData[employeeId],
              [todayStr]: {
                status: updatedAttendance?.status || 'present',
                checkIn: updatedAttendance?.checkInTime || updatedAttendance?.checkIn?.time || new Date(),
                checkOut: updatedAttendance?.checkOutTime || updatedAttendance?.checkOut?.time || null,
                notes: updatedAttendance?.notes || null
              }
            }
            return newData
          })
        }
        
        showPageAlert('✓ Check-in successful!', 'success')
      } else {
        showPageAlert(response.data?.message || 'Check-in failed', 'error')
      }
    } catch (err) {
      console.error('Check-in error:', err)
      showPageAlert(err.response?.data?.message || 'Check-in failed. Please try again.', 'error')
    } finally {
      setActionLoading(prev => ({ ...prev, [`checkin-${employeeId}`]: false }))
    }
  }

  const handleCheckOut = async (employeeId) => {
    if (!employeeId) return

    try {
      setActionLoading(prev => ({ ...prev, [`checkout-${employeeId}`]: true }))
      const response = await attendanceAPI.adminCheckOut({
        employeeId,
        location: 'Office',
        notes: `Checked out from calendar by ${user?.name || 'Admin'}`
      })

      if (response.data?.success) {
        const updatedAttendance = response.data.data?.attendance
        const todayStr = getTodayDateString()
        
        // Update today's attendance for this employee only
        if (updatedAttendance) {
          setTodayAttendance(prev => ({
            ...prev,
            [employeeId]: {
              ...updatedAttendance,
              employee: updatedAttendance.employee || prev[employeeId]?.employee
            }
          }))

          // Update attendance data for today's date
          setAttendanceData(prev => {
            const newData = { ...prev }
            if (!newData[employeeId]) {
              newData[employeeId] = {}
            }
            newData[employeeId] = {
              ...newData[employeeId],
              [todayStr]: {
                status: updatedAttendance?.status || prev[employeeId]?.[todayStr]?.status || 'present',
                checkIn: updatedAttendance?.checkInTime || updatedAttendance?.checkIn?.time || prev[employeeId]?.[todayStr]?.checkIn || null,
                checkOut: updatedAttendance?.checkOutTime || updatedAttendance?.checkOut?.time || new Date(),
                notes: updatedAttendance?.notes || prev[employeeId]?.[todayStr]?.notes || null
              }
            }
            return newData
          })
        }
        
        showPageAlert('✓ Check-out successful!', 'success')
      } else {
        showPageAlert(response.data?.message || 'Check-out failed', 'error')
      }
    } catch (err) {
      console.error('Check-out error:', err)
      showPageAlert(err.response?.data?.message || 'Check-out failed. Please try again.', 'error')
    } finally {
      setActionLoading(prev => ({ ...prev, [`checkout-${employeeId}`]: false }))
    }
  }

  const getTodayStatus = (employeeId) => {
    const record = todayAttendance[employeeId]
    if (!record) return { hasCheckedIn: false, hasCheckedOut: false }
    
    const hasCheckedIn = record.checkIn || record.checkInTime || record.checkIn?.time
    const hasCheckedOut = record.checkOut || record.checkOutTime || record.checkOut?.time
    
    return { hasCheckedIn: !!hasCheckedIn, hasCheckedOut: !!hasCheckedOut }
  }

  const getDaysInMonth = () => {
    const year = selectedMonth.getFullYear()
    const month = selectedMonth.getMonth()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    
    const days = []
    // Add all days of the month (no empty cells at the start)
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(day)
    }
    
    return days
  }

  // Get all weeks for the selected month
  const getWeeksInMonth = () => {
    const year = selectedMonth.getFullYear()
    const month = selectedMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    
    // Get the first Sunday of the month (or before if month doesn't start on Sunday)
    const firstDayOfWeek = firstDay.getDay()
    const firstSunday = new Date(firstDay)
    firstSunday.setDate(firstDay.getDate() - firstDayOfWeek)
    
    // Get the last Saturday of the month (or after if month doesn't end on Saturday)
    const lastDayOfWeek = lastDay.getDay()
    const lastSaturday = new Date(lastDay)
    lastSaturday.setDate(lastDay.getDate() + (6 - lastDayOfWeek))
    
    const weeks = []
    const currentWeekStart = new Date(firstSunday)
    
    while (currentWeekStart <= lastSaturday) {
      const weekEnd = new Date(currentWeekStart)
      weekEnd.setDate(weekEnd.getDate() + 6)
      
      weeks.push({
        start: new Date(currentWeekStart),
        end: new Date(weekEnd)
      })
      
      currentWeekStart.setDate(currentWeekStart.getDate() + 7)
    }
    
    return weeks
  }

  // Get days in a specific week
  const getDaysInWeek = (weekStart) => {
    const days = []
    for (let i = 0; i < 7; i++) {
      const date = new Date(weekStart)
      date.setDate(date.getDate() + i)
      days.push({
        date: new Date(date),
        day: date.getDate(),
        month: date.getMonth(),
        year: date.getFullYear()
      })
    }
    return days
  }

  const getDayName = (dayIndex) => {
    const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
    return days[dayIndex]
  }

  const getDateString = (day) => {
    if (!day) return null
    const year = selectedMonth.getFullYear()
    const month = selectedMonth.getMonth()
    const date = new Date(year, month, day)
    // Use formatDateForComparison to avoid timezone issues with toISOString()
    return formatDateForComparison(date)
  }

  const getAttendanceStatus = (employeeId, day) => {
    if (!day) return null
    const dateStr = getDateString(day)
    
    // Check if it's a holiday first (holidays override everything)
    const holiday = isHoliday(dateStr, true) // Include optional holidays
    if (holiday) {
      return 'H' // Holiday
    }
    
    // Check leave (leaves override attendance)
    const empLeaveData = leaveData[employeeId]
    if (empLeaveData && empLeaveData[dateStr]) {
      return empLeaveData[dateStr]
    }
    
    // Check attendance
    const empData = attendanceData[employeeId]
    if (empData && empData[dateStr]) {
      const status = empData[dateStr].status
      // Map status to abbreviations
      if (status === 'present') return 'P'
      if (status === 'absent') return 'A'
      if (status === 'leave') return 'UL' // Unpaid Leave
      if (status === 'half-day') return 'HD'
      return status?.toUpperCase().substring(0, 2) || null
    }
    
    return null
  }

  // Helper to get status for a specific date (not just day number)
  const getAttendanceStatusForDate = (employeeId, date) => {
    const dateStr = formatDateForComparison(date)
    
    // Check if it's a holiday first
    const holiday = isHoliday(dateStr, true)
    if (holiday) {
      return 'H'
    }
    
    // Check leave
    const empLeaveData = leaveData[employeeId]
    if (empLeaveData && empLeaveData[dateStr]) {
      return empLeaveData[dateStr]
    }
    
    // Check attendance
    const empData = attendanceData[employeeId]
    if (empData && empData[dateStr]) {
      const status = empData[dateStr].status
      if (status === 'present') return 'P'
      if (status === 'absent') return 'A'
      if (status === 'leave') return 'UL'
      if (status === 'half-day') return 'HD'
      return status?.toUpperCase().substring(0, 2) || null
    }
    
    return null
  }

  // Calculate total attendance and leave for an employee in the selected month
  const calculateMonthlyStats = (employeeId) => {
    let totalAttendance = 0
    let totalLeave = 0
    let totalHalfDay = 0
    
    const days = getDaysInMonth()
    days.forEach(day => {
      if (!day) return
      const status = getAttendanceStatus(employeeId, day)
      if (status === 'P') {
        totalAttendance++
      } else if (status === 'HD') {
        totalHalfDay++
      } else if (status === 'PL' || status === 'UL' || status === 'ML' || status === 'BL' || status === 'E') {
        totalLeave++
      }
    })
    
    return { totalAttendance, totalLeave, totalHalfDay }
  }

  // Helper to get today's date string (YYYY-MM-DD format)
  const getTodayDateString = () => {
    const today = new Date()
    const year = today.getFullYear()
    const month = String(today.getMonth() + 1).padStart(2, '0')
    const date = String(today.getDate()).padStart(2, '0')
    return `${year}-${month}-${date}`
  }

  const isToday = (day) => {
    if (!day) return false
    const todayStr = getTodayDateString()
    const cellDateStr = getDateString(day)
    return cellDateStr === todayStr
  }

  const isPastDate = (day) => {
    if (!day) return true
    const todayStr = getTodayDateString()
    const cellDateStr = getDateString(day)
    if (!cellDateStr) return true
    return cellDateStr < todayStr
  }

  const isFutureDate = (day) => {
    if (!day) return false
    const todayStr = getTodayDateString()
    const cellDateStr = getDateString(day)
    if (!cellDateStr) return false
    return cellDateStr > todayStr
  }

  const getLeaveForDate = (employeeId, dateStr) => {
    const empLeaveObjects = leaveObjects[employeeId]
    if (empLeaveObjects && empLeaveObjects[dateStr] && empLeaveObjects[dateStr].length > 0) {
      return empLeaveObjects[dateStr][0]
    }
    return null
  }

  const handleCellClick = (employeeId, day, event, dateObj = null) => {
    if (!isAdminUser && !isEmployee) return
    if (!day) return
    
    if (event && event.target.closest('.editing-dropdown')) {
      return
    }
    
    // Use provided date object if available (for week view), otherwise construct from day number
    const dateStr = dateObj ? formatDateForComparison(dateObj) : getDateString(day)
    const fixedHoliday = isFixedHoliday(dateStr)
    if (fixedHoliday) {
      showPageAlert(`Cannot edit fixed holiday dates. ${fixedHoliday.name} is a fixed holiday.`, 'warning')
      return
    }
    
    const leaveForDate = getLeaveForDate(employeeId, dateStr)
    const hasLeave = !!leaveForDate

    if (isEmployee && !isAdminUser) {
      if (hasLeave) {
        handleEditLeave(leaveForDate)
      }
      return
    }
    
    // Use date object if provided, otherwise construct from day
    const cellDate = dateObj || new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), day)
    const todayDate = new Date()
    todayDate.setHours(0, 0, 0, 0)
    const cellDateStr = formatDateForComparison(cellDate)
    const todayDateStr = formatDateForComparison(todayDate)
    
    const isPast = cellDate < todayDate
    const isFuture = cellDate > todayDate
    const isTodayDate = cellDateStr === todayDateStr
    const holiday = isHoliday(dateStr, true)

    const canEditStatus = isAdminUser && isTodayDate && !isPast && !isFuture && !holiday
    const canOpenDropdown = canEditStatus || (isAdminUser && hasLeave)

    if (!canOpenDropdown) {
      if (hasLeave) {
        // Still allow admin to edit leave via modal if dropdown isn't available
        handleEditLeave(leaveForDate)
      }
      return
    }

    // Store the date string to handle cross-month weeks correctly
    const nextEditingCell = { 
      employeeId, 
      day,
      dateStr: cellDateStr // Store the actual date string to avoid month reconstruction issues
    }
    if (hasLeave) {
      nextEditingCell.leave = leaveForDate
    }

    // Check if clicking on the same cell that's already open - if so, close it
    if (editingCell) {
      const currentEditingDateStr = editingCell.dateStr || (editingCell ? formatDateForComparison(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), editingCell.day)) : null)
      if (editingCell.employeeId === employeeId && currentEditingDateStr === dateStr) {
        // Same cell clicked - close the dropdown
        // Clear any pending timeout
        if (editingCellTimeoutRef.current) {
          clearTimeout(editingCellTimeoutRef.current)
          editingCellTimeoutRef.current = null
        }
        setEditingCell(null)
        return
      }
      // Different cell clicked - close current and open new one
      // Clear any pending timeout to prevent race conditions
      if (editingCellTimeoutRef.current) {
        clearTimeout(editingCellTimeoutRef.current)
        editingCellTimeoutRef.current = null
      }
      setEditingCell(null)
      editingCellTimeoutRef.current = setTimeout(() => {
        setEditingCell(nextEditingCell)
        editingCellTimeoutRef.current = null
      }, 50)
    } else {
      // No cell is open - open the dropdown
      // Clear any pending timeout (shouldn't happen, but safety check)
      if (editingCellTimeoutRef.current) {
        clearTimeout(editingCellTimeoutRef.current)
        editingCellTimeoutRef.current = null
      }
      setEditingCell(nextEditingCell)
    }
  }
  
  const handleEditLeave = (leave) => {
    // Check if employee is trying to edit someone else's leave
    if (isEmployee && !isAdminUser) {
      const leaveEmployeeId = leave.employee?._id || leave.employee?.id || leave.employeeId
      const currentUserId = user?._id || user?.id
      if (leaveEmployeeId !== currentUserId) {
      showPageAlert('You can only edit your own leaves.', 'warning')
        return
      }
    }
    
    setEditingLeave(leave)
    const startDateStr = leave.startDate?.split('T')[0] || new Date(leave.startDate).toISOString().split('T')[0]
    const endDateStr = leave.endDate?.split('T')[0] || new Date(leave.endDate).toISOString().split('T')[0]
    setLeaveFormData({
      leaveType: leave.leaveType || 'vacation',
      startDate: startDateStr,
      endDate: endDateStr,
      reason: leave.reason || '',
      isPaid: leave.isPaid !== undefined ? leave.isPaid : true
    })
    setShowLeaveEditModal(true)
    setLeaveError('')
  }
  
  const handleUpdateLeave = async (e) => {
    e.preventDefault()
    setSubmittingLeave(true)
    setLeaveError('')

    // Validate form data
    if (!leaveFormData.leaveType || !leaveFormData.startDate || !leaveFormData.endDate || !leaveFormData.reason?.trim()) {
      setLeaveError('Please fill in all required fields')
      setSubmittingLeave(false)
      return
    }

    const submitData = {
      leaveType: leaveFormData.leaveType,
      startDate: leaveFormData.startDate,
      endDate: leaveFormData.endDate,
      reason: leaveFormData.reason.trim(),
      isPaid: leaveFormData.isPaid
    }

    try {
      const leaveId = editingLeave.id || editingLeave._id
      const response = await leavesAPI.updateLeave(leaveId, submitData)
      if (response?.data?.success) {
        await fetchData()
        setShowLeaveEditModal(false)
        setEditingLeave(null)
        showPageAlert('Leave updated successfully!', 'success')
      } else {
        setLeaveError(response?.data?.message || 'Failed to update leave')
      }
    } catch (err) {
      console.error('Update leave error:', err)
      setLeaveError(err?.response?.data?.message || 'Failed to update leave. Please try again.')
    } finally {
      setSubmittingLeave(false)
    }
  }
  
  const handleDeleteLeave = async () => {
    if (!confirm('Are you sure you want to delete this leave?')) return

    try {
      const leaveId = editingLeave.id || editingLeave._id
      const response = await leavesAPI.deleteLeave(leaveId)
      if (response?.data?.success) {
        await fetchData()
        setShowLeaveEditModal(false)
        setEditingLeave(null)
        showPageAlert('Leave deleted successfully!', 'success')
      } else {
        setLeaveError(response?.data?.message || 'Failed to delete leave')
      }
    } catch (err) {
      console.error('Delete leave error:', err)
      setLeaveError(err?.response?.data?.message || 'Failed to delete leave. Please try again.')
    }
  }
  
  const getLeaveTypeLabel = (type) => {
    const labels = {
      sick: 'Sick Leave',
      vacation: 'Vacation',
      personal: 'Personal',
      emergency: 'Emergency',
      maternity: 'Maternity',
      paternity: 'Paternity',
      bereavement: 'Bereavement',
      other: 'Other'
    }
    return labels[type] || type
  }

  const handleUpdateStatus = async (employeeId, day, status) => {
    if (!employeeId || !day) return

    try {
      // Use dateStr from editingCell if available (for week view), otherwise construct from day
      const dateStr = editingCell?.dateStr || getDateString(day)
      const loadingKey = `update-${employeeId}-${day}`
      setActionLoading(prev => ({ ...prev, [loadingKey]: true }))

      const response = await attendanceAPI.adminUpdateStatus({
        employeeId,
        date: dateStr,
        status,
        notes: `Status updated from calendar by ${user?.name || 'Admin'}`
      })

      if (response.data?.success) {
        const updatedAttendance = response.data.data?.attendance
        
        // Update only the specific employee's attendance data for this date
        setAttendanceData(prev => {
          const newData = { ...prev }
          if (!newData[employeeId]) {
            newData[employeeId] = {}
          }
          newData[employeeId] = {
            ...newData[employeeId],
            [dateStr]: {
              status: updatedAttendance?.status || status,
              checkIn: updatedAttendance?.checkInTime || updatedAttendance?.checkIn?.time || null,
              checkOut: updatedAttendance?.checkOutTime || updatedAttendance?.checkOut?.time || null,
              notes: updatedAttendance?.notes || null
            }
          }
          return newData
        })

        // Update todayAttendance if it's today's date
        const todayStr = getTodayDateString()
        if (dateStr === todayStr) {
          setTodayAttendance(prev => {
            const newToday = { ...prev }
            if (updatedAttendance) {
              newToday[employeeId] = {
                ...updatedAttendance,
                employee: updatedAttendance.employee || prev[employeeId]?.employee
              }
            }
            return newToday
          })
        }

        setEditingCell(null)
        const statusText = status === 'present' ? 'Present' : status === 'absent' ? 'Absent' : status === 'half-day' ? 'Half Day' : status
        showPageAlert(`✓ Status updated to ${statusText}`, 'success')
      } else {
        showPageAlert(response.data?.message || 'Failed to update status', 'error')
      }
    } catch (err) {
      console.error('Update status error:', err)
      showPageAlert(err.response?.data?.message || 'Failed to update status. Please try again.', 'error')
    } finally {
      const loadingKey = `update-${employeeId}-${day}`
      setActionLoading(prev => ({ ...prev, [loadingKey]: false }))
    }
  }

  const handleDownloadExcel = async () => {
    if (downloadingExcel) return
    
    try {
      setDownloadingExcel(true)
      const year = selectedMonth.getFullYear()
      const month = selectedMonth.getMonth() // 0-11
      
      const response = await attendanceAPI.exportMonthlyExcel(year, month)
      
      // Create blob from response data
      const blob = new Blob([response.data], { 
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
      })
      
      // Create download link
      const url = window.URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      
      // Generate filename
      const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December']
      link.download = `Attendance_${monthNames[month]}_${year}.xlsx`
      
      // Trigger download
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
      
      // Clean up
      window.URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Download Excel error:', err)
      showPageAlert(err.response?.data?.message || 'Failed to download Excel file. Please try again.', 'error')
    } finally {
      setDownloadingExcel(false)
    }
  }

  const getCellColor = (day, status) => {
    if (!day) return 'bg-white'
    
    const date = new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), day)
    const dayOfWeek = date.getDay()
    const dateStr = getDateString(day)
    
    // Check if it's a fixed holiday first (fixed holidays override everything)
    const fixedHoliday = isFixedHoliday(dateStr)
    if (fixedHoliday) {
      return 'bg-blue-100' // Fixed holiday - blue background
    }
    
    // Check if it's an optional holiday (optional holidays override weekend colors)
    const holiday = isHoliday(dateStr, true) // Include optional holidays
    if (holiday) {
      return 'bg-yellow-100' // Optional holiday - yellow background
    }
    
    // Weekend (Saturday = 6, Sunday = 0)
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return 'bg-orange-100' // Office close
    }
    
    // Status-based colors
    if (status === 'P') {
      return 'bg-green-100' // Present
    }
    if (status === 'A') {
      return 'bg-red-300 text-white' // Absent
    }
    if (status === 'HD') {
      return 'bg-purple-100' // Half Day
    }
    if (status === 'PL' || status === 'UL' || status === 'ML') {
      return 'bg-red-500 text-white' // Leave types - Red color
    }
    if (status === 'E') {
      return 'bg-blue-100' // Emergency
    }
    if (status === 'H') {
      return 'bg-yellow-100' // Holiday
    }
    
    return 'bg-white'
  }

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 
    'July', 'August', 'September', 'October', 'November', 'December']

  const year = selectedMonth.getFullYear()
  const month = selectedMonth.getMonth()
  const monthName = monthNames[month]
  
  // Get all weeks in the month
  const weeks = getWeeksInMonth()
  
  // Find which week contains today
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="loading-spinner"></div>
      </div>
    )
  }

  return (
      <div className="bg-white rounded-lg border border-gray-200 shadow-sm p-4 sm:p-6">
      {pageAlert && (
        <div className="mb-4">
          <InlineAlert
            message={pageAlert.message}
            type={pageAlert.type}
            onClose={() => setPageAlert(null)}
          />
        </div>
      )}
      {/* Header with month selector */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-900">{monthName} {year}</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => {
              const newDate = new Date(selectedMonth)
              newDate.setMonth(month - 1)
              setSelectedMonth(newDate)
            }}
            className="px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-xs sm:text-sm font-medium"
          >
            Previous
          </button>
          <button
            onClick={() => setSelectedMonth(new Date())}
            className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-xs sm:text-sm font-medium"
          >
            Current Month
          </button>
          <button
            onClick={() => {
              const newDate = new Date(selectedMonth)
              newDate.setMonth(month + 1)
              setSelectedMonth(newDate)
            }}
            className="px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded-lg text-xs sm:text-sm font-medium"
          >
            Next
          </button>
          {isAdmin && (
            <button
              onClick={handleDownloadExcel}
              disabled={downloadingExcel}
              className="px-3 py-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed text-white rounded-lg text-xs sm:text-sm font-medium flex items-center space-x-2 transition-colors shadow-sm hover:shadow"
              title="Download monthly attendance as Excel file"
            >
              {downloadingExcel ? (
                <>
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Downloading...</span>
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  <span>Download Excel</span>
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Calendar - Week by Week View (Horizontal Scroll) */}
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50">
        <div 
          ref={weekContainerRef}
          className="overflow-x-auto overflow-y-hidden"
          style={{ scrollBehavior: 'smooth' }}
        >
          <div className="flex space-x-3 sm:space-x-6 min-w-max p-3 sm:p-6">
            {weeks.map((week, weekIndex) => {
              const weekDays = getDaysInWeek(week.start)
              const isCurrentWeek = today >= week.start && today <= week.end
              
              return (
                <div 
                  key={`week-${weekIndex}`}
                  data-current-week={isCurrentWeek}
                  className={`border border-gray-300 rounded-lg overflow-hidden flex-shrink-0 ${isCurrentWeek ? 'ring-2 ring-blue-400 bg-blue-50/20' : 'bg-white'}`}
                  style={{ width: 'max-content', minWidth: '640px' }}
                >
                  {/* Week Header */}
                  <div className="bg-gradient-to-r from-gray-50 to-gray-100 px-4 sm:px-6 py-2 sm:py-3 border-b border-gray-300">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-xs sm:text-base text-gray-700">
                        Week {weekIndex + 1}: {weekDays[0].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} - {weekDays[6].date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </h3>
                      {isCurrentWeek && (
                        <span className="px-2 py-1 bg-blue-500 text-white text-[10px] sm:text-sm font-semibold rounded">Current Week</span>
                      )}
                    </div>
                  </div>

                  {/* Week Table */}
                  <div className="overflow-x-auto overflow-y-visible">
                    <table className="w-full border-collapse" style={{ position: 'relative' }}>
                      <thead>
                        <tr>
                          <th className="border border-gray-300 bg-gray-50 px-2 sm:px-3 py-2 text-left font-bold text-xs sm:text-sm sticky left-0 z-10">
                            Employee
                          </th>
                          {weekDays.map(({ date, day }) => {
                            const dayOfWeek = date.getDay()
                            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6
                            const dateStr = formatDateForComparison(date)
                            const fixedHoliday = isFixedHoliday(dateStr)
                            const holiday = isHoliday(dateStr, true)
                            const isHolidayDate = !!holiday
                            const isFixedHolidayDate = !!fixedHoliday
                            const isTodayDate = formatDateForComparison(today) === dateStr
                            
                            return (
                              <th
                                key={dateStr}
                                className={`border border-gray-300 px-1.5 sm:px-2 py-1.5 text-center text-[10px] sm:text-xs font-semibold min-w-[44px] sm:min-w-[50px] ${
                                  isFixedHolidayDate ? 'bg-blue-100' : isHolidayDate ? 'bg-yellow-100' : isWeekend ? 'bg-orange-100' : 'bg-gray-50'
                                } ${isTodayDate ? 'ring-2 ring-blue-400' : ''}`}
                                title={isHolidayDate ? holiday.name : isTodayDate ? 'Today' : ''}
                              >
                                <div className="text-[9px] sm:text-[10px] font-medium">{getDayName(dayOfWeek)}</div>
                                <div className={`font-bold text-sm sm:text-base mt-0.5 ${isTodayDate ? 'text-blue-600' : ''}`}>{day}</div>
                                {isHolidayDate && (
                                  <div className={`text-[8px] sm:text-[9px] mt-1 truncate ${isFixedHolidayDate ? 'text-blue-700' : 'text-yellow-700'}`} title={holiday.name}>
                                    {holiday.name.length > 8 ? holiday.name.substring(0, 8) + '...' : holiday.name}
                                  </div>
                                )}
                              </th>
                            )
                          })}
                          <th className="border border-gray-300 bg-gray-50 px-2 sm:px-3 py-2 text-center text-xs sm:text-sm font-bold sticky right-0 z-10">
                            Week Total
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {employees.length > 0 ? (
                          employees.map((employee) => {
                            const employeeId = employee._id
                            const isSelected = selectedEmployee?._id === employeeId
                            const todayStatus = getTodayStatus(employeeId)
                            
                            // Calculate week stats
                            const weekStats = weekDays.reduce((acc, { date }) => {
                              const dateStr = formatDateForComparison(date)
                              const status = getAttendanceStatusForDate(employeeId, date)
                              if (status === 'P') acc.present++
                              else if (status === 'HD') acc.halfDay++
                              else if (['PL', 'UL', 'ML'].includes(status)) acc.leave++
                              return acc
                            }, { present: 0, halfDay: 0, leave: 0 })
                            
                            return (
                              <tr key={employeeId} className="relative">
                                <td 
                                  className={`border border-gray-300 bg-gray-50 px-3 py-2 font-semibold text-sm sticky left-0 z-10 ${
                                    isAdmin ? 'cursor-pointer hover:bg-blue-50 transition-colors' : ''
                                  } ${isSelected ? 'bg-blue-100' : ''}`}
                                  onClick={() => handleEmployeeClick(employee)}
                                  title={isAdmin ? 'Click to check in/out' : ''}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex items-center space-x-2">
                                      <span className="truncate max-w-[150px]">{employee.name}</span>
                                      {isAdmin && (
                                        <svg className="w-4 h-4 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                                        </svg>
                                      )}
                                    </div>
                                    {isAdmin && isSelected && (
                                      <div className="ml-2 flex space-x-2">
                                        {!todayStatus.hasCheckedIn ? (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleCheckIn(employeeId)
                                            }}
                                            disabled={actionLoading[`checkin-${employeeId}`]}
                                            className="bg-green-500 hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-3 py-1 rounded text-xs font-semibold transition-colors"
                                            title="Check In Employee"
                                          >
                                            {actionLoading[`checkin-${employeeId}`] ? (
                                              <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                              </svg>
                                            ) : (
                                              '✓ In'
                                            )}
                                          </button>
                                        ) : null}
                                        {todayStatus.hasCheckedIn && !todayStatus.hasCheckedOut ? (
                                          <button
                                            onClick={(e) => {
                                              e.stopPropagation()
                                              handleCheckOut(employeeId)
                                            }}
                                            disabled={actionLoading[`checkout-${employeeId}`]}
                                            className="bg-red-500 hover:bg-red-600 disabled:bg-gray-400 disabled:cursor-not-allowed text-white px-3 py-1 rounded text-xs font-semibold transition-colors"
                                            title="Check Out Employee"
                                          >
                                            {actionLoading[`checkout-${employeeId}`] ? (
                                              <svg className="animate-spin h-3 w-3" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                              </svg>
                                            ) : (
                                              '✗ Out'
                                            )}
                                          </button>
                                        ) : null}
                                        {todayStatus.hasCheckedIn && todayStatus.hasCheckedOut && (
                                          <span className="text-xs text-gray-500 italic">Done</span>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                </td>
                                {weekDays.map(({ date, day }) => {
                                  const dateStr = formatDateForComparison(date)
                                  const status = getAttendanceStatusForDate(employeeId, date)
                                  const cellColor = getCellColor(day, status)
                                  const isTodayDate = formatDateForComparison(today) === dateStr
                                  const isPast = date < today
                                  const isFuture = date > today
                                  // Check if this cell is being edited by comparing employeeId and date string
                                  // Use stored dateStr if available (for cross-month weeks), otherwise reconstruct
                                  const editingDateStr = editingCell?.dateStr || (editingCell ? formatDateForComparison(new Date(selectedMonth.getFullYear(), selectedMonth.getMonth(), editingCell.day)) : null)
                                  const isEditing = editingCell?.employeeId === employeeId && editingDateStr === dateStr
                                  const hasLeave = leaveData[employeeId] && leaveData[employeeId][dateStr]
                                  const leaveForDate = getLeaveForDate(employeeId, dateStr)
                                  const holiday = isHoliday(dateStr, true)
                                  const fixedHoliday = isFixedHoliday(dateStr)
                                  
                                  const canEditStatus = isAdminUser && isTodayDate && !isPast && !isFuture && !holiday
                                  const isLeaveEditable = hasLeave && (isAdminUser || isEmployee)
                                  const isEditable = canEditStatus || (isAdminUser && hasLeave)
                                  
                                  let tooltipText = ''
                                  if (holiday) {
                                    tooltipText = holiday.name
                                  } else if (isLeaveEditable) {
                                    tooltipText = isAdminUser ? 'Click to edit leave or status' : 'Click to edit leave'
                                  } else if (isEditable) {
                                    tooltipText = 'Click to edit status'
                                  } else if (isPast) {
                                    tooltipText = 'Past dates cannot be edited'
                                  } else if (isFuture) {
                                    tooltipText = 'Future dates cannot be edited'
                                  }
                                  
                                  return (
                                    <td
                                      key={dateStr}
                                      ref={isEditing ? editingCellRef : null}
                                      className={`border border-gray-300 px-2 py-2 text-center text-sm font-bold ${cellColor} ${
                                        (isEditable || isLeaveEditable) ? 'cursor-pointer hover:ring-2 hover:ring-blue-400 relative' : ''
                                      } ${isPast ? 'opacity-60' : ''} ${isFuture ? 'opacity-40' : ''} ${isEditing ? 'overflow-visible' : ''}`}
                                      style={isEditing ? { overflow: 'visible', zIndex: 9999 } : {}}
                                      onClick={(e) => {
                                        if (!e.target.closest('.editing-dropdown') && !isUpdatingRef.current) {
                                          // Pass the actual date object for proper month handling
                                          handleCellClick(employeeId, day, e, date)
                                        }
                                      }}
                                      onMouseDown={(e) => {
                                        if (e.target.closest('.editing-dropdown')) {
                                          e.stopPropagation()
                                          e.preventDefault()
                                        }
                                      }}
                                      title={tooltipText}
                                    >
                                      {isEditing ? (
                                        <div 
                                          ref={dropdownRef}
                                          className="editing-dropdown fixed z-[10000] bg-white border-2 border-blue-500 rounded-lg shadow-xl p-2 min-w-[140px]" 
                                          onClick={(e) => e.stopPropagation()}
                                          style={{ 
                                            left: `${dropdownPosition.left}px`,
                                            top: `${dropdownPosition.top}px`,
                                            position: 'fixed'
                                          }}>
                                          {canEditStatus ? (
                                            <>
                                              <div className="text-xs font-semibold mb-2 text-gray-700 text-center">Update Status</div>
                                              <div className="flex flex-col gap-1.5">
                                                <button
                                                  onClick={() => handleUpdateStatus(employeeId, day, 'present')}
                                                  disabled={actionLoading[`update-${employeeId}-${day}`]}
                                                  className="bg-green-500 hover:bg-green-600 text-white px-3 py-1.5 rounded text-xs font-semibold disabled:opacity-50 transition-colors"
                                                >
                                                  {actionLoading[`update-${employeeId}-${day}`] ? 'Updating...' : 'Present'}
                                                </button>
                                                <button
                                                  onClick={() => handleUpdateStatus(employeeId, day, 'half-day')}
                                                  disabled={actionLoading[`update-${employeeId}-${day}`]}
                                                  className="bg-purple-500 hover:bg-purple-600 text-white px-3 py-1.5 rounded text-xs font-semibold disabled:opacity-50 transition-colors"
                                                >
                                                  {actionLoading[`update-${employeeId}-${day}`] ? 'Updating...' : 'Half Day'}
                                                </button>
                                                <button
                                                  onClick={() => handleUpdateStatus(employeeId, day, 'absent')}
                                                  disabled={actionLoading[`update-${employeeId}-${day}`]}
                                                  className="bg-red-500 hover:bg-red-600 text-white px-3 py-1.5 rounded text-xs font-semibold disabled:opacity-50 transition-colors"
                                                >
                                                  {actionLoading[`update-${employeeId}-${day}`] ? 'Updating...' : 'Absent'}
                                                </button>
                                              </div>
                                            </>
                                          ) : (
                                            <div className="text-xs text-center text-gray-500 mb-2">Status changes available today only</div>
                                          )}
                                          {editingCell?.leave && (
                                            <div className="mt-3 border-t border-gray-200 pt-2">
                                              <div className="text-xs font-semibold mb-2 text-gray-700 text-center">Leave Actions</div>
                                              <button
                                                onClick={() => {
                                                  handleEditLeave(editingCell.leave)
                                                  setEditingCell(null)
                                                }}
                                                className="w-full bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded text-xs font-semibold transition-colors"
                                              >
                                                Edit Leave
                                              </button>
                                            </div>
                                          )}
                                          <button
                                            onClick={() => setEditingCell(null)}
                                            className="mt-2 bg-gray-300 hover:bg-gray-400 text-gray-800 px-3 py-1.5 rounded text-xs font-semibold transition-colors w-full"
                                          >
                                            Close
                                          </button>
                                        </div>
                                      ) : (
                                        <>
                                          <div className="text-base font-bold">{status || ''}</div>
                                          {holiday && (
                                            <div className={`text-[9px] mt-1 truncate ${fixedHoliday ? 'text-blue-700' : 'text-yellow-800'}`} title={holiday.name}>
                                              {holiday.name.length > 7 ? holiday.name.substring(0, 7) + '...' : holiday.name}
                                            </div>
                                          )}
                                          {(isEditable || isLeaveEditable) && (
                                            <span className="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full" title={isLeaveEditable ? "Click to edit leave" : "Editable - Click to change status"}></span>
                                          )}
                                        </>
                                      )}
                                    </td>
                                  )
                                })}
                                {/* Week Total Column */}
                                <td className="border border-gray-300 bg-blue-50 px-3 py-2 text-center text-sm font-semibold sticky right-0 z-10">
                                  <div className="flex flex-col space-y-1">
                                    <div className="flex items-center justify-center space-x-2">
                                      <span className="text-gray-600 text-xs">P:</span>
                                      <span className="text-green-700 font-bold text-sm">{weekStats.present}</span>
                                    </div>
                                    <div className="flex items-center justify-center space-x-2">
                                      <span className="text-gray-600 text-xs">HD:</span>
                                      <span className="text-purple-700 font-bold text-sm">{weekStats.halfDay}</span>
                                    </div>
                                    <div className="flex items-center justify-center space-x-2">
                                      <span className="text-gray-600 text-xs">L:</span>
                                      <span className="text-red-700 font-bold text-sm">{weekStats.leave}</span>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )
                          })
                        ) : (
                          <tr>
                            <td colSpan={8} className="text-center p-4 text-gray-500">
                              No employees found
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-6 pt-4 border-t border-gray-300">
        <h3 className="font-semibold text-sm mb-3">Abbreviation</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="font-semibold mb-1">Attendance:</p>
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-green-100 border border-gray-300"></div>
                <span>P - Present</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-purple-100 border border-gray-300"></div>
                <span>HD - Half Day</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-red-300 border border-gray-300"></div>
                <span>A - Absent</span>
              </div>
            </div>
          </div>
          <div>
            <p className="font-semibold mb-1">Leave:</p>
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-red-500 border border-gray-300"></div>
                <span>PL - Paid</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-red-500 border border-gray-300"></div>
                <span>UL - Unpaid</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-red-500 border border-gray-300"></div>
                <span>ML - Medical</span>
              </div>
            </div>
          </div>
          <div>
            <p className="font-semibold mb-1">Other:</p>
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-blue-100 border border-gray-300"></div>
                <span>E - Emergency</span>
              </div>
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 bg-yellow-100 border border-gray-300"></div>
                <span>H - Holiday</span>
              </div>
            </div>
          </div>
          <div>
            <p className="font-semibold mb-1">Office:</p>
            <div className="flex items-center space-x-2">
              <div className="w-6 h-6 bg-orange-100 border border-gray-300"></div>
              <span>Office close</span>
            </div>
          </div>
        </div>
      </div>
      
      {/* Leave Edit Modal */}
      {showLeaveEditModal && editingLeave && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[10001]">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-semibold">Edit Leave</h2>
              <button
                onClick={() => {
                  setShowLeaveEditModal(false)
                  setEditingLeave(null)
                  setLeaveError('')
                }}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {leaveError && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-4">
                {leaveError}
              </div>
            )}

            <form onSubmit={handleUpdateLeave} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Leave Type
                </label>
                <select
                  value={leaveFormData.leaveType}
                  onChange={(e) => setLeaveFormData({ ...leaveFormData, leaveType: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  required
                >
                  <option value="vacation">Vacation</option>
                  <option value="sick">Sick Leave</option>
                  <option value="personal">Personal</option>
                  <option value="emergency">Emergency</option>
                  <option value="maternity">Maternity</option>
                  <option value="paternity">Paternity</option>
                  <option value="bereavement">Bereavement</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={leaveFormData.startDate}
                    onChange={(e) => setLeaveFormData({ ...leaveFormData, startDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={leaveFormData.endDate}
                    onChange={(e) => setLeaveFormData({ ...leaveFormData, endDate: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                    min={leaveFormData.startDate}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Leave Payment Type
                </label>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setLeaveFormData({ ...leaveFormData, isPaid: true })}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                      leaveFormData.isPaid
                        ? 'bg-green-500 text-white hover:bg-green-600'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Paid Leave
                  </button>
                  <button
                    type="button"
                    onClick={() => setLeaveFormData({ ...leaveFormData, isPaid: false })}
                    className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${
                      !leaveFormData.isPaid
                        ? 'bg-orange-500 text-white hover:bg-orange-600'
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                    }`}
                  >
                    Unpaid Leave
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reason
                </label>
                <textarea
                  value={leaveFormData.reason}
                  onChange={(e) => setLeaveFormData({ ...leaveFormData, reason: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows="3"
                  placeholder="Please provide a reason for your leave request..."
                  required
                />
              </div>

              <div className="flex space-x-3">
                <button
                  type="submit"
                  disabled={submittingLeave}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg font-medium"
                >
                  {submittingLeave ? 'Updating...' : 'Update Leave'}
                </button>
                <button
                  type="button"
                  onClick={handleDeleteLeave}
                  className="bg-red-600 hover:bg-red-700 text-white px-6 py-2 rounded-lg font-medium"
                >
                  Delete
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowLeaveEditModal(false)
                    setEditingLeave(null)
                    setLeaveError('')
                  }}
                  className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-2 rounded-lg font-medium"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

