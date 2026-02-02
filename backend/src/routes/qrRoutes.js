import express from 'express';
import { body, validationResult } from 'express-validator';
import { eq, and, gte } from 'drizzle-orm';
import moment from 'moment';
import { getDB } from '../config/db.js';
import { qrCodes, offices, qrValidationLogs, attendance, users, leaves } from '../db/schema.js';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { generateQRCodeImage, generateNonce, generateQRId } from '../utils/qrGenerator.js';
import { detectIPAnomalies } from '../middleware/ipAnomalyDetection.js';
import { getClientIp, isIpInRanges } from '../utils/ipUtils.js';
import { signQrToken, verifyQrToken, getQrPublicKey, getQrKeyId } from '../utils/qrJwt.js';
import haversine from 'haversine-distance';

const router = express.Router();

// Configuration
const QR_ROTATION_INTERVAL = 30; // Seconds
const MAX_DISTANCE_METERS = 100; // Allowed radius (meters)

/**
 * @route   GET /api/qr/public-key
 * @desc    Get public key for QR JWT verification
 * @access  Public
 */
router.get('/public-key', (req, res) => {
  const publicKey = getQrPublicKey();
  res.json({ success: true, data: { keyId: getQrKeyId(), publicKey } });
});

/**
 * @route   GET /api/qr/active-rotating
 * @desc    Get the current ROTATING QR code (Changes every 30s)
 * @access  Private (Admin/HR/Display)
 */
router.get('/active-rotating', authenticate, async (req, res) => {
  try {
    const db = getDB();
    const { officeId } = req.query;

    if (!officeId) {
      return res.status(400).json({ success: false, message: 'Office ID required' });
    }

    // 1. Check Office
    const [office] = await db.select().from(offices).where(eq(offices.id, parseInt(officeId))).limit(1);
    if (!office || !office.isActive) {
      return res.status(404).json({ success: false, message: 'Office not found or inactive' });
    }

    // 2. Generate Short-Lived Token (30s)
    const qrId = generateQRId();
    const expiresAt = moment().add(QR_ROTATION_INTERVAL, 'seconds').toDate();

    // Minimal Payload: ID + Office + Timestamp
    const token = signQrToken({
      qrId,
      officeId: office.id,
      expiresAt: expiresAt.toISOString(),
      generatedAt: new Date().toISOString()
    });

    // 3. Store (Optional cleanup: DB might grow fast, maybe use Redis in future)
    // We store it to strictly validate "Active" state.
    // To prevent DB bloat, a cron job should clean old QRs, or we use a separate ephemeral store.
    await db.insert(qrCodes).values({
      qrId,
      officeId: office.id,
      payload: { token },
      expiresAt,
      nonce: generateNonce(),
      createdById: req.user.id
    });

    // 4. Generate Image
    const qrImage = await generateQRCodeImage(token);

    res.json({
      success: true,
      data: {
        qrId,
        qrImage,
        expiresAt,
        interval: QR_ROTATION_INTERVAL,
        office: { name: office.name }
      }
    });

  } catch (error) {
    console.error('Rotating QR Error:', error);
    res.status(500).json({ success: false, message: 'Error generating rotating QR' });
  }
});


/**
 * @route   POST /api/qr/validate-secure
 * @desc    Validate QR with GPS + IP Security
 * @access  Private (Employee Scanner)
 */
router.post('/validate-secure', authenticate, [
  body('token').notEmpty(),
  body('latitude').isFloat(),
  body('longitude').isFloat()
], async (req, res) => {
  try {
    // 1. Basic Input Validation
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ success: false, errors: errors.array() });

    const db = getDB();
    const { token, latitude, longitude, networkType, ssid } = req.body;
    const userId = req.user.id;
    const userIp = getClientIp(req);

    // 2. Token Verification
    let payload;
    try {
      payload = verifyQrToken(token);
    } catch (e) {
      return res.status(401).json({ success: false, message: 'Invalid or Expired QR Token' });
    }

    const { qrId, officeId } = payload;

    // 3. DB Lookup: QR Status
    const [qrCode] = await db.select().from(qrCodes).where(eq(qrCodes.qrId, qrId)).limit(1);

    if (!qrCode) return res.status(400).json({ success: false, message: 'Invalid QR Code' });
    if (qrCode.isUsed) return res.status(400).json({ success: false, message: 'QR Code already used' });
    if (new Date(qrCode.expiresAt) < new Date()) return res.status(400).json({ success: false, message: 'QR Code Expired' });

    // 4. DB Lookup: Office Location & Rules
    const [office] = await db.select().from(offices).where(eq(offices.id, officeId)).limit(1);
    if (!office) return res.status(400).json({ success: false, message: 'Office not found' });

    let failureReason = null;

    // SECURITY CHECK 1: IP Address
    // Allow if IP is in range OR if "Skip IP Check" is enabled (e.g. for testing)
    // Assuming strict mode:
    if (office.allowedIPRanges && office.allowedIPRanges.length > 0) {
      if (!isIpInRanges(userIp, office.allowedIPRanges)) {
        // Optional: Allow cellular if GPS is perfect? No, User wanted strict.
        failureReason = `Network Mismatch: You are on ${userIp}. Connect to Office Wi-Fi.`;
      }
    }

    // SECURITY CHECK 2: GPS Geolocation
    // Calculate distance
    let distance = -1;
    if (office.latitude && office.longitude) {
      const userLoc = { lat: parseFloat(latitude), lon: parseFloat(longitude) };
      const officeLoc = { lat: parseFloat(office.latitude), lon: parseFloat(office.longitude) };

      distance = haversine(userLoc, officeLoc); // Returns meters

      if (distance > MAX_DISTANCE_METERS) {
        failureReason = `Location Mismatch: You are ${Math.round(distance)}m away. Must be within ${MAX_DISTANCE_METERS}m.`;
      }
    } else {
      // If Office has no GPS set, we might skip or fail. 
      // For "Next Gen", strict mode implies we should fail or warn.
      // We'll warn but allow if IP is good.
      console.warn(`Office ${office.id} missing GPS coordinates. Skipping GPS check.`);
    }

    // 5. Audit Log
    await db.insert(qrValidationLogs).values({
      qrId, userId, officeId,
      isValid: !failureReason,
      gpsLat: String(latitude), gpsLng: String(longitude), gpsAccuracy: Math.round(distance),
      ipAddress: userIp,
      failureReason,
      validationResult: { distance, maxAllowed: MAX_DISTANCE_METERS }
    });

    if (failureReason) {
      return res.status(400).json({ success: false, message: failureReason });
    }

    // 6. Success: Mark Used & Record Attendance
    await db.update(qrCodes).set({ isUsed: true, usedAt: new Date(), usedBy: userId }).where(eq(qrCodes.qrId, qrId));

    const today = moment().startOf('day').toDate();
    const [existing] = await db.select().from(attendance)
      .where(and(eq(attendance.employeeId, userId), gte(attendance.date, today)))
      .limit(1);

    if (existing) return res.status(400).json({ success: false, message: "Already checked in today" });

    const [record] = await db.insert(attendance).values({
      employeeId: userId,
      date: today,
      checkInTime: new Date(),
      checkInLocation: `Fixed QR (${Math.round(distance)}m)`,
      checkInIpAddress: userIp,
      status: 'present'
    }).returning();

    const [employee] = await db.select().from(users).where(eq(users.id, userId)).limit(1);

    res.json({
      success: true,
      message: 'Secure Check-in Successful',
      data: {
        attendance: { ...record, employee: { name: employee.name } },
        distance: Math.round(distance)
      }
    });

  } catch (error) {
    console.error('Secure Validate Error:', error);
    res.status(500).json({ success: false, message: 'Server Security Error' });
  }
});

export default router;
