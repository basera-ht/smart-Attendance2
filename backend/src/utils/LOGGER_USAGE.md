# Logger Usage Guide

This document explains how to use the production-ready logging library.

## Features

- ✅ Structured JSON logging for production
- ✅ Pretty colored console output for development
- ✅ Daily log rotation with automatic cleanup
- ✅ Separate log files for errors, combined logs, and exceptions
- ✅ Request ID tracking support
- ✅ Performance metrics logging
- ✅ Database query logging (debug mode)

## Basic Usage

```javascript
import logger from './utils/logger.js';

// Basic logging
logger.info('User logged in successfully');
logger.error('Database connection failed');
logger.warn('Rate limit approaching');
logger.debug('Processing request data');

// Logging with metadata
logger.info('User action', {
  userId: 123,
  action: 'login',
  ip: '192.168.1.1'
});

// Logging errors with context
try {
  // some operation
} catch (error) {
  logger.logError(error, {
    userId: 123,
    operation: 'updateProfile',
    additionalContext: 'value'
  });
}
```

## Request-Specific Logging

For request-specific logging with request IDs:

```javascript
import logger from './utils/logger.js';

// In your route handler
export const getUserProfile = async (req, res) => {
  // Create a child logger with request context
  const requestLogger = logger.child({
    requestId: req.id,
    userId: req.user?.id,
    path: req.path
  });

  requestLogger.info('Fetching user profile');
  
  try {
    // your logic
    requestLogger.info('User profile fetched successfully');
  } catch (error) {
    requestLogger.logError(error, { operation: 'getUserProfile' });
    throw error;
  }
};
```

## HTTP Request Logging Middleware

Use the `requestLogger` middleware to automatically log all HTTP requests:

```javascript
import express from 'express';
import { requestLogger } from './middleware/loggerMiddleware.js';

const app = express();

// Add request logger middleware (after body parsing, before routes)
app.use(express.json());
app.use(requestLogger); // Add this line

// Your routes...
```

## Performance Metrics

```javascript
import logger from './utils/logger.js';

const startTime = Date.now();
// ... perform operation
const duration = Date.now() - startTime;

logger.logPerformance('databaseQuery', duration, {
  query: 'SELECT * FROM users',
  rowsReturned: 100
});
```

## Database Query Logging

```javascript
import logger from './utils/logger.js';

// Log database queries (only in debug mode)
logger.logQuery(
  'SELECT * FROM users WHERE id = $1',
  [123],
  45 // duration in ms
);
```

## Log Levels

The logger supports the following levels (in order of severity):

- `error` - Error events that might still allow the application to continue
- `warn` - Warning messages
- `info` - Informational messages (default for production)
- `debug` - Debug messages (default for development)
- `verbose` - Verbose messages

Set log level via environment variable:

```bash
LOG_LEVEL=debug  # or error, warn, info, debug, verbose
```

## Environment Configuration

The logger automatically adapts based on `NODE_ENV`:

- **Development**: Pretty colored console output + file logs
- **Production**: JSON console output + file logs

## Log Files

Logs are stored in `backend/logs/` directory:

- `combined-YYYY-MM-DD.log` - All logs (info and above)
- `error-YYYY-MM-DD.log` - Error logs only
- `exceptions-YYYY-MM-DD.log` - Uncaught exceptions
- `rejections-YYYY-MM-DD.log` - Unhandled promise rejections

Log files are automatically rotated daily and kept for:
- Combined logs: 14 days
- Error logs: 30 days
- Exception/rejection logs: 30 days

## Migration from console.log

Replace existing console statements:

```javascript
// Before
console.log('User logged in');
console.error('Error:', error);

// After
import logger from './utils/logger.js';
logger.info('User logged in');
logger.logError(error);
```

## Best Practices

1. **Use appropriate log levels**
   - `error` for errors that need attention
   - `warn` for warnings that might need investigation
   - `info` for important business events
   - `debug` for detailed debugging information

2. **Include context**
   ```javascript
   // Good
   logger.info('Order created', { orderId: 123, userId: 456, amount: 99.99 });
   
   // Less useful
   logger.info('Order created');
   ```

3. **Use child loggers for request context**
   ```javascript
   const requestLogger = logger.child({ requestId: req.id });
   requestLogger.info('Processing request');
   ```

4. **Log errors with full context**
   ```javascript
   logger.logError(error, {
     userId: req.user?.id,
     operation: 'createOrder',
     orderData: req.body
   });
   ```

5. **Don't log sensitive information**
   - Never log passwords, tokens, or PII
   - Be careful with request bodies that might contain sensitive data

## Example: Complete Route Handler

```javascript
import express from 'express';
import logger from '../utils/logger.js';

const router = express.Router();

router.post('/api/users', async (req, res) => {
  const requestLogger = logger.child({
    requestId: req.id,
    operation: 'createUser'
  });

  try {
    requestLogger.info('Creating new user', { email: req.body.email });
    
    // Your business logic here
    const user = await createUser(req.body);
    
    requestLogger.info('User created successfully', { userId: user.id });
    
    res.status(201).json({ success: true, data: user });
  } catch (error) {
    requestLogger.logError(error, {
      email: req.body.email,
      bodyKeys: Object.keys(req.body)
    });
    
    res.status(500).json({
      success: false,
      error: 'Failed to create user'
    });
  }
});

export default router;
```

