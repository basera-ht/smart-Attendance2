/**
 * Additional validation middleware for common validations
 */

import { body, param, query, validationResult } from 'express-validator';

/**
 * Validate UUID parameter
 */
export const validateUUID = (paramName = 'id') => {
  return [
    param(paramName).isUUID().withMessage(`Invalid ${paramName} format`),
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }
      next();
    }
  ];
};

/**
 * Validate pagination query parameters
 */
export const validatePagination = () => {
  return [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('Limit must be between 1 and 100'),
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }
      next();
    }
  ];
};

/**
 * Validate date range query parameters
 */
export const validateDateRange = () => {
  return [
    query('startDate').optional().isISO8601().withMessage('Start date must be a valid ISO 8601 date'),
    query('endDate').optional().isISO8601().withMessage('End date must be a valid ISO 8601 date'),
    (req, res, next) => {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({
          success: false,
          message: 'Validation failed',
          errors: errors.array()
        });
      }
      
      // Check if endDate is after startDate
      if (req.query.startDate && req.query.endDate) {
        const start = new Date(req.query.startDate);
        const end = new Date(req.query.endDate);
        if (end < start) {
          return res.status(400).json({
            success: false,
            message: 'End date must be after start date'
          });
        }
      }
      
      next();
    }
  ];
};

/**
 * Generic validation result handler
 */
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Validation failed',
      errors: errors.array()
    });
  }
  next();
};

export default {
  validateUUID,
  validatePagination,
  validateDateRange,
  handleValidationErrors,
};

