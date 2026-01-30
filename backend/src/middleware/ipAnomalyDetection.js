import { getDB } from '../config/db.js';
import { qrValidationLogs } from '../db/schema.js';
import { and, gte, eq, sql } from 'drizzle-orm';
import moment from 'moment';

// In-memory cache for IP tracking (consider Redis for production)
const ipRequestCache = new Map();

/**
 * Detect IP anomalies for QR validation requests
 * @param {string} ipAddress - Client IP address
 * @param {number} userId - User ID (if authenticated)
 * @returns {Object} { isSuspicious: boolean, flags: string[] }
 */
export const detectIPAnomalies = async (ipAddress, userId = null) => {
  const flags = [];
  const now = Date.now();
  const windowMs = 5 * 60 * 1000; // 5 minutes

  // Initialize IP tracking
  if (!ipRequestCache.has(ipAddress)) {
    ipRequestCache.set(ipAddress, {
      requests: [],
      lastRequest: now,
      uniqueUsers: new Set()
    });
  }

  const ipData = ipRequestCache.get(ipAddress);

  // Clean old requests
  ipData.requests = ipData.requests.filter(timestamp => now - timestamp < windowMs);

  // Add current request
  ipData.requests.push(now);
  ipData.lastRequest = now;

  if (userId) {
    ipData.uniqueUsers.add(userId);
  }

  // Check for rapid requests (potential brute force)
  if (ipData.requests.length > 10) {
    flags.push('RAPID_REQUESTS');
  }

  // Check for multiple users from same IP
  if (ipData.uniqueUsers.size > 3) {
    flags.push('MULTIPLE_USERS_SAME_IP');
  }

  // Check database for recent suspicious activity
  try {
    const db = getDB();
    const fiveMinutesAgo = moment().subtract(5, 'minutes').toDate();

    // Count recent failed validations from this IP
    const recentFailures = await db
      .select({ count: sql`count(*)` })
      .from(qrValidationLogs)
      .where(
        and(
          eq(qrValidationLogs.ipAddress, ipAddress),
          eq(qrValidationLogs.isValid, false),
          gte(qrValidationLogs.createdAt, fiveMinutesAgo)
        )
      );

    if (Number(recentFailures[0]?.count || 0) > 5) {
      flags.push('HIGH_FAILURE_RATE');
    }

    // Check for multiple successful validations in short time
    if (userId) {
      const recentSuccesses = await db
        .select({ count: sql`count(*)` })
        .from(qrValidationLogs)
        .where(
          and(
            eq(qrValidationLogs.ipAddress, ipAddress),
            eq(qrValidationLogs.userId, userId),
            eq(qrValidationLogs.isValid, true),
            gte(qrValidationLogs.createdAt, fiveMinutesAgo)
          )
        );

      if (Number(recentSuccesses[0]?.count || 0) > 3) {
        flags.push('RAPID_MULTI_CHECKINS');
      }
    }
  } catch (error) {
    console.error('IP anomaly detection error:', error);
  }

  return {
    isSuspicious: flags.length > 0,
    flags
  };
};

/**
 * Clean up old IP cache entries (call periodically)
 */
export const cleanupIPCache = () => {
  const now = Date.now();
  const maxAge = 30 * 60 * 1000; // 30 minutes

  for (const [ip, data] of ipRequestCache.entries()) {
    if (now - data.lastRequest > maxAge) {
      ipRequestCache.delete(ip);
    }
  }
};

// Cleanup every 10 minutes
setInterval(cleanupIPCache, 10 * 60 * 1000);
