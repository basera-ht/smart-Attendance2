'use client'
import { useEffect, useState, useRef } from 'react'
import { attendanceAPI, employeesAPI, leavesAPI, holidaysAPI } from '../services/api'
import { useAuth } from '../hooks/useAuth'
import { isHoliday, isFixedHoliday, formatDateForComparison, shouldExcludeFromLeave } from '../utils/holidays'
import InlineAlert from './InlineAlert'

export default function AttendanceSheetView({ isAdmin, selectedMonth, setSelectedMonth }) {
    const { user, hasRole } = useAuth()
    // Lifted state: const [selectedMonth, setSelectedMonth] = useState(new Date()) 
    const [attendanceData, setAttendanceData] = useState({})
    const [leaveData, setLeaveData] = useState({})
    const [leaveObjects, setLeaveObjects] = useState({})
    const [employees, setEmployees] = useState([])
    const [loading, setLoading] = useState(true)
    const [downloadingExcel, setDownloadingExcel] = useState(false)
    const [pageAlert, setPageAlert] = useState(null)
    const [searchTerm, setSearchTerm] = useState('')
    const [departmentFilter, setDepartmentFilter] = useState('All Departments')
    const [fetchedHolidayIds, setFetchedHolidayIds] = useState([])

    // Interactive States
    const [editingCell, setEditingCell] = useState(null) // { employeeId, day, dateStr }
    const [actionLoading, setActionLoading] = useState({})
    const dropdownRef = useRef(null)
    const [dropdownPosition, setDropdownPosition] = useState({ left: 0, top: 0 })
    const editingCellRef = useRef(null)

    // Derived state for filtered employees
    const filteredEmployees = employees.filter(emp => {
        const matchesSearch = emp.name.toLowerCase().includes(searchTerm.toLowerCase())
        const matchesDept = departmentFilter === 'All Departments' || emp.department === departmentFilter
        return matchesSearch && matchesDept
    })

    // Departments list
    const departments = ['All Departments', ...new Set(employees.map(e => e.department).filter(Boolean))]

    const showPageAlert = (message, type = 'info') => {
        setPageAlert({ message, type })
        setTimeout(() => setPageAlert(null), 6000)
    }

    // Effect to close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (editingCell && dropdownRef.current && !dropdownRef.current.contains(event.target)) {
                setEditingCell(null)
            }
        }
        document.addEventListener('mousedown', handleClickOutside)
        return () => document.removeEventListener('mousedown', handleClickOutside)
    }, [editingCell])

    // Update dropdown position when scrolling
    useEffect(() => {
        const updatePos = () => {
            if (editingCell && editingCellRef.current) {
                const rect = editingCellRef.current.getBoundingClientRect()
                setDropdownPosition({
                    left: rect.left + (rect.width / 2) - 70,
                    top: rect.bottom + 4
                })
            }
        }
        window.addEventListener('scroll', updatePos, true)
        window.addEventListener('resize', updatePos)
        updatePos()
        return () => {
            window.removeEventListener('scroll', updatePos, true)
            window.removeEventListener('resize', updatePos)
        }
    }, [editingCell])

    useEffect(() => {
        if (user || isAdmin) {
            fetchData()
        }
    }, [selectedMonth, isAdmin, user])

    // ... (Helper functions: toLocalDateString, getTodayDateString from before)
    const toLocalDateString = (value) => {
        if (!value) return null
        try {
            const date = new Date(value)
            if (!Number.isNaN(date.getTime())) return formatDateForComparison(date)
        } catch (err) { }
        if (typeof value === 'string' && value.includes('T')) return value.split('T')[0]
        return value
    }

    const getTodayDateString = () => new Date().toISOString().split('T')[0]

    const fetchData = async () => {
        try {
            setLoading(true)
            const year = selectedMonth.getFullYear()
            const month = selectedMonth.getMonth()
            const startDate = new Date(year, month, 1)
            const endDate = new Date(year, month + 1, 0)

            if (isAdmin) {
                const empResponse = await employeesAPI.getEmployees()
                if (empResponse.data?.success) {
                    const empList = empResponse.data.data.docs || empResponse.data.data.data || empResponse.data.data || []
                    setEmployees(empList.map(emp => ({ ...emp, _id: emp._id || emp.id })))
                }
            } else if (user) {
                setEmployees([user])
            }

            try {
                const holidaysResponse = await holidaysAPI.getSelectedHolidays(year)
                if (holidaysResponse?.data?.success) setFetchedHolidayIds(holidaysResponse.data.data || [])
            } catch (err) { }

            const leavesResponse = await leavesAPI.getLeaves({
                startDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0],
                limit: 1000
            })

            if (leavesResponse.data?.success) {
                const leaves = leavesResponse.data.data?.docs || []
                const organized = {}
                const leaveObjectsMap = {}

                leaves.forEach(leave => {
                    const empId = leave.employee?._id || leave.employee?.id || leave.employeeId || 'unknown'
                    const start = new Date(leave.startDate)
                    const end = new Date(leave.endDate)

                    if (!organized[empId]) { organized[empId] = {}; leaveObjectsMap[empId] = {} }

                    const currentDate = new Date(start)
                    while (currentDate <= end) {
                        const dateStr = formatDateForComparison(currentDate)
                        if (!leaveObjectsMap[empId][dateStr]) leaveObjectsMap[empId][dateStr] = []
                        leaveObjectsMap[empId][dateStr].push(leave)

                        if (!shouldExcludeFromLeave(dateStr, fetchedHolidayIds)) {
                            let leaveCode = 'UL'
                            if (leave.isPaid === false) leaveCode = 'UL'
                            else if (leave.leaveType === 'vacation') leaveCode = 'PL'
                            else if (leave.leaveType === 'sick') leaveCode = 'ML'
                            else leaveCode = 'PL'
                            organized[empId][dateStr] = leaveCode
                        }
                        currentDate.setDate(currentDate.getDate() + 1)
                    }
                })
                setLeaveData(organized)
                setLeaveObjects(leaveObjectsMap)
            }

            const attendanceResponse = await attendanceAPI.getAttendance({
                startDate: startDate.toISOString().split('T')[0],
                endDate: endDate.toISOString().split('T')[0],
                limit: 2000
            })

            if (attendanceResponse.data?.success) {
                const data = attendanceResponse.data.data
                const attendanceList = data.docs || data.data || data || []
                const organized = {}
                attendanceList.forEach(record => {
                    const empId = record.employee?._id || record.employee || 'unknown'
                    const dateStr = toLocalDateString(record.date)
                    if (!dateStr) return
                    if (!organized[empId]) organized[empId] = {}
                    organized[empId][dateStr] = {
                        status: record.status || (record.checkIn?.time ? 'present' : 'absent'),
                        checkIn: record.checkIn?.time,
                        checkOut: record.checkOut?.time
                    }
                })
                setAttendanceData(organized)
            }

        } catch (error) {
            console.error('Error fetching data:', error)
            showPageAlert('Failed to load data', 'error')
        } finally {
            setLoading(false)
        }
    }

    const getDaysInMonth = () => {
        const year = selectedMonth.getFullYear()
        const month = selectedMonth.getMonth()
        const daysInMonth = new Date(year, month + 1, 0).getDate()
        const days = []
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day)
            days.push({
                day,
                date,
                dateStr: formatDateForComparison(date),
                dayName: date.toLocaleDateString('en-US', { weekday: 'short' }).substring(0, 3)
            })
        }
        return days
    }

    const getCellStatus = (employeeId, dateStr) => {
        const holiday = isHoliday(dateStr, true)
        if (holiday) return { code: 'H', type: 'holiday', name: holiday.name }
        const empLeave = leaveData[employeeId]
        if (empLeave && empLeave[dateStr]) return { code: empLeave[dateStr], type: 'leave' }
        const empAtt = attendanceData[employeeId]
        if (empAtt && empAtt[dateStr]) {
            const status = empAtt[dateStr].status
            if (status === 'present') return { code: 'P', type: 'present' }
            if (status === 'half-day') return { code: 'HD', type: 'half-day' }
            if (status === 'absent') return { code: 'A', type: 'absent' }
            return { code: status.substring(0, 2).toUpperCase(), type: 'other' }
        }
        const date = new Date(dateStr)
        const dayOfWeek = date.getDay()
        if (dayOfWeek === 0 || dayOfWeek === 6) return { code: '', type: 'weekend' }
        return { code: '', type: 'empty' }
    }

    const getCellColor = (statusObj) => {
        switch (statusObj.type) {
            case 'present': return 'bg-green-100 text-green-800'
            case 'absent': return 'bg-red-50 text-red-800'
            case 'leave': return 'bg-red-200 text-red-900'
            case 'half-day': return 'bg-purple-100 text-purple-800'
            case 'holiday': return 'bg-yellow-100 text-yellow-800'
            case 'weekend': return 'bg-gray-100'
            default: return 'bg-white'
        }
    }

    // --- INTERACTION HANDLERS ---

    const handleCellClick = (employeeId, dayObj, e) => {
        if (!isAdmin) return

        const { dateStr } = dayObj
        const todayStr = getTodayDateString()

        const isPast = dateStr < todayStr
        const isFuture = dateStr > todayStr
        const isToday = dateStr === todayStr

        // Allow editing if it's today (full access) or if there's a leave (any day)
        // Or if the user wants to correct past attendance (Admin Feature)
        // For now, let's match MonthlyCalendarView: "canEditStatus = isAdminUser && isTodayDate && !isPast && !isFuture && !holiday"
        // But user requested "same as old one", which usually implies these restrictions.

        const holiday = isHoliday(dateStr, true)
        const canEditStatus = isAdmin && isToday && !holiday

        if (editingCell && editingCell.dateStr === dateStr && editingCell.employeeId === employeeId) {
            setEditingCell(null)
            return
        }

        if (canEditStatus) {
            setEditingCell({ employeeId, day: dayObj.day, dateStr })
        }
    }

    const handleUpdateStatus = async (employeeId, dateStr, status) => {
        const loadingKey = `update-${employeeId}-${dateStr}`
        setActionLoading(prev => ({ ...prev, [loadingKey]: true }))
        try {
            const response = await attendanceAPI.adminUpdateStatus({
                employeeId,
                date: dateStr,
                status,
                notes: `Updated from sheet view by ${user?.name}`
            })
            if (response.data?.success) {
                setAttendanceData(prev => ({
                    ...prev,
                    [employeeId]: {
                        ...prev[employeeId],
                        [dateStr]: { ...prev[employeeId]?.[dateStr], status }
                    }
                }))
                setEditingCell(null)
                showPageAlert('Status updated', 'success')
            }
        } catch (err) {
            showPageAlert('Update failed', 'error')
        } finally {
            setActionLoading(prev => ({ ...prev, [loadingKey]: false }))
        }
    }

    const handleDownloadExcel = async () => {
        // ... (Existing implementation)
        if (downloadingExcel) return
        try {
            setDownloadingExcel(true)
            const year = selectedMonth.getFullYear()
            const month = selectedMonth.getMonth()
            const response = await attendanceAPI.exportMonthlyExcel(year, month)
            const blob = new Blob([response.data], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
            const url = window.URL.createObjectURL(blob)
            const link = document.createElement('a')
            link.href = url
            link.download = `Attendance_${month + 1}_${year}.xlsx`
            document.body.appendChild(link)
            link.click()
            document.body.removeChild(link)
        } catch (err) {
            showPageAlert('Download failed', 'error')
        } finally {
            setDownloadingExcel(false)
        }
    }

    const days = getDaysInMonth()
    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

    if (loading) return <div className="p-8 text-center text-gray-500">Loading attendance sheet...</div>

    return (
        <div className="bg-white rounded-lg border border-gray-200 shadow-sm flex flex-col h-full relative">
            {pageAlert && (
                <div className="absolute top-4 right-4 z-50 max-w-sm">
                    <InlineAlert message={pageAlert.message} type={pageAlert.type} onClose={() => setPageAlert(null)} />
                </div>
            )}

            {/* HEADER */}
            <div className="p-4 border-b border-gray-200 bg-gray-50 space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Date Range</label>
                        <div className="bg-white border border-gray-300 rounded px-3 py-2 text-sm text-gray-700 flex items-center">
                            {monthNames[selectedMonth.getMonth()]} 1 - {days.length}, {selectedMonth.getFullYear()}
                        </div>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Department</label>
                        <select
                            value={departmentFilter}
                            onChange={(e) => setDepartmentFilter(e.target.value)}
                            className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm text-gray-700"
                        >
                            {departments.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wider mb-1">Employee Name</label>
                        <input
                            type="text"
                            placeholder="Search Employee"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full bg-white border border-gray-300 rounded px-3 py-2 text-sm text-gray-700"
                        />
                    </div>
                </div>
                <div className="flex justify-between items-center pt-2">
                    <h2 className="text-xl font-bold text-gray-800">
                        {monthNames[selectedMonth.getMonth()]} {selectedMonth.getFullYear()}
                    </h2>
                    <div className="flex space-x-2">
                        <button onClick={() => setSelectedMonth(new Date(selectedMonth.setMonth(selectedMonth.getMonth() - 1)))} className="px-3 py-1 bg-gray-200 rounded text-sm hover:bg-gray-300">Previous</button>
                        <button onClick={() => setSelectedMonth(new Date())} className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700">Current</button>
                        <button onClick={() => setSelectedMonth(new Date(selectedMonth.setMonth(selectedMonth.getMonth() + 1)))} className="px-3 py-1 bg-gray-200 rounded text-sm hover:bg-gray-300">Next</button>
                        <button onClick={handleDownloadExcel} disabled={downloadingExcel} className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-700 ml-2">Excel</button>
                    </div>
                </div>
            </div>

            {/* TABLE */}
            <div className="flex-1 overflow-auto">
                <table className="min-w-full border-collapse">
                    <thead className="bg-gray-100 sticky top-0 z-10">
                        <tr>
                            <th className="border border-gray-300 px-2 py-3 text-left text-xs font-bold text-gray-700 sticky left-0 z-20 bg-gray-100 min-w-[120px]">
                                Employee
                            </th>
                            {days.map(d => {
                                const isWeekend = d.dayName === 'Sat' || d.dayName === 'Sun'
                                return (
                                    <th key={d.day} className={`border border-gray-300 px-1 py-2 text-center min-w-[40px] ${isWeekend ? 'bg-orange-50' : ''}`}>
                                        <div className="text-[10px] text-gray-500 uppercase">{d.dayName}</div>
                                        <div className={`text-sm font-bold ${isWeekend ? 'text-red-500' : 'text-gray-800'}`}>{d.day}</div>
                                    </th>
                                )
                            })}
                            <th className="border border-gray-300 px-2 py-3 text-center text-xs font-bold text-gray-700 min-w-[80px]">Total</th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredEmployees.map((emp) => {
                            let pCount = 0
                            const rowCells = days.map(d => {
                                const status = getCellStatus(emp._id, d.dateStr)
                                if (status.type === 'present' || status.type === 'half-day') pCount++
                                return { date: d, status }
                            })

                            return (
                                <tr key={emp._id} className="hover:bg-blue-50">
                                    <td className="border border-gray-300 px-3 py-2 text-sm font-medium text-gray-900 sticky left-0 z-10 bg-white">
                                        {emp.name}
                                        <div className="text-[10px] text-gray-500">{emp.position || emp.department}</div>
                                    </td>
                                    {rowCells.map(({ date, status }) => {
                                        const isEditing = editingCell?.employeeId === emp._id && editingCell?.dateStr === date.dateStr

                                        return (
                                            <td
                                                key={date.day}
                                                ref={isEditing ? editingCellRef : null}
                                                className={`border border-gray-300 px-1 py-2 text-center text-xs font-bold ${getCellColor(status)} ${isAdmin ? 'cursor-pointer hover:ring-2 hover:ring-blue-400' : ''}`}
                                                onClick={(e) => handleCellClick(emp._id, date, e)}
                                            >
                                                {status.code}
                                                {isEditing && (
                                                    <div
                                                        ref={dropdownRef}
                                                        className="fixed z-[100] bg-white border border-gray-200 shadow-xl rounded p-2 flex flex-col gap-2 min-w-[120px]"
                                                        style={{ left: dropdownPosition.left, top: dropdownPosition.top }}
                                                        onClick={(e) => e.stopPropagation()}
                                                    >
                                                        <button onClick={() => handleUpdateStatus(emp._id, date.dateStr, 'present')} className="px-2 py-1 bg-green-100 hover:bg-green-200 text-green-800 rounded text-xs font-semibold">Present</button>
                                                        <button onClick={() => handleUpdateStatus(emp._id, date.dateStr, 'half-day')} className="px-2 py-1 bg-purple-100 hover:bg-purple-200 text-purple-800 rounded text-xs font-semibold">Half Day</button>
                                                        <button onClick={() => handleUpdateStatus(emp._id, date.dateStr, 'absent')} className="px-2 py-1 bg-red-100 hover:bg-red-200 text-red-800 rounded text-xs font-semibold">Absent</button>
                                                        <button onClick={() => setEditingCell(null)} className="px-2 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs">Cancel</button>
                                                    </div>
                                                )}
                                            </td>
                                        )
                                    })}
                                    <td className="border border-gray-300 px-2 py-2 text-center text-xs bg-gray-50 font-bold text-green-700">{pCount}</td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    )
}
