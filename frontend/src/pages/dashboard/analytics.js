'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { analyticsAPI, attendanceAPI, employeesAPI } from '../../services/api'
import { AttendanceBarChart, StatusPieChart } from '../../components/AnalyticsChart'
import DashboardLayout from '../../components/DashboardLayout'

export default function Analytics() {
  const { user, hasRole } = useAuth()
  const [activeTab, setActiveTab] = useState('overview') // 'overview' or 'employee'
  const [analytics, setAnalytics] = useState({})
  const [chartData, setChartData] = useState([])
  const [pieData, setPieData] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedPeriod, setSelectedPeriod] = useState('weekly')
  
  // Single Employee Analytics State
  const [employees, setEmployees] = useState([])
  const [selectedEmployee, setSelectedEmployee] = useState(null)
  const [employeeAnalytics, setEmployeeAnalytics] = useState({})
  const [employeeChartData, setEmployeeChartData] = useState([])
  const [employeeLoading, setEmployeeLoading] = useState(false)
  const [employeeSearchTerm, setEmployeeSearchTerm] = useState('')
  const [advancedDays, setAdvancedDays] = useState(30)
  const [advancedInsights, setAdvancedInsights] = useState(null)
  const [advancedLoading, setAdvancedLoading] = useState(true)
  const [advancedError, setAdvancedError] = useState('')
  const isAdminUser = hasRole('admin') || hasRole('hr')
  const advancedOrganization = advancedInsights?.organization || null
  const advancedDepartments = advancedInsights?.departmentInsights || []
  const advancedTopPerformers = advancedInsights?.topPerformers || []
  const advancedRiskEmployees = advancedInsights?.riskEmployees || []
  const advancedTrendline = advancedInsights?.trendline || []
  const advancedTimeframe = advancedInsights?.timeframe || null
  const formatTrendDateLabel = (value) => {
    if (!value) return 'N/A'
    const date = new Date(value)
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    }
    return value
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
    const fetchAnalytics = async () => {
      try {
        setLoading(true)
        setError('')
        
        // For daily period, fetch last 7 days instead of just today
        let reportParams = { period: selectedPeriod }
        if (selectedPeriod === 'daily') {
          const today = new Date()
          const sevenDaysAgo = new Date(today)
          sevenDaysAgo.setDate(today.getDate() - 6) // Last 7 days including today
          
          reportParams = {
            period: 'custom',
            startDate: sevenDaysAgo.toISOString().split('T')[0],
            endDate: today.toISOString().split('T')[0]
          }
        }
        
        const [statsResponse, chartResponse] = await Promise.all([
          retryApiCall(() => analyticsAPI.getDashboardStats()),
          retryApiCall(() => analyticsAPI.getAttendanceReport(reportParams))
        ])
        
        console.log('Stats Response:', statsResponse?.data)
        console.log('Chart Response:', chartResponse?.data)
        
        // Always use dashboard stats for main analytics (totalEmployees, presentToday, etc.)
        let departmentPieData = []

        if (statsResponse?.data?.success && statsResponse.data.data) {
          const statsData = statsResponse.data.data
          setAnalytics({
            totalEmployees: statsData.totalEmployees || 0,
            presentToday: statsData.presentToday || 0,
            lateToday: statsData.lateToday || 0,
            absentToday: statsData.absentToday || 0,
            attendanceRate: statsData.attendanceRate || 0
          })

          if (statsData.departmentStats && Array.isArray(statsData.departmentStats)) {
            departmentPieData = statsData.departmentStats
              .filter(dept => typeof dept.present === 'number' && dept.present >= 0)
              .map(dept => ({
                name: dept.department || dept._id || 'Unknown',
                value: Number(dept.present) || 0
              }))
          }
        } else {
          console.warn('Failed to fetch dashboard stats')
          setAnalytics({
            totalEmployees: 0,
            presentToday: 0,
            lateToday: 0,
            absentToday: 0,
            attendanceRate: 0
          })
        }
        
        // Use attendance report for chart data
        if (chartResponse?.data?.success && chartResponse.data.data) {
          const reportData = chartResponse.data.data
          
          console.log('Report Data:', reportData)
          console.log('Chart Data from API:', reportData.chartData)
          console.log('Selected Period:', selectedPeriod)
          
          // Transform chart data from { date, ... } to { name, ... } format
          if (reportData.chartData && Array.isArray(reportData.chartData) && reportData.chartData.length > 0) {
            console.log('Processing chart data, count:', reportData.chartData.length)
            const transformedChartData = reportData.chartData.map(item => {
              console.log('Processing item:', item)
              let name = item.date || item.name || 'Unknown'
              
              // Format the name based on period and date format
              if (item.date) {
                try {
                  if (selectedPeriod === 'daily') {
                    // For daily period, we're showing last 7 days, format each date nicely
                    if (typeof item.date === 'string' && item.date.match(/^\d{4}-\d{2}-\d{2}$/)) {
                      // It's in YYYY-MM-DD format
                      const date = new Date(item.date + 'T00:00:00')
                      if (!isNaN(date.getTime())) {
                        // Check if it's today
                        const today = new Date()
                        today.setHours(0, 0, 0, 0)
                        const itemDate = new Date(date)
                        itemDate.setHours(0, 0, 0, 0)
                        const isToday = itemDate.getTime() === today.getTime()
                        
                        if (isToday) {
                          name = 'Today'
                        } else {
                          // Format as "Mon, Jan 15" or just "Mon" for compact display
                          name = date.toLocaleDateString('en-US', { 
                            weekday: 'short', 
                            month: 'short', 
                            day: 'numeric' 
                          })
                        }
                      } else {
                        name = item.date
                      }
                    } else {
                      // Try to parse as regular date
                      const date = new Date(item.date)
                      if (!isNaN(date.getTime())) {
                        const today = new Date()
                        today.setHours(0, 0, 0, 0)
                        const itemDate = new Date(date)
                        itemDate.setHours(0, 0, 0, 0)
                        const isToday = itemDate.getTime() === today.getTime()
                        
                        if (isToday) {
                          name = 'Today'
                        } else {
                          name = date.toLocaleDateString('en-US', { 
                            weekday: 'short', 
                            month: 'short', 
                            day: 'numeric' 
                          })
                        }
                      } else {
                        name = item.date
                      }
                    }
                  } else if (selectedPeriod === 'weekly') {
                    // For weekly, check if it's in format YYYY-WWW
                    if (item.date.includes('W')) {
                      const weekMatch = item.date.match(/(\d{4})-W(\d{2})/)
                      if (weekMatch) {
                        name = `Week ${weekMatch[2]}`
                      } else {
                        name = item.date
                      }
                    } else {
                      const date = new Date(item.date)
                      if (!isNaN(date.getTime())) {
                        name = date.toLocaleDateString('en-US', { weekday: 'short' })
                      }
                    }
                  } else if (selectedPeriod === 'monthly') {
                    // For monthly, format as Month Year
                    const date = new Date(item.date + '-01') // Add day to make it valid
                    if (!isNaN(date.getTime())) {
                      name = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                    }
                  }
                } catch (e) {
                  console.warn('Error formatting date:', item.date, e)
                }
              }
              
              if (selectedPeriod === 'daily') {
                return {
                  name: name,
                  early: Number(item.early) || 0,
                  onTime: Number(item.onTime) || 0,
                  late: Number(item.timeLate ?? item.late) || 0,
                  veryLate: Number(item.veryLate) || 0,
                  halfDay: Number(item.halfDay ?? item.statusHalfDay) || 0,
                  checkOuts: Number(item.checkOuts) || 0
                }
              } else {
                return {
                  name: name,
                  present: Number(item.present ?? item.statusPresent) || 0,
                  absent: Number(item.absent ?? item.statusAbsent) || 0,
                  late: Number(item.late ?? item.statusLate) || 0,
                  halfDay: Number(item.halfDay ?? item.statusHalfDay) || 0,
                  leave: Number(item.leave ?? item.statusLeave) || 0
                }
              }
            })
            
            console.log('Transformed chart data:', transformedChartData)
            
            // For daily period, if we only have one data point, make sure it displays
            if (selectedPeriod === 'daily' && transformedChartData.length === 1) {
              console.log('Daily period with single data point:', transformedChartData[0])
            }
            
            setChartData(transformedChartData)
          } else {
            console.warn('No chart data in report or empty array')
            console.warn('chartData type:', typeof reportData.chartData)
            console.warn('chartData value:', reportData.chartData)
            setChartData([])
          }
          
          // Set pie chart data from the report
          if (departmentPieData.length === 0) {
            if (reportData.pieData && Array.isArray(reportData.pieData) && reportData.pieData.length > 0) {
              console.log('Pie data from report (fallback):', reportData.pieData)
              setPieData(reportData.pieData)
            } else {
              console.warn('No pie data available') 
              setPieData([])
            }
          } else {
            setPieData(departmentPieData)
          }
        } else {
          console.warn('Failed to fetch attendance report')
          setChartData([])
          if (departmentPieData.length > 0) {
            setPieData(departmentPieData)
          } else {
            setPieData([])
          }
        }
        
        // Check for errors
        if (!statsResponse?.data?.success && !chartResponse?.data?.success) {
          const errorMsg = chartResponse?.data?.message || statsResponse?.data?.message || 'Failed to fetch analytics data'
          console.error('API Error:', errorMsg)
          setError(errorMsg)
        }
      } catch (err) {
        console.error('Error fetching analytics:', err)
        console.error('Error details:', err.response?.data || err.message)
        
        // Handle different error types
        if (err.response?.status === 429) {
          const retryAfter = err.response.headers['retry-after']
          const waitTime = retryAfter ? `${retryAfter} seconds` : 'a few minutes'
          setError(`Rate limit exceeded. Please wait ${waitTime} and try again, or refresh the page.`)
        } else if (err.response?.status === 401) {
          setError('Unauthorized. Please login again.')
        } else if (err.response?.status >= 500) {
          setError('Server error. Please try again later.')
        } else if (err.code === 'ECONNREFUSED' || err.message?.includes('Network Error')) {
          setError('Cannot connect to server. Please check your connection.')
        } else {
          setError(err.response?.data?.message || err.message || 'Error loading analytics data')
        }
        
        // Set empty data on error (don't show sample data)
        setAnalytics({
          totalEmployees: 0,
          presentToday: 0,
          lateToday: 0,
          absentToday: 0,
          attendanceRate: 0
        })
        setChartData([])
        setPieData([])
      } finally {
        setLoading(false)
      }
    }

    fetchAnalytics()
  }, [selectedPeriod])

  useEffect(() => {
    if (!isAdminUser) {
      setAdvancedInsights(null)
      setAdvancedLoading(false)
      return
    }

    let cancelled = false

    const fetchAdvancedAnalytics = async () => {
      try {
        setAdvancedLoading(true)
        setAdvancedError('')
        const response = await retryApiCall(() =>
          analyticsAPI.getAdvancedAnalytics({ days: advancedDays })
        )
        if (!cancelled) {
          setAdvancedInsights(response?.data?.data || null)
        }
      } catch (err) {
        console.error('Error loading advanced analytics:', err)
        if (!cancelled) {
          const message =
            err.response?.data?.message ||
            err.message ||
            'Failed to load advanced analytics'
          setAdvancedError(message)
          setAdvancedInsights(null)
        }
      } finally {
        if (!cancelled) {
          setAdvancedLoading(false)
        }
      }
    }

    fetchAdvancedAnalytics()

    return () => {
      cancelled = true
    }
  }, [advancedDays, isAdminUser])

  const handlePeriodChange = (period) => {
    setSelectedPeriod(period)
  }

  // Fetch employees list for dropdown
  useEffect(() => {
    const fetchEmployees = async () => {
      if (!user) return
      
      if (user.role === 'admin' || user.role === 'hr') {
        try {
          const response = await retryApiCall(() => employeesAPI.getEmployees())
          if (response?.data?.success) {
            const empData = response.data.data
            const empList = empData.docs || empData.data || empData || []
            setEmployees(empList)
            // Auto-select first employee if available and none selected
            if (empList.length > 0) {
              setSelectedEmployee(prev => prev || empList[0]._id)
            }
          }
        } catch (err) {
          console.error('Error fetching employees:', err)
          if (err.response?.status === 429) {
            console.warn('Rate limit exceeded while fetching employees list')
            // Set empty employees list on rate limit
            setEmployees([])
          }
        }
      } else {
        // For employees, show only themselves
        setEmployees([user])
        setSelectedEmployee(user._id)
      }
    }
    fetchEmployees()
  }, [user])

  // Fetch single employee analytics
  useEffect(() => {
    const fetchEmployeeAnalytics = async () => {
      if (!selectedEmployee || activeTab !== 'employee') return

      try {
        setEmployeeLoading(true)
        setError('')

        // Calculate date range based on selected period
        const today = new Date()
        let startDate = new Date()
        
        if (selectedPeriod === 'daily') {
          startDate.setDate(today.getDate() - 7) // Last 7 days
        } else if (selectedPeriod === 'weekly') {
          startDate.setDate(today.getDate() - 30) // Last 30 days
        } else {
          startDate.setMonth(today.getMonth() - 3) // Last 3 months
        }

        const startDateStr = startDate.toISOString().split('T')[0]
        const endDateStr = today.toISOString().split('T')[0]

        // Fetch employee attendance data with date range and retry logic
        console.log('Fetching employee analytics for:', {
          employeeId: selectedEmployee,
          startDate: startDateStr,
          endDate: endDateStr
        })
        
        const attendanceResponse = await retryApiCall(() => 
          attendanceAPI.getAttendance({
            employeeId: selectedEmployee,
            startDate: startDateStr,
            endDate: endDateStr,
            limit: 1000,
            page: 1
          })
        )

        console.log('Employee attendance response:', attendanceResponse?.data)
        console.log('Response structure:', {
          success: attendanceResponse?.data?.success,
          hasData: !!attendanceResponse?.data?.data,
          dataType: Array.isArray(attendanceResponse?.data?.data) ? 'array' : typeof attendanceResponse?.data?.data,
          dataKeys: attendanceResponse?.data?.data ? Object.keys(attendanceResponse.data.data) : []
        })

        if (attendanceResponse?.data?.success) {
          const responseData = attendanceResponse.data.data
          
          // Handle different response structures:
          // 1. Direct array: data = [...]
          // 2. Paginated: data = { docs: [...], total: ... }
          // 3. Nested paginated: data.data = { docs: [...], total: ... }
          let attendanceList = []
          
          if (Array.isArray(responseData)) {
            attendanceList = responseData
          } else if (responseData?.docs && Array.isArray(responseData.docs)) {
            // Paginated response from mongoose-paginate-v2
            attendanceList = responseData.docs
          } else if (responseData?.data?.docs && Array.isArray(responseData.data.docs)) {
            // Nested paginated response
            attendanceList = responseData.data.docs
          } else if (responseData?.data && Array.isArray(responseData.data)) {
            attendanceList = responseData.data
          } else if (Array.isArray(responseData)) {
            attendanceList = responseData
          }
          
          console.log('Extracted attendance list:', attendanceList.length, 'records')
          console.log('Sample record:', attendanceList[0] ? {
            hasWorkingHours: 'workingHours' in (attendanceList[0] || {}),
            workingHours: attendanceList[0]?.workingHours,
            hasCheckIn: !!attendanceList[0]?.checkIn,
            hasCheckOut: !!attendanceList[0]?.checkOut,
            checkInTime: attendanceList[0]?.checkIn?.time || attendanceList[0]?.checkIn,
            checkOutTime: attendanceList[0]?.checkOut?.time || attendanceList[0]?.checkOut
          } : 'No records')

          // Helper function to calculate working hours from check-in/check-out times
          const calculateWorkingHours = (record) => {
            // If workingHours is already set and > 0, use it
            if (record.workingHours && record.workingHours > 0) {
              return record.workingHours
            }
            
            // Otherwise, calculate from check-in and check-out times
            let checkInTime = null
            let checkOutTime = null
            
            // Handle different data structures
            if (record.checkIn?.time) {
              checkInTime = new Date(record.checkIn.time)
            } else if (record.checkIn) {
              checkInTime = new Date(record.checkIn)
            } else if (record.checkInTime) {
              checkInTime = new Date(record.checkInTime)
            }
            
            if (record.checkOut?.time) {
              checkOutTime = new Date(record.checkOut.time)
            } else if (record.checkOut) {
              checkOutTime = new Date(record.checkOut)
            } else if (record.checkOutTime) {
              checkOutTime = new Date(record.checkOutTime)
            }
            
            // Calculate difference in minutes if both times exist
            if (checkInTime && checkOutTime && !isNaN(checkInTime.getTime()) && !isNaN(checkOutTime.getTime())) {
              const diffInMs = checkOutTime - checkInTime
              const diffInMinutes = Math.floor(diffInMs / (1000 * 60))
              return Math.max(0, diffInMinutes)
            }
            
            return 0
          }

          // Calculate statistics
          const totalDays = attendanceList.length
          const present = attendanceList.filter(a => a.status === 'present').length
          const absent = attendanceList.filter(a => a.status === 'absent').length
          const late = attendanceList.filter(a => a.status === 'late').length
          const halfDay = attendanceList.filter(a => a.status === 'half-day').length
          const leave = attendanceList.filter(a => a.status === 'leave').length
          
          // Calculate working hours with fallback calculation
          const totalWorkingHours = attendanceList.reduce((sum, a) => {
            const hours = calculateWorkingHours(a)
            return sum + hours
          }, 0)
          
          const totalOvertime = attendanceList.reduce((sum, a) => {
            // Use stored overtime or calculate (assuming 8 hours = 480 minutes is standard)
            if (a.overtime && a.overtime > 0) {
              return sum + a.overtime
            }
            const workingHours = calculateWorkingHours(a)
            const standardHours = 480 // 8 hours in minutes
            return sum + Math.max(0, workingHours - standardHours)
          }, 0)
          
          const avgWorkingHours = totalDays > 0 ? totalWorkingHours / totalDays : 0

          // Calculate attendance rate
          const attendanceRate = totalDays > 0 ? (present / totalDays) * 100 : 0

          setEmployeeAnalytics({
            totalDays,
            present,
            absent,
            late,
            halfDay,
            leave,
            totalWorkingHours: Math.round(totalWorkingHours / 60), // Convert to hours
            totalOvertime: Math.round(totalOvertime / 60), // Convert to hours
            avgWorkingHours: Math.round(avgWorkingHours / 60), // Convert to hours
            attendanceRate: Math.round(attendanceRate)
          })

          // Prepare chart data based on period
          let chartData = []
          if (selectedPeriod === 'daily') {
            // Group by date for daily view with timing categories
            const groupedByDate = {}
            attendanceList.forEach(record => {
              const dateStr = new Date(record.date).toISOString().split('T')[0]
              if (!groupedByDate[dateStr]) {
                groupedByDate[dateStr] = { early: 0, onTime: 0, late: 0, veryLate: 0, halfDay: 0 }
              }

              // Check for half-day status first (before timing-based categorization)
              const status = record.status?.toLowerCase()
              if (status === 'half-day' || status === 'halfday') {
                groupedByDate[dateStr].halfDay++
              } else {
                // Only categorize by timing if not half-day
                const checkInTime = record.checkInTime || record.checkIn?.time || record.checkIn
                if (checkInTime) {
                  const checkIn = new Date(checkInTime)
                  if (!isNaN(checkIn.getTime())) {
                    const totalMinutes = checkIn.getHours() * 60 + checkIn.getMinutes()
                    if (totalMinutes < 600) {
                      groupedByDate[dateStr].early++
                    } else if (totalMinutes >= 600 && totalMinutes < 660) {
                      groupedByDate[dateStr].onTime++
                    } else if (totalMinutes >= 660 && totalMinutes < 720) {
                      groupedByDate[dateStr].late++
                    } else {
                      groupedByDate[dateStr].veryLate++
                    }
                  }
                }
              }
            })
            chartData = Object.keys(groupedByDate).sort().slice(-7).map(dateStr => {
              const date = new Date(dateStr)
              return {
                name: date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
                early: groupedByDate[dateStr].early,
                onTime: groupedByDate[dateStr].onTime,
                late: groupedByDate[dateStr].late,
                veryLate: groupedByDate[dateStr].veryLate,
                halfDay: groupedByDate[dateStr].halfDay
              }
            })
          } else if (selectedPeriod === 'weekly') {
            // Group by week
            const groupedByWeek = {}
            attendanceList.forEach(record => {
              const date = new Date(record.date)
              const weekStart = new Date(date.setDate(date.getDate() - date.getDay()))
              const weekKey = weekStart.toISOString().split('T')[0]
              if (!groupedByWeek[weekKey]) {
                groupedByWeek[weekKey] = { present: 0, absent: 0, late: 0, halfDay: 0 }
              }
              const status = record.status?.toLowerCase()
              if (status === 'present') groupedByWeek[weekKey].present++
              if (status === 'absent') groupedByWeek[weekKey].absent++
              if (status === 'late') groupedByWeek[weekKey].late++
              if (status === 'half-day' || status === 'halfday') groupedByWeek[weekKey].halfDay++
            })
            chartData = Object.keys(groupedByWeek).sort().slice(-4).map(weekKey => {
              const date = new Date(weekKey)
              return {
                name: `Week ${date.getDate()}/${date.getMonth() + 1}`,
                present: groupedByWeek[weekKey].present,
                absent: groupedByWeek[weekKey].absent,
                late: groupedByWeek[weekKey].late,
                halfDay: groupedByWeek[weekKey].halfDay
              }
            })
          } else {
            // Group by month
            const groupedByMonth = {}
            attendanceList.forEach(record => {
              const date = new Date(record.date)
              const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
              if (!groupedByMonth[monthKey]) {
                groupedByMonth[monthKey] = { present: 0, absent: 0, late: 0, halfDay: 0 }
              }
              const status = record.status?.toLowerCase()
              if (status === 'present') groupedByMonth[monthKey].present++
              if (status === 'absent') groupedByMonth[monthKey].absent++
              if (status === 'late') groupedByMonth[monthKey].late++
              if (status === 'half-day' || status === 'halfday') groupedByMonth[monthKey].halfDay++
            })
            chartData = Object.keys(groupedByMonth).sort().map(monthKey => {
              const [year, month] = monthKey.split('-')
              return {
                name: new Date(year, parseInt(month) - 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
                present: groupedByMonth[monthKey].present,
                absent: groupedByMonth[monthKey].absent,
                late: groupedByMonth[monthKey].late,
                halfDay: groupedByMonth[monthKey].halfDay
              }
            })
          }

          setEmployeeChartData(chartData)
        } else {
          // No data found or invalid response
          console.warn('No valid attendance data found in response')
          setEmployeeAnalytics({
            totalDays: 0,
            present: 0,
            absent: 0,
            late: 0,
            halfDay: 0,
            leave: 0,
            totalWorkingHours: 0,
            totalOvertime: 0,
            avgWorkingHours: 0,
            attendanceRate: 0
          })
          setEmployeeChartData([])
        }
      } catch (err) {
        console.error('Error fetching employee analytics:', err)
        console.error('Error details:', {
          message: err.message,
          response: err.response?.data,
          status: err.response?.status
        })
        
        // Handle 429 errors gracefully
        if (err.response?.status === 429) {
          const retryAfter = err.response.headers['retry-after']
          const waitTime = retryAfter ? `${retryAfter} seconds` : 'a few minutes'
          setError(`Rate limit exceeded. Please wait ${waitTime} and try again, or refresh the page.`)
          console.warn('Rate limit exceeded while fetching employee analytics')
        } else {
          setError(err.response?.data?.message || err.message || 'Error loading employee analytics')
        }
        
        // Set empty analytics on error
        setEmployeeAnalytics({
          totalDays: 0,
          present: 0,
          absent: 0,
          late: 0,
          halfDay: 0,
          leave: 0,
          totalWorkingHours: 0,
          totalOvertime: 0,
          avgWorkingHours: 0,
          attendanceRate: 0
        })
        setEmployeeChartData([])
      } finally {
        setEmployeeLoading(false)
      }
    }

    fetchEmployeeAnalytics()
  }, [selectedEmployee, selectedPeriod, activeTab])

  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="loading-spinner"></div>
        </div>
      </DashboardLayout>
    )
  }

  const selectedEmployeeData = employees.find(emp => emp._id === selectedEmployee)

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Analytics & Reports</h1>
          <div className="flex space-x-2">
            <button
              onClick={() => handlePeriodChange('daily')}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                selectedPeriod === 'daily'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Daily
            </button>
            <button
              onClick={() => handlePeriodChange('weekly')}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                selectedPeriod === 'weekly'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Weekly
            </button>
            <button
              onClick={() => handlePeriodChange('monthly')}
              className={`px-4 py-2 rounded-lg text-sm font-medium ${
                selectedPeriod === 'monthly'
                  ? 'bg-blue-500 text-white'
                  : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
              }`}
            >
              Monthly
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white shadow rounded-lg">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('overview')}
                className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'overview'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('employee')}
                className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'employee'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Single Employee
              </button>
            </nav>
          </div>
        </div>

        {error && (
          <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {/* Tab Content */}
        {activeTab === 'overview' ? (
          <>
            {/* Overview Tab Content */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <div className="p-2 bg-blue-100 rounded-lg">
                <span className="text-blue-600 text-lg">👥</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">Total Employees</p>
                <p className="text-2xl font-semibold text-gray-900">{analytics.totalEmployees || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <div className="p-2 bg-green-100 rounded-lg">
                <span className="text-green-600 text-lg">✅</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  Present {selectedPeriod === 'daily' ? 'Today' : selectedPeriod === 'weekly' ? 'This Week' : 'This Month'}
                </p>
                <p className="text-2xl font-semibold text-gray-900">{analytics.presentToday || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <div className="p-2 bg-yellow-100 rounded-lg">
                <span className="text-yellow-600 text-lg">⏰</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  Late {selectedPeriod === 'daily' ? 'Today' : selectedPeriod === 'weekly' ? 'This Week' : 'This Month'}
                </p>
                <p className="text-2xl font-semibold text-gray-900">{analytics.lateToday || 0}</p>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <div className="flex items-center">
              <div className="p-2 bg-red-100 rounded-lg">
                <span className="text-red-600 text-lg">❌</span>
              </div>
              <div className="ml-4">
                <p className="text-sm font-medium text-gray-600">
                  Absent {selectedPeriod === 'daily' ? 'Today' : selectedPeriod === 'weekly' ? 'This Week' : 'This Month'}
                </p>
                <p className="text-2xl font-semibold text-gray-900">{analytics.absentToday || 0}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Attendance Trend - {selectedPeriod === 'daily' ? 'Last 7 Days' : selectedPeriod === 'weekly' ? 'This Week (Daily)' : 'This Month (Weekly)'}
            </h3>
            <AttendanceBarChart data={chartData} period={selectedPeriod} />
            {selectedPeriod === 'daily' && (
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
            )}
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Department Distribution</h3>
            <StatusPieChart data={pieData} />
          </div>
        </div>

        {/* Additional Analytics */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Attendance Rate</h3>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>Overall Attendance Rate</span>
                  <span>{analytics.attendanceRate ? Math.round(analytics.attendanceRate) : (analytics.totalEmployees ? Math.round((analytics.presentToday / analytics.totalEmployees) * 100) : 0)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-blue-600 h-2 rounded-full" 
                    style={{ width: `${analytics.attendanceRate ? Math.min(analytics.attendanceRate, 100) : (analytics.totalEmployees ? Math.min((analytics.presentToday / analytics.totalEmployees) * 100, 100) : 0)}%` }}
                  ></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-sm text-gray-600 mb-1">
                  <span>Punctuality Rate</span>
                  <span>{analytics.presentToday ? Math.round(((analytics.presentToday - analytics.lateToday) / analytics.presentToday) * 100) : 0}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-green-600 h-2 rounded-full" 
                    style={{ width: `${analytics.presentToday ? Math.min(((analytics.presentToday - analytics.lateToday) / analytics.presentToday) * 100, 100) : 0}%` }}
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Stats</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">
                  Average {selectedPeriod === 'daily' ? 'Hourly' : selectedPeriod === 'weekly' ? 'Daily' : 'Weekly'} Attendance
                </span>
                <span className="text-sm font-medium text-gray-900">
                  {chartData.length > 0 ? Math.round(chartData.reduce((sum, day) => sum + day.present, 0) / chartData.length) : 0}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">
                  Best {selectedPeriod === 'daily' ? 'Hour' : selectedPeriod === 'weekly' ? 'Day' : 'Week'}
                </span>
                <span className="text-sm font-medium text-gray-900">
                  {chartData.length > 0 ? chartData.reduce((max, day) => day.present > max.present ? day : max, chartData[0])?.name : 'N/A'}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-sm text-gray-600">
                  Total {selectedPeriod === 'daily' ? 'Hours' : selectedPeriod === 'weekly' ? 'Days' : 'Weeks'}
                </span>
                <span className="text-sm font-medium text-gray-900">{chartData.length}</span>
              </div>
            </div>
          </div>
        </div>

        {isAdminUser && (
          <div className="bg-white p-6 rounded-lg shadow space-y-6">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h3 className="text-lg font-medium text-gray-900">Advanced Insights</h3>
                {advancedTimeframe && (
                  <p className="text-sm text-gray-500">
                    Last {advancedTimeframe.days} days · {new Date(advancedTimeframe.start).toLocaleDateString()} - {new Date(advancedTimeframe.end).toLocaleDateString()}
                  </p>
                )}
              </div>
              <div className="flex items-center space-x-2">
                <label htmlFor="advanced-range" className="text-sm text-gray-600">Range</label>
                <select
                  id="advanced-range"
                  value={advancedDays}
                  onChange={(e) => setAdvancedDays(Number(e.target.value))}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  {[7, 30, 60, 90].map((daysOption) => (
                    <option key={daysOption} value={daysOption}>
                      Last {daysOption} days
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {advancedLoading ? (
              <div className="flex items-center justify-center h-40">
                <div className="loading-spinner"></div>
              </div>
            ) : advancedError ? (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded">
                {advancedError}
              </div>
            ) : advancedOrganization ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-4 rounded-lg border border-gray-100 bg-blue-50">
                    <p className="text-sm text-gray-600">Org Attendance Rate</p>
                    <p className="text-2xl font-semibold text-gray-900 mt-1">{advancedOrganization.attendanceRate || 0}%</p>
                  </div>
                  <div className="p-4 rounded-lg border border-gray-100 bg-amber-50">
                    <p className="text-sm text-gray-600">Late Rate</p>
                    <p className="text-2xl font-semibold text-gray-900 mt-1">{advancedOrganization.lateRate || 0}%</p>
                  </div>
                  <div className="p-4 rounded-lg border border-gray-100 bg-emerald-50">
                    <p className="text-sm text-gray-600">Avg Working Hours</p>
                    <p className="text-2xl font-semibold text-gray-900 mt-1">
                      {advancedOrganization.avgWorkingHours ? advancedOrganization.avgWorkingHours.toFixed(1) : 0} hrs
                    </p>
                  </div>
                  <div className="p-4 rounded-lg border border-gray-100 bg-rose-50">
                    <p className="text-sm text-gray-600">Total Absences</p>
                    <p className="text-2xl font-semibold text-gray-900 mt-1">{advancedOrganization.totalAbsences || 0}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-base font-semibold text-gray-900 mb-3">Department Standings</h4>
                    {advancedDepartments.length > 0 ? (
                      <div className="space-y-3">
                        {advancedDepartments.slice(0, 5).map((dept) => (
                          <div key={dept.department} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                            <div>
                              <p className="font-medium text-gray-900">{dept.department || 'Unknown'}</p>
                              <p className="text-xs text-gray-500">Late rate {dept.lateRate ? dept.lateRate.toFixed(1) : 0}%</p>
                            </div>
                            <div className="text-right">
                              <p className="text-base font-semibold text-gray-900">{dept.attendanceRate ? dept.attendanceRate.toFixed(1) : 0}%</p>
                              <p className="text-xs text-gray-500">Attendance</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No department insights yet.</p>
                    )}
                  </div>
                  <div>
                    <h4 className="text-base font-semibold text-gray-900 mb-3">Top Performers</h4>
                    {advancedTopPerformers.length > 0 ? (
                      <div className="space-y-3">
                        {advancedTopPerformers.map((performer) => (
                          <div key={performer.id} className="p-3 border border-gray-100 rounded-lg flex justify-between">
                            <div>
                              <p className="font-medium text-gray-900">{performer.name}</p>
                              <p className="text-xs text-gray-500">{performer.department || 'General'}</p>
                            </div>
                            <div className="text-right text-sm text-gray-600">
                              <p>Attendance {performer.attendanceRate || 0}%</p>
                              <p>Late {performer.lateRate || 0}%</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No standout performers yet.</p>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-base font-semibold text-gray-900 mb-3">At-Risk Employees</h4>
                    {advancedRiskEmployees.length > 0 ? (
                      <div className="space-y-3">
                        {advancedRiskEmployees.map((risk) => (
                          <div key={risk.id} className="p-3 border border-rose-200 rounded-lg bg-rose-50">
                            <div className="flex justify-between">
                              <div>
                                <p className="font-medium text-gray-900">{risk.name}</p>
                                <p className="text-xs text-gray-500">{risk.department || 'General'}</p>
                              </div>
                              <span className="text-xs font-semibold text-rose-600">{risk.riskReason}</span>
                            </div>
                            <div className="mt-2 text-xs text-gray-600 flex flex-wrap gap-4">
                              <span>Attendance {risk.attendanceRate || 0}%</span>
                              <span>Longest absence streak {risk.longestAbsentStreak || 0} days</span>
                              <span>Late {risk.lateRate || 0}%</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">No risk indicators detected.</p>
                    )}
                  </div>

                  <div>
                    <h4 className="text-base font-semibold text-gray-900 mb-3">Attendance Trendline</h4>
                    {advancedTrendline.length > 0 ? (
                      <div className="space-y-2">
                        {advancedTrendline.slice(-7).map((item) => (
                          <div key={item.date} className="flex items-center justify-between text-sm border-b border-gray-100 pb-2">
                            <span className="font-medium text-gray-700">{formatTrendDateLabel(item.date)}</span>
                            <span className="text-gray-600">
                              <span className="text-green-600 font-semibold">{item.present}</span> present
                            </span>
                            <span className="text-gray-500">
                              <span className="text-rose-500 font-semibold">{item.absent || 0}</span> absent
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-500">Trendline data unavailable.</p>
                    )}
                  </div>
                </div>
              </>
            ) : (
              <p className="text-sm text-gray-500">No advanced analytics available for the selected range.</p>
            )}
          </div>
        )}
          </>
        ) : (
          <>
            {/* Single Employee Tab Content */}
            <div className="bg-white p-6 rounded-lg shadow">
              <div className="mb-6">
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
                      className="w-full md:w-64 px-4 py-2 pl-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
                    value={selectedEmployee || ''}
                    onChange={(e) => setSelectedEmployee(e.target.value)}
                    className="w-full md:w-64 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    disabled={employeeLoading}
                  >
                    <option value="">Select an employee...</option>
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
                          {emp.name} {emp.employeeId ? `(${emp.employeeId})` : ''}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {employeeLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="loading-spinner"></div>
                </div>
              ) : selectedEmployee && selectedEmployeeData ? (
                <div className="space-y-6">
                  {/* Employee Info */}
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <h2 className="text-xl font-semibold text-gray-900">{selectedEmployeeData.name}</h2>
                    <div className="mt-2 text-sm text-gray-600">
                      {selectedEmployeeData.employeeId && <span>ID: {selectedEmployeeData.employeeId}</span>}
                      {selectedEmployeeData.department && <span className="ml-4">Department: {selectedEmployeeData.department}</span>}
                      {selectedEmployeeData.position && <span className="ml-4">Position: {selectedEmployeeData.position}</span>}
                    </div>
                  </div>

                  {/* Employee Summary Cards */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    <div className="bg-white p-6 rounded-lg shadow border-l-4 border-green-500">
                      <div className="flex items-center">
                        <div className="p-2 bg-green-100 rounded-lg">
                          <span className="text-green-600 text-lg">✅</span>
                        </div>
                        <div className="ml-4">
                          <p className="text-sm font-medium text-gray-600">Present Days</p>
                          <p className="text-2xl font-semibold text-gray-900">{employeeAnalytics.present || 0}</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow border-l-4 border-red-500">
                      <div className="flex items-center">
                        <div className="p-2 bg-red-100 rounded-lg">
                          <span className="text-red-600 text-lg">❌</span>
                        </div>
                        <div className="ml-4">
                          <p className="text-sm font-medium text-gray-600">Absent Days</p>
                          <p className="text-2xl font-semibold text-gray-900">{employeeAnalytics.absent || 0}</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow border-l-4 border-yellow-500">
                      <div className="flex items-center">
                        <div className="p-2 bg-yellow-100 rounded-lg">
                          <span className="text-yellow-600 text-lg">⏰</span>
                        </div>
                        <div className="ml-4">
                          <p className="text-sm font-medium text-gray-600">Late Days</p>
                          <p className="text-2xl font-semibold text-gray-900">{employeeAnalytics.late || 0}</p>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow border-l-4 border-blue-500">
                      <div className="flex items-center">
                        <div className="p-2 bg-blue-100 rounded-lg">
                          <span className="text-blue-600 text-lg">📊</span>
                        </div>
                        <div className="ml-4">
                          <p className="text-sm font-medium text-gray-600">Attendance Rate</p>
                          <p className="text-2xl font-semibold text-gray-900">{employeeAnalytics.attendanceRate || 0}%</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Employee Charts */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-lg shadow">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">
                        Attendance Trend - {selectedPeriod === 'daily' ? 'Last 7 Days' : selectedPeriod === 'weekly' ? 'Last 4 Weeks' : 'Last 3 Months'}
                      </h3>
                      {employeeChartData.length > 0 ? (
                        <AttendanceBarChart data={employeeChartData} period={selectedPeriod} />
                      ) : (
                        <div className="flex items-center justify-center h-64 text-gray-500">
                          No attendance data available for the selected period
                        </div>
                      )}
                      {selectedPeriod === 'daily' && (
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
                      )}
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Status Distribution</h3>
                      {employeeAnalytics.totalDays > 0 ? (
                        <StatusPieChart data={[
                          { name: 'Present', value: employeeAnalytics.present || 0 },
                          { name: 'Absent', value: employeeAnalytics.absent || 0 },
                          { name: 'Late', value: employeeAnalytics.late || 0 },
                          { name: 'Half Day', value: employeeAnalytics.halfDay || 0 },
                          { name: 'Leave', value: employeeAnalytics.leave || 0 }
                        ].filter(item => item.value > 0)} />
                      ) : (
                        <div className="flex items-center justify-center h-64 text-gray-500">
                          No data available
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Additional Employee Stats */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    <div className="bg-white p-6 rounded-lg shadow">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Working Hours</h3>
                      <div className="space-y-4">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Total Working Hours</span>
                          <span className="text-sm font-medium text-gray-900">{employeeAnalytics.totalWorkingHours || 0} hrs</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Average Daily Hours</span>
                          <span className="text-sm font-medium text-gray-900">{employeeAnalytics.avgWorkingHours || 0} hrs</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Total Overtime</span>
                          <span className="text-sm font-medium text-gray-900">{employeeAnalytics.totalOvertime || 0} hrs</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-white p-6 rounded-lg shadow">
                      <h3 className="text-lg font-medium text-gray-900 mb-4">Quick Stats</h3>
                      <div className="space-y-3">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Total Days Tracked</span>
                          <span className="text-sm font-medium text-gray-900">{employeeAnalytics.totalDays || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Half Days</span>
                          <span className="text-sm font-medium text-gray-900">{employeeAnalytics.halfDay || 0}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Leave Days</span>
                          <span className="text-sm font-medium text-gray-900">{employeeAnalytics.leave || 0}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  {selectedEmployee ? 'Loading employee data...' : 'Please select an employee to view their analytics'}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </DashboardLayout>
  )
}
