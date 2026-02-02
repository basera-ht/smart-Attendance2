import express from 'express';
import { body, validationResult } from 'express-validator';
import { eq, and, gte, isNull, sql } from 'drizzle-orm';
import moment from 'moment';
import { getDB } from '../config/db.js';
import { qrCodes, offices, qrValidationLogs, attendance, users, leaves } from '../db/schema.js';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { generateQRCodeImage, generateNonce, generateQRId } from '../utils/qrGenerator.js';
import { detectIPAnomalies } from '../middleware/ipAnomalyDetection.js';
import { getClientIp, isIpInRanges } from '../utils/ipUtils.js';
import { signQrToken, getQrPublicKey, getQrKeyId, hashList, verifyQrToken } from '../utils/qrJwt.js';

const router = express.Router();

// Rate limiter for QR generation (stricter)
const qrGenerateLimiter = {
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // Max 5 QR codes per 5 minutes per IP
};

const qrValidationLimiter = {
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 10, // Max 10 validation attempts per minute per IP
};

// In-memory rate limiters (consider Redis for production)
const rateLimitStore = new Map();

const checkRateLimit = (key, limitConfig) => {
  const now = Date.now();
  const windowStart = now - limitConfig.windowMs;

  if (!rateLimitStore.has(key)) {
    rateLimitStore.set(key, []);
  }

  const requests = rateLimitStore.get(key);
  const recentRequests = requests.filter(timestamp => timestamp > windowStart);

  if (recentRequests.length >= limitConfig.max) {
    return false;
  }

  recentRequests.push(now);
  rateLimitStore.set(key, recentRequests);
  return true;
};

/**
 * @route   GET /api/qr/public-key
 * @desc    Get public key for QR JWT verification
 * @access  Public
 */
router.get('/public-key', (req, res) => {
  const publicKey = getQrPublicKey();
  if (!publicKey) {
    return res.status(500).json({
      success: false,
      message: 'QR public key not configured'
    });
  }

  res.json({
    success: true,
    data: {
      keyId: getQrKeyId(),
      publicKey
    }
  });
});

/**
 * @route   POST /api/qr/generate
 * @desc    Generate a time-limited QR code (compact payload)
 * @access  Private (Admin/HR only)
 */
router.post('/generate', authenticate, authorize('admin', 'hr'), [
  body('officeId').isInt().withMessage('Office ID is required'),
  body('expiresIn').optional().isInt({ min: 60, max: 300 }).withMessage('Expires in must be between 60-300 seconds'),
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    // Rate limiting
    const rateLimitKey = `qr_generate_${req.ip}`;
    if (!checkRateLimit(rateLimitKey, qrGenerateLimiter)) {
      return res.status(429).json({
        success: false,
        message: 'Too many QR generation requests. Please wait before generating another QR code.'
      });
    }

    const db = getDB();
    const { officeId, expiresIn = 300 } = req.body;

    // Verify office exists and is active
    const [office] = await db
      .select()
      .from(offices)
      .where(and(eq(offices.id, officeId), eq(offices.isActive, true)))
      .limit(1);

    if (!office) {
      return res.status(404).json({
        success: false,
        message: 'Office not found or inactive'
      });
    }

    if (!office.allowedIPRanges || office.allowedIPRanges.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Office network is not configured (allowed IP ranges missing)'
      });
    }

    // Invalidate any existing active QR codes for this office
    await db
      .update(qrCodes)
      .set({ isUsed: true })
      .where(
        and(
          eq(qrCodes.officeId, officeId),
          eq(qrCodes.isUsed, false),
          gte(qrCodes.expiresAt, new Date())
        )
      );

    // Generate QR code
    const qrId = generateQRId();
    const nonce = generateNonce();
    const expiresAt = moment().add(expiresIn, 'seconds').toDate();

    const token = signQrToken({
      qrId,
      officeId,
      allowedSSIDs: office.allowedSSIDs || [],
      allowedIPRanges: office.allowedIPRanges || [],
      expiresAt: expiresAt.toISOString()
    });

    const payload = { token };

    // Store QR code in database
    const [qrCode] = await db
      .insert(qrCodes)
      .values({
        qrId,
        officeId,
        geofenceId: null,
        payload,
        expiresAt,
        nonce,
        createdById: req.user.id
      })
      .returning();

    // Generate QR code image (Pass token string directly to reduce density)
    const qrImageDataUrl = await generateQRCodeImage(token);

    res.json({
      success: true,
      data: {
        qrId,
        qrImage: qrImageDataUrl,
        payload, // For testing/debugging
        expiresAt: expiresAt.toISOString(),
        expiresIn,
        office: {
          id: office.id,
          name: office.name
        },
        officeNetwork: {
          allowedSSIDs: office.allowedSSIDs || [],
          allowedIPRanges: office.allowedIPRanges || [],
          allowedSSIDHash: hashList(office.allowedSSIDs || []),
          allowedIPRangeHash: hashList(office.allowedIPRanges || [])
        }
      }
    });
  } catch (error) {
    console.error('QR generation error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error generating QR code'
    });
  }
});

/**
 * @route   GET /api/qr/payload/:qrId
 * @desc    Get QR payload details (office network, expiry) for client-side validation
 * @access  Private
 */
router.get('/payload/:qrId', authenticate, async (req, res) => {
  try {
    const db = getDB();
    const { qrId } = req.params;

    const [qrData] = await db
      .select({
        qr: qrCodes,
        office: offices
      })
      .from(qrCodes)
      .leftJoin(offices, eq(qrCodes.officeId, offices.id))
      .where(eq(qrCodes.qrId, qrId))
      .limit(1);

    if (!qrData || !qrData.qr) {
      return res.status(404).json({
        success: false,
        message: 'QR code not found'
      });
    }

    if (qrData.qr.isUsed) {
      return res.status(400).json({
        success: false,
        message: 'QR code already used'
      });
    }

    if (new Date(qrData.qr.expiresAt) < new Date()) {
      return res.status(400).json({
        success: false,
        message: 'QR code expired'
      });
    }

    res.json({
      success: true,
      data: {
        qrId: qrData.qr.qrId,
        expiresAt: qrData.qr.expiresAt,
        officeNetwork: {
          allowedSSIDs: qrData.office?.allowedSSIDs || [],
          allowedIPRanges: qrData.office?.allowedIPRanges || []
        },
        office: {
          id: qrData.office?.id,
          name: qrData.office?.name
        }
      }
    });
  } catch (error) {
    console.error('QR payload fetch error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching QR payload'
    });
  }
});

/**
 * @route   POST /api/qr/validate
 * @desc    Validate QR code and record attendance
 * @access  Private
 */
export const validateQRRules = [];

export const validateQR = async (req, res) => {
  return res.status(410).json({
    success: false,
    message: 'Use /api/attendance/submit for QR validation.'
  });
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        success: false,
        message: 'Validation failed',
        errors: errors.array()
      });
    }

    const rateLimitKey = `qr_validate_${req.ip}`;
    if (!checkRateLimit(rateLimitKey, qrValidationLimiter)) {
      return res.status(429).json({
        success: false,
        message: 'Too many validation requests. Please try again later.'
      });
    }

    const db = getDB();
    const { token, fingerprintHash, networkType, ssid } = req.body;
    const userId = req.user.id;
    const ipAddress = getClientIp(req);
    const userAgent = req.get('User-Agent') || '';

    const ipAnomaly = await detectIPAnomalies(ipAddress, userId);

    let tokenPayload;
    try {
      tokenPayload = verifyQrToken(token);
    } catch (error) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired QR token'
      });
    }

    const { qrId, officeId } = tokenPayload;

    const [qrCode] = await db
      .select({
        qr: qrCodes,
        office: offices
      })
      .from(qrCodes)
      .leftJoin(offices, eq(qrCodes.officeId, offices.id))
      .where(eq(qrCodes.qrId, qrId))
      .limit(1);

    const validationSummary = {
      qrExists: false,
      qrExpired: false,
      qrUsed: false,
      nonceMatch: true,
      ipAllowed: false,
      ssidMatch: false,
      fingerprintMatch: false,
      networkAllowed: false,
      alreadyCheckedIn: false,
      onLeave: false,
      networkType,
      ssid,
      ipAddress,
      qrId,
      officeId,
      mode: 'online',
      syncStatus: 'final'
    };

    let isValid = false;
    let failureReason = '';

    if (!qrCode || !qrCode.qr) {
      failureReason = 'Invalid QR code';
      validationSummary.qrExists = false;
    } else {
      validationSummary.qrExists = true;

      if (new Date(qrCode.qr.expiresAt) < new Date()) {
        failureReason = 'QR code expired';
        validationSummary.qrExpired = true;
      } else if (qrCode.qr.isUsed) {
        failureReason = 'QR code already used';
        validationSummary.qrUsed = true;
      } else {
        validationSummary.nonceMatch = true;

        // Optimized: We no longer compare hashes from token to allow for lighter QR codes.
        // We strictly validate against the current Database rules below.
        validationSummary.networkAllowed = true;

        if (String(networkType).toLowerCase().includes('cellular') ||
          ['2g', '3g', '4g', '5g', 'slow-2g'].includes(String(networkType).toLowerCase())) {
          failureReason = 'Cellular network detected. Connect to office Wi-Fi.';
          validationSummary.networkAllowed = false;
        } else {
          validationSummary.networkAllowed = true;

          const allowedRanges = qrCode.office?.allowedIPRanges || [];
          if (!allowedRanges.length) {
            failureReason = 'Office network is not configured (allowed IP ranges missing)';
            validationSummary.ipAllowed = false;
          } else if (!isIpInRanges(ipAddress, allowedRanges)) {
            failureReason = 'Not on corporate network';
            validationSummary.ipAllowed = false;
          } else {
            validationSummary.ipAllowed = true;

            const allowedSSIDs = qrCode.office?.allowedSSIDs || [];
            if (ssid && allowedSSIDs.length && !allowedSSIDs.includes(ssid)) {
              failureReason = 'Wi-Fi SSID mismatch';
              validationSummary.ssidMatch = false;
            } else {
              validationSummary.ssidMatch = true;

              const [user] = await db
                .select()
                .from(users)
                .where(eq(users.id, userId))
                .limit(1);

              if (!user) {
                failureReason = 'User not found';
              } else if (!user.fingerprintHash) {
                await db
                  .update(users)
                  .set({ fingerprintHash })
                  .where(eq(users.id, userId));
                validationSummary.fingerprintMatch = true;
              } else if (user.fingerprintHash !== fingerprintHash) {
                failureReason = 'Fingerprint mismatch';
                validationSummary.fingerprintMatch = false;
              } else {
                validationSummary.fingerprintMatch = true;
              }

              if (validationSummary.fingerprintMatch) {
                const today = moment().startOf('day').toDate();
                const todayEnd = moment(today).endOf('day').toDate();

                const [existingAttendance] = await db
                  .select()
                  .from(attendance)
                  .where(
                    and(
                      eq(attendance.employeeId, userId),
                      gte(attendance.date, today),
                      sql`${attendance.date} <= ${todayEnd}`,
                      sql`${attendance.checkInTime} IS NOT NULL`
                    )
                  )
                  .limit(1);

                if (existingAttendance) {
                  failureReason = 'Already checked in today';
                  validationSummary.alreadyCheckedIn = true;
                } else {
                  validationSummary.alreadyCheckedIn = false;

                  const [activeLeave] = await db
                    .select()
                    .from(leaves)
                    .where(
                      and(
                        eq(leaves.employeeId, userId),
                        eq(leaves.status, 'approved'),
                        sql`${leaves.startDate} <= ${todayEnd}`,
                        sql`${leaves.endDate} >= ${today}`
                      )
                    )
                    .limit(1);

                  if (activeLeave) {
                    failureReason = `Cannot check in. Employee is on approved leave from ${moment(activeLeave.startDate).format('YYYY-MM-DD')} to ${moment(activeLeave.endDate).format('YYYY-MM-DD')}`;
                    validationSummary.onLeave = true;
                  } else {
                    validationSummary.onLeave = false;
                    isValid = true;
                  }
                }
              }
            }
          }
        }
      }
    }
  }

    const suspiciousFlags = ipAnomaly.isSuspicious ? ipAnomaly.flags : [];
  if (!isValid) {
    suspiciousFlags.push('VALIDATION_FAILED');
    if (!validationSummary.ipAllowed) suspiciousFlags.push('IP_MISMATCH');
    if (ssid && !validationSummary.ssidMatch) suspiciousFlags.push('SSID_MISMATCH');
    if (!validationSummary.fingerprintMatch) suspiciousFlags.push('FINGERPRINT_MISMATCH');
    if (!validationSummary.networkAllowed) suspiciousFlags.push('CELLULAR_NETWORK');
  }

  validationSummary.syncStatus = isValid ? 'final' : 'rejected';

  await db.insert(qrValidationLogs).values({
    qrId,
    userId,
    officeId: qrCode?.office?.id || null,
    isValid,
    validationResult: validationSummary,
    gpsLat: null,
    gpsLng: null,
    gpsAccuracy: null,
    ipAddress,
    userAgent,
    failureReason: isValid ? null : failureReason,
    isSuspicious: suspiciousFlags.length > 0,
    suspiciousFlags
  });

  if (!isValid) {
    return res.status(400).json({
      success: false,
      message: failureReason,
      validationResult: validationSummary
    });
  }

  await db
    .update(qrCodes)
    .set({
      isUsed: true,
      usedAt: new Date(),
      usedBy: userId
    })
    .where(eq(qrCodes.qrId, qrId));

  const checkInTime = new Date();
  const today = moment().startOf('day').toDate();

  const [attendanceRecord] = await db
    .insert(attendance)
    .values({
      employeeId: userId,
      date: today,
      checkInTime,
      checkInLocation: `QR: ${qrCode.office.name}`,
      checkInIpAddress: ipAddress,
      checkInDeviceInfo: userAgent,
      status: 'present'
    })
    .returning();

  const [employee] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  res.json({
    success: true,
    message: 'Attendance recorded successfully',
    data: {
      attendance: {
        ...attendanceRecord,
        employee: {
          id: employee.id,
          name: employee.name,
          employeeId: employee.employeeId
        }
      },
      office: {
        id: qrCode.office.id,
        name: qrCode.office.name
      },
      checkInTime: checkInTime.toISOString()
    }
  });
} catch (error) {
  console.error('QR validation error:', error);
  res.status(500).json({
    success: false,
    message: 'Server error validating QR code'
  });
}
};

router.post('/validate', authenticate, validateQR);

/**
 * @route   GET /api/qr/active
 * @desc    Get active QR codes for an office
 * @access  Private (Admin/HR only)
 */
router.get('/active', authenticate, authorize('admin', 'hr'), async (req, res) => {
  try {
    const db = getDB();
    const { officeId } = req.query;

    let conditions = [
      eq(qrCodes.isUsed, false),
      gte(qrCodes.expiresAt, new Date())
    ];

    if (officeId) {
      conditions.push(eq(qrCodes.officeId, parseInt(officeId)));
    }

    const activeQRCodes = await db
      .select({
        qr: qrCodes,
        office: offices
      })
      .from(qrCodes)
      .leftJoin(offices, eq(qrCodes.officeId, offices.id))
      .where(and(...conditions))
      .orderBy(qrCodes.createdAt);

    res.json({
      success: true,
      data: activeQRCodes.map(item => ({
        qrId: item.qr.qrId,
        office: {
          id: item.office.id,
          name: item.office.name
        },
        officeNetwork: {
          allowedSSIDs: item.office.allowedSSIDs || [],
          allowedIPRanges: item.office.allowedIPRanges || []
        },
        expiresAt: item.qr.expiresAt,
        createdAt: item.qr.createdAt
      }))
    });
  } catch (error) {
    console.error('Get active QR codes error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching active QR codes'
    });
  }
});

/**
 * @route   GET /api/qr/active-public
 * @desc    Get active QR image for an office (employee view)
 * @access  Private
 */
router.get('/active-public', authenticate, async (req, res) => {
  try {
    const db = getDB();
    const { officeId } = req.query;

    let conditions = [
      eq(qrCodes.isUsed, false),
      gte(qrCodes.expiresAt, new Date())
    ];

    if (officeId) {
      conditions.push(eq(qrCodes.officeId, parseInt(officeId)));
    }

    const [activeQR] = await db
      .select({
        qr: qrCodes,
        office: offices
      })
      .from(qrCodes)
      .leftJoin(offices, eq(qrCodes.officeId, offices.id))
      .where(and(...conditions))
      .orderBy(qrCodes.createdAt)
      .limit(1);

    if (!activeQR || !activeQR.qr) {
      return res.json({
        success: true,
        data: null
      });
    }

    // Extract token string from payload object (ensure it's a string for the generator)
    const token = typeof activeQR.qr.payload === 'object' && activeQR.qr.payload !== null
      ? activeQR.qr.payload.token || JSON.stringify(activeQR.qr.payload)
      : activeQR.qr.payload;

    const qrImage = await generateQRCodeImage(token);

    res.json({
      success: true,
      data: {
        qrId: activeQR.qr.qrId,
        qrImage,
        expiresAt: activeQR.qr.expiresAt,
        office: {
          id: activeQR.office?.id,
          name: activeQR.office?.name
        }
      }
    });
  } catch (error) {
    console.error('Get active public QR error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching active QR'
    });
  }
});

/**
 * @route   GET /api/qr/validation-logs
 * @desc    Get QR validation logs (for admin dashboard)
 * @access  Private (Admin/HR only)
 */
router.get('/validation-logs', authenticate, authorize('admin', 'hr'), async (req, res) => {
  try {
    const db = getDB();
    const { page = 1, limit = 50, officeId, isSuspicious } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let conditions = [];

    if (officeId) {
      conditions.push(eq(qrValidationLogs.officeId, parseInt(officeId)));
    }

    if (isSuspicious === 'true') {
      conditions.push(eq(qrValidationLogs.isSuspicious, true));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const logs = await db
      .select({
        log: qrValidationLogs,
        user: users,
        office: offices
      })
      .from(qrValidationLogs)
      .leftJoin(users, eq(qrValidationLogs.userId, users.id))
      .leftJoin(offices, eq(qrValidationLogs.officeId, offices.id))
      .where(whereClause)
      .orderBy(qrValidationLogs.createdAt)
      .limit(parseInt(limit))
      .offset(offset);

    const totalResult = await db
      .select({ count: sql`count(*)` })
      .from(qrValidationLogs)
      .where(whereClause);

    const total = Number(totalResult[0]?.count || 0);

    res.json({
      success: true,
      data: {
        docs: logs.map(item => ({
          id: item.log.id,
          qrId: item.log.qrId,
          user: item.user ? {
            id: item.user.id,
            name: item.user.name,
            employeeId: item.user.employeeId
          } : null,
          office: item.office ? {
            id: item.office.id,
            name: item.office.name
          } : null,
          isValid: item.log.isValid,
          gps: {
            lat: parseFloat(item.log.gpsLat),
            lng: parseFloat(item.log.gpsLng),
            accuracy: item.log.gpsAccuracy
          },
          ipAddress: item.log.ipAddress,
          isSuspicious: item.log.isSuspicious,
          suspiciousFlags: item.log.suspiciousFlags,
          failureReason: item.log.failureReason,
          createdAt: item.log.createdAt
        })),
        totalDocs: total,
        limit: parseInt(limit),
        page: parseInt(page),
        totalPages: Math.ceil(total / parseInt(limit))
      }
    });
  } catch (error) {
    console.error('Get validation logs error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching validation logs'
    });
  }
});

export default router;
