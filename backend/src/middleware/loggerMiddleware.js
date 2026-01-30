/**
 * Express middleware for HTTP request logging
 * Automatically logs all incoming requests with response times
 */

import logger from '../utils/logger.js';

/**
 * Middleware to log HTTP requests
 * Should be placed after body parsing but before routes
 */
export const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Generate or use existing request ID
  if (!req.id && !req.requestId) {
    req.id = req.requestId = `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Log request start
  logger.debug('HTTP Request Started', {
    requestId: req.id,
    method: req.method,
    url: req.originalUrl || req.url,
    ip: req.ip || req.connection.remoteAddress,
    userAgent: req.get('user-agent'),
  });

  // Override res.end to capture response time
  const originalEnd = res.end;
  res.end = function (chunk, encoding) {
    res.end = originalEnd;
    res.end(chunk, encoding);

    const responseTime = Date.now() - startTime;
    logger.logRequest(req, res, responseTime);
  };

  next();
};

export default requestLogger;

