/**
 * Production-ready logging library using Winston
 * Features:
 * - Structured JSON logging for production
 * - Pretty console output for development
 * - Daily log rotation with automatic cleanup
 * - Separate log files for errors, combined logs, and access logs
 * - Request ID tracking support
 * - Performance optimized
 */

import winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure logs directory exists (only in development or non-serverless)
const logsDir = path.join(__dirname, '../../logs');

// In Vercel/Serverless, we typically can't write to local fs (except /tmp), 
// and we should rely on stdout (console) which Vercel captures.
// We also detect if we are in a read-only path structure like /var/task
const isServerless = process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  (process.env.NODE_ENV === 'production');

let canWriteToDisk = !isServerless;

if (canWriteToDisk) {
  try {
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }
    // Test write permission
    const testFile = path.join(logsDir, '.test');
    fs.writeFileSync(testFile, 'test');
    fs.unlinkSync(testFile);
  } catch (error) {
    console.warn('⚠️ Cannot write to logs directory, disabling file logging:', error.message);
    canWriteToDisk = false;
  }
}

// Determine environment
const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';
const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

// Custom format for development (pretty, colored)
const developmentFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.colorize(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    let msg = `${timestamp} [${level}]: ${message}`;

    // Add metadata if present
    if (Object.keys(meta).length > 0) {
      const metaStr = JSON.stringify(meta, null, 2);
      msg += `\n${metaStr}`;
    }

    return msg;
  })
);

// Custom format for production (JSON)
const productionFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Common format for file logs (always JSON for parsing)
const fileFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

// Console transport with different formats for dev/prod
const consoleTransport = new winston.transports.Console({
  format: isDevelopment ? developmentFormat : productionFormat,
  level: logLevel,
});

const transports = [consoleTransport];

// Only add file transports if we are allowed to write to disk
if (canWriteToDisk) {
  // Daily rotate file transport for combined logs
  const combinedFileTransport = new DailyRotateFile({
    filename: path.join(logsDir, 'combined-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '14d', // Keep logs for 14 days
    format: fileFormat,
    level: 'info',
  });

  // Daily rotate file transport for error logs
  const errorFileTransport = new DailyRotateFile({
    filename: path.join(logsDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    maxSize: '20m',
    maxFiles: '30d', // Keep error logs for 30 days
    format: fileFormat,
    level: 'error',
  });

  transports.push(combinedFileTransport, errorFileTransport);
}


// Create Winston logger instance
const logger = winston.createLogger({
  level: logLevel,
  format: fileFormat,
  defaultMeta: {
    service: 'lushai-attendance-backend',
    environment: process.env.NODE_ENV || 'development',
  },
  transports: transports,
  // Handle exceptions and rejections
  exitOnError: false,
});

if (canWriteToDisk) {
  logger.exceptions.handle(
    new DailyRotateFile({
      filename: path.join(logsDir, 'exceptions-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      format: fileFormat,
    })
  );

  logger.rejections.handle(
    new DailyRotateFile({
      filename: path.join(logsDir, 'rejections-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '30d',
      format: fileFormat,
    })
  );
}

/**
 * Create a child logger with additional context/metadata
 * Useful for request-specific logging with request IDs
 * 
 * Note: Winston already provides a built-in child() method.
 * This documentation is for reference. Use logger.child(meta) directly.
 * 
 * @example
 * const requestLogger = logger.child({ requestId: 'abc123', userId: 1 });
 * requestLogger.info('User logged in');
 */

/**
 * Log an error with full stack trace and context
 * 
 * @param {string|Error} error - Error message or Error object
 * @param {Object} context - Additional context about the error
 * 
 * @example
 * logger.logError(new Error('Database connection failed'), { 
 *   host: 'localhost', 
 *   port: 5432 
 * });
 */
logger.logError = (error, context = {}) => {
  if (error instanceof Error) {
    logger.error(error.message, {
      error: {
        name: error.name,
        message: error.message,
        stack: error.stack,
        code: error.code,
      },
      ...context,
    });
  } else {
    logger.error(error, context);
  }
};

/**
 * Log HTTP request details
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {number} responseTime - Response time in milliseconds
 */
logger.logRequest = (req, res, responseTime) => {
  const logData = {
    method: req.method,
    url: req.originalUrl || req.url,
    statusCode: res.statusCode,
    responseTime: `${responseTime}ms`,
    ip: req.ip || req.connection?.remoteAddress || req.socket?.remoteAddress || 'unknown',
    userAgent: req.get('user-agent'),
  };

  // Add request ID if available
  if (req.id || req.requestId) {
    logData.requestId = req.id || req.requestId;
  }

  // Add user ID if available
  if (req.user && req.user.id) {
    logData.userId = req.user.id;
  }

  // Log based on status code
  if (res.statusCode >= 500) {
    logger.error('HTTP Request', logData);
  } else if (res.statusCode >= 400) {
    logger.warn('HTTP Request', logData);
  } else {
    logger.info('HTTP Request', logData);
  }
};

/**
 * Log database query (for debugging)
 * 
 * @param {string} query - SQL query
 * @param {Array} params - Query parameters
 * @param {number} duration - Query duration in milliseconds
 */
logger.logQuery = (query, params = [], duration = null) => {
  if (isDevelopment || logLevel === 'debug') {
    logger.debug('Database Query', {
      query: query.replace(/\s+/g, ' ').trim(),
      params,
      duration: duration ? `${duration}ms` : null,
    });
  }
};

/**
 * Log performance metrics
 * 
 * @param {string} operation - Name of the operation
 * @param {number} duration - Duration in milliseconds
 * @param {Object} metadata - Additional metadata
 */
logger.logPerformance = (operation, duration, metadata = {}) => {
  const level = duration > 1000 ? 'warn' : duration > 500 ? 'info' : 'debug';
  logger[level]('Performance Metric', {
    operation,
    duration: `${duration}ms`,
    ...metadata,
  });
};

// Export the logger
export default logger;

// Named exports for convenience
export { logger };

// Forced update for deployment sync

