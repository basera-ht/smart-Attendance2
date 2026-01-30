/**
 * Input sanitization utilities
 */

/**
 * Sanitize string input - removes potentially dangerous characters
 */
export const sanitizeString = (input) => {
  if (typeof input !== 'string') return input;
  
  // Remove null bytes and control characters
  return input
    .replace(/\0/g, '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim();
};

/**
 * Sanitize email - basic validation and normalization
 */
export const sanitizeEmail = (email) => {
  if (typeof email !== 'string') return null;
  
  const sanitized = email.toLowerCase().trim();
  // Basic email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  if (!emailRegex.test(sanitized)) {
    return null;
  }
  
  return sanitized;
};

/**
 * Sanitize phone number - removes non-digit characters except + and -
 */
export const sanitizePhone = (phone) => {
  if (typeof phone !== 'string') return null;
  
  // Remove all characters except digits, +, -, spaces, and parentheses
  const sanitized = phone.replace(/[^\d+\-() ]/g, '');
  
  return sanitized.trim() || null;
};

/**
 * Sanitize object recursively
 */
export const sanitizeObject = (obj) => {
  if (obj === null || obj === undefined) return obj;
  
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeObject(item));
  }
  
  if (typeof obj === 'object') {
    const sanitized = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        sanitized[key] = sanitizeString(value);
      } else {
        sanitized[key] = sanitizeObject(value);
      }
    }
    return sanitized;
  }
  
  if (typeof obj === 'string') {
    return sanitizeString(obj);
  }
  
  return obj;
};

/**
 * Sanitize SQL-like patterns to prevent basic injection attempts
 */
export const sanitizeForSQL = (input) => {
  if (typeof input !== 'string') return input;
  
  // Remove common SQL injection patterns
  return input
    .replace(/['";\\]/g, '')
    .replace(/--/g, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '')
    .replace(/;/g, '');
};

export default {
  sanitizeString,
  sanitizeEmail,
  sanitizePhone,
  sanitizeObject,
  sanitizeForSQL,
};

