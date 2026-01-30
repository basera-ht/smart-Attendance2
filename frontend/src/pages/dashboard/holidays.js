'use client'
import { useState, useEffect } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import { Calendar, CalendarDays, CheckCircle2, Save } from 'lucide-react'
import { getFixedHolidays, getOptionalHolidays } from '../../utils/holidays'
import { holidaysAPI } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'

export default function HolidaysPage() {
  const { hasRole } = useAuth()
  const isAdmin = hasRole('admin') || hasRole('hr')
  const [activeTab, setActiveTab] = useState('fixed') // 'fixed' or 'optional'
  const [selectedHolidayIds, setSelectedHolidayIds] = useState([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState({ type: '', text: '' })
  const currentYear = new Date().getFullYear()
  const fixedHolidays = getFixedHolidays(currentYear)
  const optionalHolidays = getOptionalHolidays(currentYear)
  const optionalHolidayIdSet = new Set(optionalHolidays.map(holiday => holiday.id))

  // Group holidays by month for better display
  const groupByMonth = (holidays) => {
    return holidays.reduce((acc, holiday) => {
      if (!acc[holiday.month]) {
        acc[holiday.month] = []
      }
      acc[holiday.month].push(holiday)
      return acc
    }, {})
  }

  const fixedByMonth = groupByMonth(fixedHolidays)
  const optionalByMonth = groupByMonth(optionalHolidays)

  // Fetch selected holidays on mount and when switching to optional tab (all users can view)
  useEffect(() => {
    if (activeTab === 'optional') {
      fetchSelectedHolidays()
    }
  }, [activeTab])

  const fetchSelectedHolidays = async () => {
    try {
      setLoading(true)
      const response = await holidaysAPI.getSelectedHolidays(currentYear)
      if (response?.data?.success) {
        const incomingIds = response.data.data || []
        const filteredIds = incomingIds.filter(id => optionalHolidayIdSet.has(id))
        setSelectedHolidayIds(filteredIds)
      }
    } catch (error) {
      console.error('Error fetching selected holidays:', error)
      setMessage({ type: 'error', text: 'Failed to load selected holidays' })
    } finally {
      setLoading(false)
    }
  }

  const handleHolidayToggle = (holidayId) => {
    const holidayIdNum = parseInt(holidayId)
    if (selectedHolidayIds.includes(holidayIdNum)) {
      // Deselect
      setSelectedHolidayIds(selectedHolidayIds.filter(id => id !== holidayIdNum))
    } else {
      // Select (max 2)
      if (selectedHolidayIds.length >= 2) {
        setMessage({ type: 'error', text: 'Maximum 2 optional holidays can be selected per year' })
        setTimeout(() => setMessage({ type: '', text: '' }), 3000)
        return
      }
      setSelectedHolidayIds([...selectedHolidayIds, holidayIdNum])
    }
    // Clear message when selection changes
    setMessage({ type: '', text: '' })
  }

  const handleSave = async () => {
    try {
      setSaving(true)
      const filteredIds = selectedHolidayIds.filter(id => optionalHolidayIdSet.has(id))
      const response = await holidaysAPI.setSelectedHolidays(filteredIds, currentYear)
      if (response?.data?.success) {
        setMessage({ type: 'success', text: 'Selected holidays saved successfully!' })
        setTimeout(() => setMessage({ type: '', text: '' }), 3000)
      } else {
        setMessage({ type: 'error', text: response?.data?.message || 'Failed to save selected holidays' })
        setTimeout(() => setMessage({ type: '', text: '' }), 3000)
      }
    } catch (error) {
      console.error('Error saving selected holidays:', error)
      setMessage({ type: 'error', text: error?.response?.data?.message || 'Failed to save selected holidays' })
      setTimeout(() => setMessage({ type: '', text: '' }), 3000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Holiday List {currentYear}</h1>
            <p className="text-gray-600 mt-1">Lushai Technologies & Consulting Pvt. Ltd.</p>
          </div>
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <CalendarDays size={20} className="text-blue-600" />
            <span>{currentYear}</span>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white shadow rounded-lg">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('fixed')}
                className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'fixed'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Fixed Holidays ({fixedHolidays.length})
              </button>
              <button
                onClick={() => setActiveTab('optional')}
                className={`py-4 px-6 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'optional'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Optional Holidays ({optionalHolidays.length})
                <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded">
                  2 can be availed
                </span>
              </button>
            </nav>
          </div>
        </div>

        {/* Tab Content */}
        {activeTab === 'fixed' ? (
          <div className="space-y-6">
            {/* Summary Card */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center space-x-2">
                <Calendar className="text-blue-600" size={20} />
                <span className="font-semibold text-blue-900">Total Fixed Holidays: {fixedHolidays.length}</span>
              </div>
            </div>

            {/* Holidays by Month */}
            {Object.keys(fixedByMonth).sort((a, b) => {
              const months = ["January", "February", "March", "April", "May", "June", 
                             "July", "August", "September", "October", "November", "December"]
              return months.indexOf(a) - months.indexOf(b)
            }).map(month => (
              <div key={month} className="bg-white shadow rounded-lg overflow-hidden">
                <div className="bg-gradient-to-r from-blue-500 to-blue-600 px-6 py-3">
                  <h3 className="text-lg font-semibold text-white">{month}</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Sl. No.
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Holiday Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Day
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {fixedByMonth[month].map((holiday, index) => (
                        <tr key={holiday.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {holiday.id}
                          </td>
                          <td className="px-6 py-4 text-sm font-medium text-gray-900">
                            {holiday.name}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {holiday.date}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {holiday.day}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Summary Card */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Calendar className="text-yellow-600" size={20} />
                  <span className="font-semibold text-yellow-900">
                    Total Optional Holidays: {optionalHolidays.length}
                  </span>
                  <span className="ml-4 text-sm text-yellow-800">
                    Note: 2 optional leaves can be availed in a year
                  </span>
                </div>
                {isAdmin && (
                  <div className="flex items-center space-x-4">
                    <span className="text-sm text-yellow-800">
                      Selected: {selectedHolidayIds.length} / 2
                    </span>
                    <button
                      onClick={handleSave}
                      disabled={saving || loading}
                      className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white px-4 py-2 rounded-lg font-medium flex items-center space-x-2 transition-colors"
                    >
                      <Save className="w-4 h-4" />
                      <span>{saving ? 'Saving...' : 'Save Selection'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Message Display */}
            {message.text && (
              <div className={`p-4 rounded-lg ${
                message.type === 'success' 
                  ? 'bg-green-50 border border-green-200 text-green-700' 
                  : 'bg-red-50 border border-red-200 text-red-700'
              }`}>
                {message.text}
              </div>
            )}

            {/* Holidays by Month */}
            {Object.keys(optionalByMonth).sort((a, b) => {
              const months = ["January", "February", "March", "April", "May", "June", 
                             "July", "August", "September", "October", "November", "December"]
              return months.indexOf(a) - months.indexOf(b)
            }).map(month => (
              <div key={month} className="bg-white shadow rounded-lg overflow-hidden">
                <div className="bg-gradient-to-r from-yellow-500 to-yellow-600 px-6 py-3">
                  <h3 className="text-lg font-semibold text-white">{month}</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Sl. No.
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Holiday Name
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Day
                        </th>
                        {isAdmin ? (
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Select
                          </th>
                        ) : (
                          <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Status
                          </th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {optionalByMonth[month].map((holiday) => {
                        const isSelected = selectedHolidayIds.includes(holiday.id)
                        return (
                          <tr 
                            key={holiday.id} 
                            className={`hover:bg-gray-50 ${isSelected ? 'bg-yellow-50' : ''}`}
                          >
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                              {holiday.id}
                            </td>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">
                              {holiday.name}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {holiday.date}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                              {holiday.day}
                            </td>
                            {isAdmin ? (
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                <label className="flex items-center justify-center cursor-pointer">
                                  <input
                                    type="checkbox"
                                    checked={isSelected}
                                    onChange={() => handleHolidayToggle(holiday.id)}
                                    disabled={loading}
                                    className="w-5 h-5 text-blue-600 border-gray-300 rounded focus:ring-blue-500 focus:ring-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                                  />
                                  {isSelected && (
                                    <CheckCircle2 className="w-5 h-5 text-green-600 ml-2" />
                                  )}
                                </label>
                              </td>
                            ) : (
                              <td className="px-6 py-4 whitespace-nowrap text-center">
                                {isSelected ? (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                    <CheckCircle2 className="w-4 h-4 mr-1" />
                                    Selected
                                  </span>
                                ) : (
                                  <span className="text-sm text-gray-400">-</span>
                                )}
                              </td>
                            )}
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Company Info Footer */}
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Aizawl Office</h4>
              <p className="text-sm text-gray-600">
                C/O H. Vanlalchhuanga, S. Hlimen<br />
                Aizawl-796 005
              </p>
            </div>
            <div>
              <h4 className="font-semibold text-gray-900 mb-2">Bangalore Office</h4>
              <p className="text-sm text-gray-600">
                A301, Gina Living Waters, Kalyan Nagar<br />
                Bangalore-560 043
              </p>
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-300">
            <p className="text-sm text-gray-600">
              Phone: +91 82598 81121
            </p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}

