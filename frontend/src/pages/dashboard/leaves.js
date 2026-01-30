'use client'
import { useEffect, useState, useRef } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import InlineAlert from '../../components/InlineAlert'
import { useAuth } from '../../hooks/useAuth'
import { leavesAPI, holidaysAPI } from '../../services/api'
import { Calendar, Plus, Edit, Trash2, CheckCircle, X, Clock, FileText } from 'lucide-react'
import { employeesAPI } from '../../services/api'
import { calculateWorkingDays, shouldExcludeFromLeave, formatDateForComparison } from '../../utils/holidays'

export default function LeavesPage() {
  const { user, hasRole } = useAuth()
  const [leaves, setLeaves] = useState([])
  const [stats, setStats] = useState({})
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingLeave, setEditingLeave] = useState(null)
  const [formData, setFormData] = useState({
    leaveType: 'vacation',
    startDate: '',
    endDate: '',
    reason: '',
    isPaid: true // Default to paid leave
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [paidLeavesCount, setPaidLeavesCount] = useState(0)
  const [activeTab, setActiveTab] = useState('requests') // 'requests' or 'balance'
  const [leaveBalance, setLeaveBalance] = useState(null)
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('')
  const [employees, setEmployees] = useState([])
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState('')
  const [selectedOptionalHolidayIds, setSelectedOptionalHolidayIds] = useState([])
  const [holidaysLoading, setHolidaysLoading] = useState(true)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [pendingSubmitData, setPendingSubmitData] = useState(null)
  const [workingDaysCount, setWorkingDaysCount] = useState(0)
  const [pageAlert, setPageAlert] = useState(null)

  const isEmployee = hasRole('employee')
  const isAdmin = hasRole('admin') || hasRole('hr')

  useEffect(() => {
    if (!pageAlert) return
    const timer = setTimeout(() => setPageAlert(null), 6000)
    return () => clearTimeout(timer)
  }, [pageAlert])

  const showPageAlert = (message, type = 'info') => {
    setPageAlert({ message, type })
  }

  const initialFetchRef = useRef(false)

  // Fetch selected optional holidays
  const fetchSelectedHolidays = async () => {
    try {
      setHolidaysLoading(true)
      const currentYear = new Date().getFullYear()
      const response = await holidaysAPI.getSelectedHolidays(currentYear)
      if (response?.data?.success) {
        setSelectedOptionalHolidayIds(response.data.data || [])
      }
    } catch (err) {
      console.error('Error fetching selected holidays:', err)
    } finally {
      setHolidaysLoading(false)
    }
  }

  useEffect(() => {
    if (initialFetchRef.current) return
    initialFetchRef.current = true

    const initializeData = async () => {
      // Fetch holidays first (await to ensure they're loaded before form submission)
      await fetchSelectedHolidays()

      // Then fetch other data
      fetchLeaves()

      if (isEmployee) {
        fetchStats()
        calculateLeaveBalance()
      }

      if (isAdmin) {
        fetchEmployees()
      }
    }

    initializeData()
  }, [isEmployee, isAdmin])

  // Fetch employees for admin
  const fetchEmployees = async () => {
    try {
      const response = await employeesAPI.getEmployees()
      if (response?.data?.success) {
        const employeesData = response.data.data?.docs || response.data.data || []
        setEmployees(employeesData)
        // Set first employee as default if available
        if (employeesData.length > 0 && !selectedEmployeeId) {
          const firstEmployeeId = employeesData[0]._id
          setSelectedEmployeeId(firstEmployeeId)
          // Calculate balance for the default employee if on balance tab
          if (activeTab === 'balance') {
            calculateLeaveBalance(firstEmployeeId)
          }
        }
      }
    } catch (err) {
      console.error('Error fetching employees:', err)
    }
  }

  // Update leave balance when selected employee changes (for admin)
  useEffect(() => {
    if (isAdmin && selectedEmployeeId && activeTab === 'balance') {
      calculateLeaveBalance(selectedEmployeeId)
    }
  }, [selectedEmployeeId, activeTab])

  // Calculate leave balance
  const calculateLeaveBalance = async (employeeId = null) => {
    // For employees, use their own ID. For admins, use the selected employee ID
    const targetEmployeeId = employeeId || (isEmployee ? user?._id || user?.id : selectedEmployeeId)

    if (!targetEmployeeId) return

    try {
      const currentYear = new Date().getFullYear()
      const yearStart = new Date(currentYear, 0, 1)
      const yearEnd = new Date(currentYear, 11, 31, 23, 59, 59, 999)

      // Format dates as YYYY-MM-DD for API
      const formatDateForAPI = (date) => {
        const year = date.getFullYear()
        const month = String(date.getMonth() + 1).padStart(2, '0')
        const day = String(date.getDate()).padStart(2, '0')
        return `${year}-${month}-${day}`
      }

      // Get all approved leaves for the current year for the target employee
      const response = await leavesAPI.getLeaves({
        status: 'approved',
        startDate: formatDateForAPI(yearStart),
        endDate: formatDateForAPI(yearEnd),
        employeeId: targetEmployeeId
      })

      if (response?.data?.success) {
        const leavesData = response.data.data?.docs || response.data.data || []

        // Constants
        const PAID_LEAVE_YEARLY = 24 // 24 days per year
        const PAID_LEAVE_MONTHLY = 2 // 2 days per month
        const MEDICAL_LEAVE_YEARLY = 12 // 12 days per year

        // Calculate paid leave taken
        let paidLeaveTaken = 0
        const monthlyPaidLeaves = {}

        // Calculate medical leave taken
        let medicalLeaveTaken = 0

        leavesData.forEach(leave => {
          const leaveStart = new Date(leave.startDate)
          const leaveEnd = new Date(leave.endDate)
          const days = leave.totalDays || 0

          // Count paid leaves
          if (leave.isPaid !== false) {
            paidLeaveTaken += days

            // Track monthly paid leaves - count leave records per month, not days
            // A leave counts for a month if it overlaps with that month
            const currentDate = new Date(leaveStart)
            const processedMonths = new Set()

            while (currentDate <= leaveEnd) {
              const monthKey = `${currentDate.getFullYear()}-${currentDate.getMonth()}`
              if (!processedMonths.has(monthKey)) {
                processedMonths.add(monthKey)
                if (!monthlyPaidLeaves[monthKey]) {
                  monthlyPaidLeaves[monthKey] = 0
                }
                monthlyPaidLeaves[monthKey] += 1 // Count as 1 leave record per month
              }
              currentDate.setDate(currentDate.getDate() + 1)
            }
          }

          // Count medical leaves (sick leave type)
          if (leave.leaveType === 'sick') {
            medicalLeaveTaken += days
          }
        })

        // Calculate remaining leaves
        const paidLeaveRemaining = Math.max(0, PAID_LEAVE_YEARLY - paidLeaveTaken)
        const medicalLeaveRemaining = Math.max(0, MEDICAL_LEAVE_YEARLY - medicalLeaveTaken)

        // Calculate monthly paid leave usage
        const currentMonth = new Date().getMonth()
        const currentYearNum = new Date().getFullYear()
        const monthlyUsage = []

        for (let month = 0; month <= currentMonth; month++) {
          const monthKey = `${currentYearNum}-${month}`
          const used = monthlyPaidLeaves[monthKey] || 0
          const remaining = Math.max(0, PAID_LEAVE_MONTHLY - used)
          monthlyUsage.push({
            month,
            monthName: new Date(currentYearNum, month, 1).toLocaleDateString('en-US', { month: 'long' }),
            used,
            remaining,
            limit: PAID_LEAVE_MONTHLY
          })
        }

        setLeaveBalance({
          paidLeave: {
            total: PAID_LEAVE_YEARLY,
            taken: paidLeaveTaken,
            remaining: paidLeaveRemaining
          },
          medicalLeave: {
            total: MEDICAL_LEAVE_YEARLY,
            taken: medicalLeaveTaken,
            remaining: medicalLeaveRemaining
          },
          monthlyPaidLeaves: monthlyUsage
        })
      }
    } catch (err) {
      console.error('Error calculating leave balance:', err)
    }
  }

  const fetchLeaves = async () => {
    try {
      setLoading(true)
      const response = await leavesAPI.getLeaves()
      if (response?.data?.success) {
        const leavesData = response.data.data.docs || response.data.data || []
        setLeaves(leavesData)
      }
    } catch (err) {
      console.error('Error fetching leaves:', err)
      setError('Failed to fetch leave requests')
    } finally {
      setLoading(false)
    }
  }

  const fetchStats = async () => {
    try {
      const response = await leavesAPI.getLeaveStats()
      if (response?.data?.success) {
        setStats(response.data.data)
      }
    } catch (err) {
      console.error('Error fetching stats:', err)
    }
  }

  // Check paid leave count for the selected month
  const checkPaidLeaveCount = async (startDate) => {
    if (!startDate || !isEmployee) return

    try {
      const date = new Date(startDate)
      const month = date.getMonth()
      const year = date.getFullYear()

      // Get all leaves for the month
      const response = await leavesAPI.getLeaves({
        startDate: new Date(year, month, 1).toISOString(),
        endDate: new Date(year, month + 1, 0).toISOString()
      })

      if (response?.data?.success) {
        const leavesData = response.data.data?.docs || response.data.data || []
        // Count paid leaves (approved or pending) in this month
        const paidCount = leavesData.filter(leave => {
          const leaveStart = new Date(leave.startDate)
          const leaveEnd = new Date(leave.endDate)
          const monthStart = new Date(year, month, 1)
          const monthEnd = new Date(year, month + 1, 0, 23, 59, 59, 999)

          // Check if leave overlaps with the month
          const overlaps = leaveStart <= monthEnd && leaveEnd >= monthStart
          return overlaps &&
            leave.isPaid !== false &&
            (leave.status === 'approved' || leave.status === 'pending') &&
            (!editingLeave || leave._id !== editingLeave._id) // Exclude current leave if editing
        }).length

        setPaidLeavesCount(paidCount)
      }
    } catch (err) {
      console.error('Error checking paid leave count:', err)
    }
  }

  // Calculate end date for 2 working days from start date
  const calculateEndDateFor2Days = (startDateStr) => {
    // Parse date in local timezone to avoid UTC conversion issues
    const [year, month, day] = startDateStr.split('-').map(Number)
    const start = new Date(year, month - 1, day)
    let current = new Date(start)
    let workingDaysFound = 0

    while (workingDaysFound < 2) {
      // Use formatDateForComparison for consistency with other date functions (avoids UTC timezone issues)
      const dateStr = formatDateForComparison(current)
      if (dateStr && !shouldExcludeFromLeave(dateStr, selectedOptionalHolidayIds)) {
        workingDaysFound++
      }
      if (workingDaysFound < 2) {
        current.setDate(current.getDate() + 1)
      }
    }

    // Use formatDateForComparison for consistency (avoids UTC timezone issues)
    return formatDateForComparison(current)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')

    // Validate form data before submission
    if (!formData.leaveType || !formData.startDate || !formData.endDate || !formData.reason?.trim()) {
      setError('Please fill in all required fields')
      setSubmitting(false)
      return
    }

    // Ensure holidays are loaded before calculating working days
    if (holidaysLoading) {
      setError('Please wait while holiday data is loading...')
      setSubmitting(false)
      return
    }

    // Calculate working days
    const workingDays = calculateWorkingDays(formData.startDate, formData.endDate, selectedOptionalHolidayIds)
    setWorkingDaysCount(workingDays)

    // If working days > 2 and it's a new leave (not editing), show confirmation
    if (workingDays > 2 && !editingLeave) {
      const submitData = {
        leaveType: formData.leaveType,
        startDate: formData.startDate,
        endDate: formData.endDate,
        reason: formData.reason.trim(),
        isPaid: formData.isPaid,
        ...(formData.attachments && { attachments: formData.attachments })
      }
      setPendingSubmitData(submitData)
      setShowConfirmDialog(true)
      setSubmitting(false)
      return
    }

    // Ensure dates are in ISO format
    const submitData = {
      leaveType: formData.leaveType,
      startDate: formData.startDate,
      endDate: formData.endDate,
      reason: formData.reason.trim(),
      isPaid: formData.isPaid,
      ...(formData.attachments && { attachments: formData.attachments })
    }

    console.log('Submitting leave data:', submitData)

    try {
      if (editingLeave) {
        const response = await leavesAPI.updateLeave(editingLeave._id, submitData)
        if (response?.data?.success) {
          await fetchLeaves()
          if (isEmployee) {
            await fetchStats()
            await calculateLeaveBalance()
          }
          resetForm()
          // Show warning if leave was auto-set to unpaid
          if (response?.data?.warning) {
            showPageAlert(response.data.warning, 'warning')
          } else {
            showPageAlert('Leave request updated successfully!', 'success')
          }
        } else {
          setError(response?.data?.message || 'Failed to update leave request')
        }
      } else {
        const response = await leavesAPI.createLeave(submitData)
        if (response?.data?.success) {
          await fetchLeaves()
          if (isEmployee) {
            await fetchStats()
            await calculateLeaveBalance()
          }
          resetForm()
          // Show warning if leave was auto-set to unpaid
          if (response?.data?.warning) {
            showPageAlert(response.data.warning, 'warning')
          } else {
            showPageAlert('Leave request submitted successfully!', 'success')
          }
        } else {
          setError(response?.data?.message || 'Failed to create leave request')
        }
      }
    } catch (err) {
      console.error('Submit error:', err)
      console.error('Error details:', {
        message: err.message,
        response: err.response?.data,
        status: err.response?.status,
        statusText: err.response?.statusText
      })

      // Handle different error types
      if (err.response) {
        // Server responded with error
        const errorData = err.response.data
        if (errorData?.errors && Array.isArray(errorData.errors)) {
          // Validation errors
          setError(errorData.errors.map(e => e.msg || e.message).join(', ') || errorData.message || 'Validation failed')
        } else {
          setError(errorData?.message || `Error ${err.response.status}: ${err.response.statusText}` || 'An error occurred')
        }
      } else if (err.request) {
        // Request was made but no response received
        setError('Network error. Please check if the server is running.')
      } else {
        // Error setting up the request
        setError(err.message || 'An error occurred. Please try again.')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleConfirmLeave = async (approveFullLeave) => {
    setShowConfirmDialog(false)

    if (!approveFullLeave) {
      // Limit to 2 working days
      const limitedEndDate = calculateEndDateFor2Days(pendingSubmitData.startDate)
      setFormData({
        ...formData,
        endDate: limitedEndDate
      })
      // Show message
      showPageAlert(`Leave has been limited to 2 working days. End date adjusted to ${limitedEndDate}.`, 'warning')
      setPendingSubmitData(null)
      return
    }

    // Proceed with full leave
    setSubmitting(true)
    setError('')

    try {
      if (editingLeave) {
        const response = await leavesAPI.updateLeave(editingLeave._id, pendingSubmitData)
        if (response?.data?.success) {
          await fetchLeaves()
          if (isEmployee) {
            await fetchStats()
            await calculateLeaveBalance()
          }
          resetForm()
          if (response?.data?.warning) {
            showPageAlert(response.data.warning, 'warning')
          } else {
            showPageAlert('Leave request updated successfully!', 'success')
          }
        } else {
          setError(response?.data?.message || 'Failed to update leave request')
        }
      } else {
        const response = await leavesAPI.createLeave(pendingSubmitData)
        if (response?.data?.success) {
          await fetchLeaves()
          if (isEmployee) {
            await fetchStats()
            await calculateLeaveBalance()
          }
          resetForm()
          if (response?.data?.warning) {
            showPageAlert(response.data.warning, 'warning')
          } else {
            showPageAlert('Leave request submitted successfully!', 'success')
          }
        } else {
          setError(response?.data?.message || 'Failed to create leave request')
        }
      }
    } catch (err) {
      console.error('Submit error:', err)
      if (err.response) {
        const errorData = err.response.data
        if (errorData?.errors && Array.isArray(errorData.errors)) {
          setError(errorData.errors.map(e => e.msg || e.message).join(', ') || errorData.message || 'Validation failed')
        } else {
          setError(errorData?.message || `Error ${err.response.status}: ${err.response.statusText}` || 'An error occurred')
        }
      } else if (err.request) {
        setError('Network error. Please check if the server is running.')
      } else {
        setError(err.message || 'An error occurred. Please try again.')
      }
    } finally {
      setSubmitting(false)
      setPendingSubmitData(null)
    }
  }

  const handleEdit = (leave) => {
    setEditingLeave(leave)
    const startDateStr = leave.startDate.split('T')[0]
    setFormData({
      leaveType: leave.leaveType,
      startDate: startDateStr,
      endDate: leave.endDate.split('T')[0],
      reason: leave.reason,
      isPaid: leave.isPaid !== undefined ? leave.isPaid : true
    })
    setShowForm(true)
    // Check paid leave count when editing
    if (isEmployee) {
      checkPaidLeaveCount(startDateStr)
    }
  }

  const handleDelete = async (id) => {
    if (!confirm('Are you sure you want to delete this leave request?')) return

    try {
      const response = await leavesAPI.deleteLeave(id)
      if (response?.data?.success) {
        await fetchLeaves()
        if (isEmployee) {
          await fetchStats()
          await calculateLeaveBalance()
        }
      } else {
        setError(response?.data?.message || 'Failed to delete leave request')
      }
    } catch (err) {
      console.error('Delete error:', err)
      setError(err?.response?.data?.message || 'Failed to delete leave request')
    }
  }

  const handleApproveReject = async (id, status, comments = '') => {
    try {
      const response = await leavesAPI.updateLeave(id, {
        status,
        reviewComments: comments || undefined
      })
      if (response?.data?.success) {
        await fetchLeaves()
        if (isEmployee) {
          await calculateLeaveBalance()
        }
        // If admin is viewing balance tab, refresh the balance for selected employee
        if (isAdmin && activeTab === 'balance' && selectedEmployeeId) {
          await calculateLeaveBalance(selectedEmployeeId)
        }
      } else {
        setError(response?.data?.message || 'Failed to update leave request')
      }
    } catch (err) {
      console.error('Approve/reject error:', err)
      setError(err?.response?.data?.message || 'Failed to update leave request')
    }
  }

  const resetForm = () => {
    setFormData({
      leaveType: 'vacation',
      startDate: '',
      endDate: '',
      reason: '',
      isPaid: true
    })
    setEditingLeave(null)
    setShowForm(false)
    setError('')
  }

  const getStatusColor = (status) => {
    switch (status) {
      case 'approved': return 'bg-green-100 text-green-800 border-green-200'
      case 'rejected': return 'bg-red-100 text-red-800 border-red-200'
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      case 'cancelled': return 'bg-gray-100 text-gray-800 border-gray-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
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

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
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

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Leave Management</h1>
            {/* <p className="text-gray-600 mt-1">
              {isEmployee ? 'Manage your leave requests' : 'Review and manage employee leave requests'}
            </p> */}
          </div>
          {isEmployee && (
            <button
              onClick={() => setShowForm(true)}
              className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium flex items-center justify-center space-x-2"
            >
              <Plus className="w-5 h-5" />
              <span>Apply for Leave</span>
            </button>
          )}
        </div>

        {/* Stats for Employees */}
        {isEmployee && stats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
              <p className="text-sm text-gray-600">Total Leaves</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total || 0}</p>
            </div>
            <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200 shadow-sm">
              <p className="text-sm text-yellow-700">Pending</p>
              <p className="text-2xl font-bold text-yellow-900">{stats.pending || 0}</p>
            </div>
            <div className="bg-green-50 p-4 rounded-lg border border-green-200 shadow-sm">
              <p className="text-sm text-green-700">Approved</p>
              <p className="text-2xl font-bold text-green-900">{stats.approved || 0}</p>
            </div>
            <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
              <p className="text-sm text-gray-600">This Year</p>
              <p className="text-2xl font-bold text-gray-900">{stats.thisYear || 0}</p>
            </div>
          </div>
        )}

        {/* Error Message */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}
        {pageAlert && (
          <InlineAlert
            message={pageAlert.message}
            type={pageAlert.type}
            onClose={() => setPageAlert(null)}
          />
        )}

        {/* Tabs */}
        {(isEmployee || isAdmin) && (
          <div className="bg-white shadow rounded-lg">
            <div className="border-b border-gray-200">
              <nav className="flex -mb-px overflow-x-auto">
                <button
                  onClick={() => setActiveTab('requests')}
                  className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'requests'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                  Leave Requests
                </button>
                <button
                  onClick={() => {
                    setActiveTab('balance')
                    if (isAdmin && selectedEmployeeId) {
                      calculateLeaveBalance(selectedEmployeeId)
                    } else if (isEmployee) {
                      calculateLeaveBalance()
                    }
                  }}
                  className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${activeTab === 'balance'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                >
                  Leave Balance
                </button>
              </nav>
            </div>
          </div>
        )}

        {/* Tab Content */}
        {activeTab === 'balance' && (isEmployee || isAdmin) ? (
          <div className="space-y-6">
            {/* Employee Selector for Admin */}
            {isAdmin && (
              <div className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Select Employee
                </label>
                <div className="space-y-2">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder="Search employee by name or ID..."
                      value={employeeSearchTerm}
                      onChange={(e) => setEmployeeSearchTerm(e.target.value)}
                      className="w-full px-3 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <svg
                      className="absolute left-3 top-2.5 h-5 w-5 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                  </div>
                  <select
                    value={selectedEmployeeId}
                    onChange={(e) => {
                      setSelectedEmployeeId(e.target.value)
                      calculateLeaveBalance(e.target.value)
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Select an employee</option>
                    {employees
                      .filter((emp) => {
                        if (!employeeSearchTerm) return true
                        const searchLower = employeeSearchTerm.toLowerCase()
                        return (
                          emp.name?.toLowerCase().includes(searchLower) ||
                          emp.employeeId?.toLowerCase().includes(searchLower)
                        )
                      })
                      .map((emp) => (
                        <option key={emp._id} value={emp._id}>
                          {emp.name} ({emp.employeeId || 'N/A'})
                        </option>
                      ))}
                  </select>
                </div>
                {selectedEmployeeId && (
                  <p className="mt-2 text-sm text-gray-600">
                    Viewing leave balance for: <span className="font-semibold">
                      {employees.find(emp => emp._id === selectedEmployeeId)?.name || 'Selected Employee'}
                    </span>
                  </p>
                )}
              </div>
            )}

            {/* Leave Balance Overview */}
            {leaveBalance && (isEmployee || (isAdmin && selectedEmployeeId)) ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Paid Leave Card */}
                  <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">Paid Leave</h3>
                      <span className="text-xs text-gray-500">24 days/year</span>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-gray-600">Total Allocated</span>
                          <span className="font-medium">{leaveBalance.paidLeave.total} days</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full transition-all"
                            style={{ width: `${Math.min((leaveBalance.paidLeave.taken / leaveBalance.paidLeave.total) * 100, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div>
                          <p className="text-sm text-gray-600">Taken</p>
                          <p className="text-2xl font-bold text-orange-600">{leaveBalance.paidLeave.taken}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Remaining</p>
                          <p className="text-2xl font-bold text-green-600">{leaveBalance.paidLeave.remaining}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Medical Leave Card */}
                  <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="text-lg font-semibold text-gray-900">Medical Leave</h3>
                      <span className="text-xs text-gray-500">12 days/year</span>
                    </div>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between text-sm mb-2">
                          <span className="text-gray-600">Total Allocated</span>
                          <span className="font-medium">{leaveBalance.medicalLeave.total} days</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-red-600 h-2 rounded-full transition-all"
                            style={{ width: `${Math.min((leaveBalance.medicalLeave.taken / leaveBalance.medicalLeave.total) * 100, 100)}%` }}
                          ></div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-4 pt-2">
                        <div>
                          <p className="text-sm text-gray-600">Taken</p>
                          <p className="text-2xl font-bold text-orange-600">{leaveBalance.medicalLeave.taken}</p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Remaining</p>
                          <p className="text-2xl font-bold text-green-600">{leaveBalance.medicalLeave.remaining}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Monthly Paid Leave Breakdown */}
                <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Paid Leave Usage (2 days/month)</h3>
                  <div className="md:hidden space-y-3">
                    {leaveBalance.monthlyPaidLeaves.map((monthData) => (
                      <div key={monthData.month} className="rounded-lg border border-gray-200 p-4">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-gray-900">{monthData.monthName}</p>
                          <span className={`px-2 py-1 text-xs font-semibold rounded-full ${monthData.used >= monthData.limit
                              ? 'bg-red-100 text-red-800'
                              : monthData.used > 0
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-green-100 text-green-800'
                            }`}>
                            {monthData.used >= monthData.limit ? 'Limit Reached' : monthData.used > 0 ? 'In Use' : 'Available'}
                          </span>
                        </div>
                        <div className="mt-3 grid grid-cols-3 gap-2 text-sm text-gray-600">
                          <div>
                            <p className="text-xs uppercase text-gray-400">Limit</p>
                            <p className="text-gray-900">{monthData.limit} days</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase text-gray-400">Used</p>
                            <p className="text-gray-900">{monthData.used} days</p>
                          </div>
                          <div>
                            <p className="text-xs uppercase text-gray-400">Remaining</p>
                            <p className="text-gray-900">{monthData.remaining} days</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="hidden md:block overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Month</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Limit</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Used</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Remaining</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {leaveBalance.monthlyPaidLeaves.map((monthData) => (
                          <tr key={monthData.month} className="hover:bg-gray-50">
                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                              {monthData.monthName}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                              {monthData.limit} days
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                              {monthData.used} days
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                              {monthData.remaining} days
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${monthData.used >= monthData.limit
                                  ? 'bg-red-100 text-red-800'
                                  : monthData.used > 0
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-green-100 text-green-800'
                                }`}>
                                {monthData.used >= monthData.limit ? 'Limit Reached' : monthData.used > 0 ? 'In Use' : 'Available'}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm text-center">
                <p className="text-gray-500">
                  {isAdmin && !selectedEmployeeId
                    ? 'Please select an employee to view their leave balance'
                    : 'Loading leave balance...'}
                </p>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* Leave Request Form */}
            {showForm && (
              <div className="bg-white p-6 rounded-lg border border-gray-200 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <h2 className="text-lg font-semibold">
                    {editingLeave ? 'Edit Leave Request' : 'Apply for Leave'}
                  </h2>
                  <button
                    onClick={resetForm}
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Leave Type
                      </label>
                      <select
                        value={formData.leaveType}
                        onChange={(e) => setFormData({ ...formData, leaveType: e.target.value })}
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

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Total Days
                      </label>
                      <div className="px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg">
                        {formData.startDate && formData.endDate ? (
                          (() => {
                            const start = new Date(formData.startDate)
                            const end = new Date(formData.endDate)
                            const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1
                            return `${days} day${days !== 1 ? 's' : ''}`
                          })()
                        ) : (
                          '-'
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Leave Payment Type
                        {isEmployee && formData.startDate && paidLeavesCount >= 2 && (
                          <span className="ml-2 text-xs text-orange-600 font-normal">
                            (You have already used 2 paid leaves this month)
                          </span>
                        )}
                      </label>
                      <div className="flex space-x-2">
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, isPaid: true })}
                          disabled={isEmployee && formData.startDate && paidLeavesCount >= 2}
                          className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${formData.isPaid
                              ? 'bg-green-500 text-white hover:bg-green-600'
                              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            } ${isEmployee && formData.startDate && paidLeavesCount >= 2 ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                          Paid Leave
                        </button>
                        <button
                          type="button"
                          onClick={() => setFormData({ ...formData, isPaid: false })}
                          className={`flex-1 px-4 py-2 rounded-lg font-medium transition-colors ${!formData.isPaid
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
                        Start Date
                      </label>
                      <input
                        type="date"
                        value={formData.startDate}
                        onChange={(e) => {
                          setFormData({ ...formData, startDate: e.target.value })
                          if (isEmployee) {
                            checkPaidLeaveCount(e.target.value)
                          }
                        }}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        required
                        min={new Date().toISOString().split('T')[0]}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        End Date
                      </label>
                      <input
                        type="date"
                        value={formData.endDate}
                        onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                        required
                        min={formData.startDate || new Date().toISOString().split('T')[0]}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Reason
                    </label>
                    <textarea
                      value={formData.reason}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      rows="3"
                      placeholder="Please provide a reason for your leave request..."
                      required
                    />
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <button
                      type="submit"
                      disabled={submitting}
                      className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-6 py-2 rounded-lg font-medium"
                    >
                      {submitting ? 'Submitting...' : editingLeave ? 'Update Request' : 'Submit Request'}
                    </button>
                    <button
                      type="button"
                      onClick={resetForm}
                      className="w-full sm:w-auto bg-gray-200 hover:bg-gray-300 text-gray-700 px-6 py-2 rounded-lg font-medium"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Leaves List */}
            <div className="bg-white rounded-lg border border-gray-200 shadow-sm">
              <div className="px-4 sm:px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-medium text-gray-900">
                  {isEmployee ? 'My Leave Requests' : 'All Leave Requests'}
                </h3>
              </div>
              <div className="md:hidden space-y-3 p-4">
                {leaves.length === 0 ? (
                  <div className="text-center text-sm text-gray-500 py-6">
                    No leave requests found
                  </div>
                ) : (
                  leaves.map((leave) => (
                    <div key={leave._id} className="rounded-lg border border-gray-200 bg-white p-3">
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <p className="text-[11px] uppercase text-gray-400">Leave</p>
                          <p className="text-sm font-semibold text-gray-900">{getLeaveTypeLabel(leave.leaveType)}</p>
                          {!isEmployee && (
                            <p className="text-xs text-gray-500">
                              {leave.employee?.name || 'Unknown'} {leave.employee?.employeeId ? `• ${leave.employee?.employeeId}` : ''}
                            </p>
                          )}
                        </div>
                        <span className={`px-2 py-1 text-[11px] font-semibold rounded-full border ${getStatusColor(leave.status)}`}>
                          {leave.status}
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-gray-600">
                        <div>
                          <p className="text-[10px] uppercase text-gray-400">Start</p>
                          <p className="text-gray-900">{formatDate(leave.startDate)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-gray-400">End</p>
                          <p className="text-gray-900">{formatDate(leave.endDate)}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-gray-400">Days</p>
                          <p className="text-gray-900">{leave.totalDays} day{leave.totalDays !== 1 ? 's' : ''}</p>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-gray-400">Payment</p>
                          <span className={`inline-flex px-2 py-1 text-[11px] font-semibold rounded-full ${leave.isPaid !== false
                              ? 'bg-green-100 text-green-800'
                              : 'bg-orange-100 text-orange-800'
                            }`}>
                            {leave.isPaid !== false ? 'Paid' : 'Unpaid'}
                          </span>
                        </div>
                        <div>
                          <p className="text-[10px] uppercase text-gray-400">Applied</p>
                          <p className="text-gray-900">{formatDate(leave.appliedDate)}</p>
                        </div>
                      </div>
                      {isAdmin && leave.status === 'pending' && (
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => {
                              const comments = prompt('Approval comments (optional):')
                              if (comments !== null) {
                                handleApproveReject(leave._id, 'approved', comments)
                              }
                            }}
                            className="flex-1 bg-green-500 text-white px-3 py-2 rounded text-xs font-medium hover:bg-green-600"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => {
                              const comments = prompt('Rejection reason (optional):')
                              if (comments !== null) {
                                handleApproveReject(leave._id, 'rejected', comments)
                              }
                            }}
                            className="flex-1 bg-red-500 text-white px-3 py-2 rounded text-xs font-medium hover:bg-red-600"
                          >
                            Reject
                          </button>
                        </div>
                      )}
                      {isEmployee && leave.status === 'pending' && (
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => handleEdit(leave)}
                            className="flex-1 bg-blue-500 text-white px-3 py-2 rounded text-xs font-medium hover:bg-blue-600"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => handleDelete(leave._id)}
                            className="flex-1 bg-red-500 text-white px-3 py-2 rounded text-xs font-medium hover:bg-red-600"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {!isEmployee && (
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Employee
                        </th>
                      )}
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Type
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Start Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        End Date
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Days
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Payment
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                        Applied Date
                      </th>
                      {isAdmin && (
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Actions
                        </th>
                      )}
                      {isEmployee && (
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                          Actions
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {leaves.length === 0 ? (
                      <tr>
                        <td colSpan={isEmployee ? 8 : 9} className="px-6 py-8 text-center text-gray-500">
                          No leave requests found
                        </td>
                      </tr>
                    ) : (
                      leaves.map((leave) => (
                        <tr key={leave._id} className="hover:bg-gray-50">
                          {!isEmployee && (
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {leave.employee?.name || 'Unknown'}
                              <br />
                              <span className="text-gray-500 text-xs">{leave.employee?.employeeId}</span>
                            </td>
                          )}
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {getLeaveTypeLabel(leave.leaveType)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatDate(leave.startDate)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {formatDate(leave.endDate)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {leave.totalDays} day{leave.totalDays !== 1 ? 's' : ''}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${leave.isPaid !== false
                                ? 'bg-green-100 text-green-800'
                                : 'bg-orange-100 text-orange-800'
                              }`}>
                              {leave.isPaid !== false ? 'Paid' : 'Unpaid'}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(leave.status)}`}>
                              {leave.status}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {formatDate(leave.appliedDate)}
                          </td>
                          {isAdmin && leave.status === 'pending' && (
                            <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                              <button
                                onClick={() => {
                                  const comments = prompt('Approval comments (optional):')
                                  if (comments !== null) {
                                    handleApproveReject(leave._id, 'approved', comments)
                                  }
                                }}
                                className="text-green-600 hover:text-green-700"
                                title="Approve"
                              >
                                <CheckCircle className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() => {
                                  const comments = prompt('Rejection reason (optional):')
                                  if (comments !== null) {
                                    handleApproveReject(leave._id, 'rejected', comments)
                                  }
                                }}
                                className="text-red-600 hover:text-red-700"
                                title="Reject"
                              >
                                <X className="w-5 h-5" />
                              </button>
                            </td>
                          )}
                          {isEmployee && leave.status === 'pending' && (
                            <td className="px-6 py-4 whitespace-nowrap text-sm space-x-2">
                              <button
                                onClick={() => handleEdit(leave)}
                                className="text-blue-600 hover:text-blue-700"
                                title="Edit"
                              >
                                <Edit className="w-5 h-5" />
                              </button>
                              <button
                                onClick={() => handleDelete(leave._id)}
                                className="text-red-600 hover:text-red-700"
                                title="Delete"
                              >
                                <Trash2 className="w-5 h-5" />
                              </button>
                            </td>
                          )}
                          {(isAdmin && leave.status !== 'pending') || (isEmployee && leave.status !== 'pending') ? (
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">
                              -
                            </td>
                          ) : null}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Confirmation Dialog for Leaves > 2 Days */}
      {showConfirmDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Leave Request Confirmation</h3>
            <p className="text-gray-700 mb-4">
              Your leave request is for <strong>{workingDaysCount} working days</strong> (excluding weekends and holidays).
            </p>
            <p className="text-gray-700 mb-6">
              Would you like to proceed with the full leave (which will be deducted from your leave balance), or limit it to 2 working days?
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => handleConfirmLeave(true)}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium"
              >
                Proceed with Full Leave
              </button>
              <button
                onClick={() => handleConfirmLeave(false)}
                className="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded-lg font-medium"
              >
                Limit to 2 Days
              </button>
              <button
                onClick={() => {
                  setShowConfirmDialog(false)
                  setPendingSubmitData(null)
                }}
                className="flex-1 bg-red-200 hover:bg-red-300 text-red-700 px-4 py-2 rounded-lg font-medium"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </DashboardLayout>
  )
}

