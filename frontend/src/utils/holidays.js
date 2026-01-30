// Holidays data (auto-updates year and day names)

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]

const getDayName = (date) => {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  return dayNames[date.getDay()]
}

const formatHolidayDate = (year, monthIndex, day) => {
  const dd = String(day).padStart(2, '0')
  const mm = String(monthIndex + 1).padStart(2, '0')
  return `${dd}.${mm}.${year}`
}

const buildHoliday = (template, year) => {
  const date = new Date(year, template.monthIndex, template.day)
  return {
    id: template.id,
    name: template.name,
    date: formatHolidayDate(year, template.monthIndex, template.day),
    month: monthNames[template.monthIndex],
    day: getDayName(date)
  }
}

const fixedHolidayTemplates = [
  { id: 1, name: "New Year's Day", monthIndex: 0, day: 1 },
  { id: 2, name: 'Republic Day', monthIndex: 0, day: 26 },
  { id: 3, name: 'State Day', monthIndex: 1, day: 20 },
  { id: 4, name: 'Holi', monthIndex: 2, day: 4 },
  { id: 5, name: 'Chapchar Kut', monthIndex: 2, day: 13 },
  { id: 6, name: 'Good Friday', monthIndex: 3, day: 3 },
  { id: 7, name: 'YMA Day', monthIndex: 5, day: 15 },
  { id: 8, name: "Mahatma Gandhi's Birthday", monthIndex: 9, day: 2 },
  { id: 9, name: 'Christmas Eve', monthIndex: 11, day: 24 },
  { id: 10, name: 'Christmas Day', monthIndex: 11, day: 25 },
  { id: 11, name: "New Year's Eve", monthIndex: 11, day: 31 }
]

const optionalHolidayTemplates = [
  { id: 1, name: 'New Year Celebration', monthIndex: 0, day: 2 },
  { id: 2, name: "Guru Ravi Das' Birthday", monthIndex: 1, day: 1 },
  { id: 3, name: 'Easter Monday', monthIndex: 3, day: 6 },
  { id: 4, name: 'Rath Yatra', monthIndex: 6, day: 16 },
  { id: 5, name: 'Onam or Thiru Onam Day', monthIndex: 7, day: 26 },
  { id: 6, name: 'Raksha Bandhan', monthIndex: 7, day: 28 },
  { id: 7, name: 'Ganesh Chaturthi/ Vinayak Chaturthi', monthIndex: 8, day: 14 },
  { id: 8, name: 'Dussehra (Saptami)', monthIndex: 9, day: 18 },
  { id: 9, name: 'Dussehra (Mahashtami)', monthIndex: 9, day: 19 },
  { id: 10, name: 'Dussehra (Mahanavmi)', monthIndex: 9, day: 20 },
  { id: 11, name: 'Christmas Festival', monthIndex: 11, day: 28 }
]

// Per-year overrides by holiday id (only list changes here)
const holidayOverrides = {
  2025: {
    fixed: {},
    optional: {},
  },
  2026: {
    fixed: {
      4: { monthIndex: 2, day: 4 }, // Holi
      6: { monthIndex: 3, day: 3 }, // Good Friday
    },
    optional: {
      3: { monthIndex: 3, day: 6 }, // Easter Monday
    },
  },
  2027: {
    fixed: {},
    optional: {},
  },
  2028: {
    fixed: {},
    optional: {},
  },
}

const applyOverrides = (templates, year, type) => {
  const overrides = holidayOverrides?.[year]?.[type] || {}
  return templates.map(template => ({
    ...template,
    ...(overrides[template.id] || {})
  }))
}

export const getFixedHolidays = (year) => applyOverrides(fixedHolidayTemplates, year, 'fixed')
  .map(template => buildHoliday(template, year))
export const getOptionalHolidays = (year) => applyOverrides(optionalHolidayTemplates, year, 'optional')
  .map(template => buildHoliday(template, year))
export const getAllHolidays = (year, includeOptional = true) => {
  const fixed = getFixedHolidays(year)
  if (!includeOptional) return fixed
  return [...fixed, ...getOptionalHolidays(year)]
}

// For backward compatibility in places expecting arrays
const currentYear = new Date().getFullYear()
export const fixedHolidays = getFixedHolidays(currentYear)
export const optionalHolidays = getOptionalHolidays(currentYear)
export const allHolidays = [...fixedHolidays, ...optionalHolidays]

/**
 * Parse holiday date from DD.MM.YYYY format to Date object
 * @param {string} dateStr - Date string in DD.MM.YYYY format
 * @returns {Date} Date object
 */
export const parseHolidayDate = (dateStr) => {
  const [day, month, year] = dateStr.split('.')
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
}

/**
 * Convert date to YYYY-MM-DD format for comparison
 * @param {Date} date - Date object
 * @returns {string} Date string in YYYY-MM-DD format
 */
export const formatDateForComparison = (date) => {
  if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
    return null
  }
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const getYearFromDateInput = (date) => {
  if (!date) return new Date().getFullYear()
  if (typeof date === 'string') {
    const [year] = date.split('-')
    return parseInt(year) || new Date().getFullYear()
  }
  if (date instanceof Date) {
    return date.getFullYear()
  }
  return new Date().getFullYear()
}

/**
 * Check if a given date is a holiday
 * @param {Date|string|null} date - Date object or YYYY-MM-DD string or null
 * @param {boolean} includeOptional - Whether to include optional holidays (default: true)
 * @returns {Object|null} Holiday object if found, null otherwise
 */
export const isHoliday = (date, includeOptional = true) => {
  if (!date || date === null) {
    return null
  }
  
  let dateObj
  let dateStr
  
  if (typeof date === 'string') {
    if (!date || date.trim() === '') {
      return null
    }
    dateStr = date
    const [year, month, day] = date.split('-')
    dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
  } else {
    dateObj = date
    dateStr = formatDateForComparison(date)
    if (!dateStr) {
      return null
    }
  }
  
  const year = getYearFromDateInput(dateObj)
  const holidaysToCheck = getAllHolidays(year, includeOptional)
  
  for (const holiday of holidaysToCheck) {
    const holidayDate = parseHolidayDate(holiday.date)
    const holidayDateStr = formatDateForComparison(holidayDate)
    
    if (!holidayDateStr) {
      continue
    }
    
    if (holidayDateStr === dateStr) {
      return holiday
    }
  }
  
  return null
}

/**
 * Get all holidays for a specific year
 * @param {number} year - Year (e.g., 2026)
 * @param {boolean} includeOptional - Whether to include optional holidays (default: true)
 * @returns {Array} Array of holiday objects
 */
export const getHolidaysForYear = (year, includeOptional = true) => {
  return getAllHolidays(year, includeOptional)
}

/**
 * Get all holidays for a specific month
 * @param {number} year - Year (e.g., 2026)
 * @param {number} month - Month (0-11, where 0 is January)
 * @param {boolean} includeOptional - Whether to include optional holidays (default: true)
 * @returns {Array} Array of holiday objects
 */
export const getHolidaysForMonth = (year, month, includeOptional = true) => {
  const holidaysToCheck = getAllHolidays(year, includeOptional)
  return holidaysToCheck.filter(holiday => {
    const holidayDate = parseHolidayDate(holiday.date)
    return holidayDate.getFullYear() === year && holidayDate.getMonth() === month
  })
}

/**
 * Check if a given date is a fixed holiday
 * @param {Date|string|null} date - Date object or YYYY-MM-DD string or null
 * @returns {Object|null} Fixed holiday object if found, null otherwise
 */
export const isFixedHoliday = (date) => {
  if (!date || date === null) {
    return null
  }
  
  let dateStr
  let dateObj
  
  if (typeof date === 'string') {
    if (!date || date.trim() === '') {
      return null
    }
    dateStr = date
    const [year, month, day] = date.split('-')
    dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
  } else {
    dateObj = date
    dateStr = formatDateForComparison(date)
    if (!dateStr) {
      return null
    }
  }
  
  const year = getYearFromDateInput(dateObj)
  const fixed = getFixedHolidays(year)
  
  for (const holiday of fixed) {
    const holidayDate = parseHolidayDate(holiday.date)
    const holidayDateStr = formatDateForComparison(holidayDate)
    
    if (!holidayDateStr) {
      continue
    }
    
    if (holidayDateStr === dateStr) {
      return holiday
    }
  }
  
  return null
}

/**
 * Check if a date is a weekend (Saturday or Sunday)
 * @param {Date|string} date - Date object or YYYY-MM-DD string
 * @returns {boolean} True if the date is a weekend
 */
export const isWeekend = (date) => {
  let dateObj
  if (typeof date === 'string') {
    const [year, month, day] = date.split('-')
    dateObj = new Date(parseInt(year), parseInt(month) - 1, parseInt(day))
  } else {
    dateObj = date
  }
  const dayOfWeek = dateObj.getDay()
  return dayOfWeek === 0 || dayOfWeek === 6
}

/**
 * Check if a date should be excluded from leave display/count
 * (weekends, fixed holidays, or selected optional holidays)
 * @param {Date|string} date - Date object or YYYY-MM-DD string
 * @param {Array<number>} selectedOptionalHolidayIds - Array of selected optional holiday IDs
 * @returns {boolean} True if the date should be excluded
 */
export const shouldExcludeFromLeave = (date, selectedOptionalHolidayIds = []) => {
  if (isWeekend(date)) return true
  if (isFixedHoliday(date)) return true
  
  const dateStr = typeof date === 'string' ? date : formatDateForComparison(date)
  if (!dateStr) return false
  
  const year = getYearFromDateInput(date)
  const optional = getOptionalHolidays(year)
  
  for (const holiday of optional) {
    if (!selectedOptionalHolidayIds.includes(holiday.id)) {
      continue
    }
    const holidayDate = parseHolidayDate(holiday.date)
    const holidayDateStr = formatDateForComparison(holidayDate)
    if (holidayDateStr === dateStr) {
      return true
    }
  }
  
  return false
}

/**
 * Calculate working days between two dates (excluding weekends, fixed holidays, and selected optional holidays)
 * @param {string} startDate - Start date in YYYY-MM-DD format
 * @param {string} endDate - End date in YYYY-MM-DD format
 * @param {Array<number>} selectedOptionalHolidayIds - Array of selected optional holiday IDs
 * @returns {number} Number of working days
 */
export const calculateWorkingDays = (startDate, endDate, selectedOptionalHolidayIds = []) => {
  const [startYear, startMonth, startDay] = startDate.split('-').map(Number)
  const [endYear, endMonth, endDay] = endDate.split('-').map(Number)
  
  const start = new Date(startYear, startMonth - 1, startDay)
  const end = new Date(endYear, endMonth - 1, endDay)
  
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    return 0
  }
  
  if (start > end) {
    return 0
  }
  
  let workingDays = 0
  const current = new Date(start)
  
  while (current <= end) {
    const dateStr = formatDateForComparison(current)
    if (dateStr && !shouldExcludeFromLeave(dateStr, selectedOptionalHolidayIds)) {
      workingDays++
    }
    current.setDate(current.getDate() + 1)
  }
  
  return workingDays
}
