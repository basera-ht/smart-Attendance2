import moment from 'moment';
import { getDB } from '../config/db.js';
import { selectedOptionalHolidays } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const monthNames = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

const getDayName = (date) => {
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return dayNames[date.getDay()];
};

const formatHolidayDate = (year, monthIndex, day) => {
  const dd = String(day).padStart(2, '0');
  const mm = String(monthIndex + 1).padStart(2, '0');
  return `${dd}.${mm}.${year}`;
};

const buildHoliday = (template, year) => {
  const date = new Date(year, template.monthIndex, template.day);
  return {
    id: template.id,
    name: template.name,
    date: formatHolidayDate(year, template.monthIndex, template.day),
    month: monthNames[template.monthIndex],
    day: getDayName(date),
  };
};

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
  { id: 11, name: "New Year's Eve", monthIndex: 11, day: 31 },
];

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
  { id: 11, name: 'Christmas Festival', monthIndex: 11, day: 28 },
];

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
};

const applyOverrides = (templates, year, type) => {
  const overrides = holidayOverrides?.[year]?.[type] || {};
  return templates.map((template) => ({
    ...template,
    ...(overrides[template.id] || {}),
  }));
};

const getFixedHolidays = (year) => applyOverrides(fixedHolidayTemplates, year, 'fixed')
  .map((template) => buildHoliday(template, year));
const getOptionalHolidays = (year) => applyOverrides(optionalHolidayTemplates, year, 'optional')
  .map((template) => buildHoliday(template, year));

/**
 * Parse holiday date from DD.MM.YYYY format to Date object
 */
const parseHolidayDate = (dateStr) => {
  const [day, month, year] = dateStr.split('.');
  return new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
};

/**
 * Format date to YYYY-MM-DD string for comparison
 */
const formatDateForComparison = (date) => {
  if (!date) return null;
  const d = moment(date);
  if (!d.isValid()) return null;
  return d.format('YYYY-MM-DD');
};

const getYearFromDateInput = (date) => {
  if (!date) return new Date().getFullYear();
  const d = moment(date);
  if (!d.isValid()) return new Date().getFullYear();
  return d.year();
};

/**
 * Check if a date is a weekend (Saturday or Sunday)
 */
export const isWeekend = (date) => {
  const d = moment(date);
  const dayOfWeek = d.day();
  return dayOfWeek === 0 || dayOfWeek === 6; // Sunday (0) or Saturday (6)
};

/**
 * Check if a date is a fixed holiday
 */
export const isFixedHoliday = (date) => {
  const dateStr = formatDateForComparison(date);
  if (!dateStr) return false;

  const year = getYearFromDateInput(date);
  const fixedHolidays = getFixedHolidays(year);

  for (const holiday of fixedHolidays) {
    const holidayDate = parseHolidayDate(holiday.date);
    const holidayDateStr = formatDateForComparison(holidayDate);
    if (holidayDateStr === dateStr) {
      return true;
    }
  }
  return false;
};

/**
 * Get selected optional holidays for a year from database
 */
export const getSelectedOptionalHolidays = async (year) => {
  try {
    const db = getDB();
    const selectedHolidays = await db
      .select()
      .from(selectedOptionalHolidays)
      .where(eq(selectedOptionalHolidays.year, year));
    
    return selectedHolidays.map(h => h.holidayId);
  } catch (error) {
    console.error('Error fetching selected optional holidays:', error);
    return [];
  }
};

/**
 * Check if a date is a selected optional holiday
 */
export const isSelectedOptionalHoliday = async (date, year) => {
  const dateStr = formatDateForComparison(date);
  if (!dateStr) return false;
  
  const selectedHolidayIds = await getSelectedOptionalHolidays(year);

  const optionalHolidays = getOptionalHolidays(year);

  for (const holiday of optionalHolidays) {
    if (!selectedHolidayIds.includes(holiday.id)) {
      continue;
    }
    const holidayDate = parseHolidayDate(holiday.date);
    const holidayDateStr = formatDateForComparison(holidayDate);
    if (holidayDateStr === dateStr) {
      return true;
    }
  }
  return false;
};

/**
 * Check if a date should be excluded from leave count
 * (weekends, fixed holidays, or selected optional holidays)
 */
export const shouldExcludeFromLeaveCount = async (date, year) => {
  if (isWeekend(date)) return true;
  if (isFixedHoliday(date)) return true;
  if (await isSelectedOptionalHoliday(date, year)) return true;
  return false;
};

/**
 * Calculate working days between two dates (excluding weekends, fixed holidays, and selected optional holidays)
 * @param {Date|string} startDate - Start date
 * @param {Date|string} endDate - End date
 * @returns {Promise<number>} Number of working days
 */
export const calculateWorkingDays = async (startDate, endDate) => {
  const start = moment(startDate).startOf('day');
  const end = moment(endDate).startOf('day');
  
  if (!start.isValid() || !end.isValid()) {
    throw new Error('Invalid date provided');
  }
  
  if (start.isAfter(end)) {
    throw new Error('Start date must be before or equal to end date');
  }
  
  let workingDays = 0;
  const current = start.clone();
  
  // Iterate through each day in the range
  while (current.isSameOrBefore(end)) {
    // Extract year for each day to handle cross-year date ranges correctly
    const year = current.year();
    if (!(await shouldExcludeFromLeaveCount(current.toDate(), year))) {
      workingDays++;
    }
    current.add(1, 'day');
  }
  
  return workingDays;
};

