import logger from '../utils/logger.js';

export const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error with more context using the production logger
  logger.logError(err, {
    path: req.path,
    method: req.method,
    requestId: req.id || req.requestId,
    userId: req.user?.id,
    statusCode: err.statusCode,
  });

  // PostgreSQL errors
  if (err.code) {
    switch (err.code) {
      case '23505': // Unique violation
        const message = 'Duplicate field value entered';
        error = { message, statusCode: 400 };
        break;
      case '23503': // Foreign key violation
        error = { message: 'Referenced record not found', statusCode: 400 };
        break;
      case '23502': // Not null violation
        error = { message: 'Required field is missing', statusCode: 400 };
        break;
      case '42P01': // Undefined table
        error = { message: 'Database table not found', statusCode: 500 };
        break;
      case '42703': // Undefined column
        error = { message: 'Invalid field name', statusCode: 400 };
        break;
      default:
        error = { message: err.message || 'Database error', statusCode: 500 };
    }
  }

  // Validation errors
  if (err.name === 'ValidationError' || err.name === 'ZodError') {
    const message = err.errors ? Object.values(err.errors).map(val => val.message || val).join(', ') : err.message;
    error = { message, statusCode: 400 };
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    error = { message: 'Invalid token', statusCode: 401 };
  }

  if (err.name === 'TokenExpiredError') {
    error = { message: 'Token expired', statusCode: 401 };
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack, code: err.code })
  });
};
