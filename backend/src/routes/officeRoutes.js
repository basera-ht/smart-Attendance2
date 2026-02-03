import express from 'express';
import { body, validationResult } from 'express-validator';
import { eq, and } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { offices, geofences } from '../db/schema.js';
import { authenticate, authorize } from '../middleware/authMiddleware.js';
import { getClientIp } from '../utils/ipUtils.js';
import { generateQRToken } from '../services/qrService.js';

const router = express.Router();

/**
 * @route   GET /api/offices/network/ip
 * @desc    Get client IP and /32 (or /128) CIDR suggestion
 * @access  Private (Admin/HR only)
 */
router.get('/network/ip', authenticate, authorize('admin', 'hr'), (req, res) => {
  const ip = getClientIp(req);
  if (!ip) {
    return res.status(400).json({
      success: false,
      message: 'Unable to determine client IP'
    });
  }

  const cidr = ip.includes(':') ? `${ip}/128` : `${ip}/32`;
  res.json({
    success: true,
    data: {
      ip,
      cidr
    }
  });
});

/**
 * @route   GET /api/offices
 * @desc    Get all offices
 * @access  Private
 */
router.get('/', authenticate, async (req, res) => {
  try {
    const db = getDB();
    const { activeOnly = 'true' } = req.query;

    let conditions = [];
    if (activeOnly === 'true') {
      conditions.push(eq(offices.isActive, true));
    }

    const officeList = await db
      .select()
      .from(offices)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(offices.name);

    res.json({
      success: true,
      data: officeList
    });
  } catch (error) {
    console.error('Get offices error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching offices'
    });
  }
});

/**
 * @route   POST /api/offices
 * @desc    Create a new office
 * @access  Private (Admin/HR only)
 */
router.post('/', authenticate, authorize('admin', 'hr'), [
  body('name').notEmpty().trim().withMessage('Office name is required'),
  body('address').optional().trim(),
  body('allowedSSIDs').optional().isArray(),
  body('allowedIPRanges').optional().isArray(),
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

    const db = getDB();
    const { name, address, allowedSSIDs = [], allowedIPRanges = [] } = req.body;

    const [office] = await db
      .insert(offices)
      .values({
        name,
        address: address || null,
        allowedSSIDs,
        allowedIPRanges,
        createdById: req.user.id
      })
      .returning();

    res.status(201).json({
      success: true,
      message: 'Office created successfully',
      data: office
    });
  } catch (error) {
    console.error('Create office error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating office'
    });
  }
});

/**
 * @route   PUT /api/offices/:id
 * @desc    Update an office
 * @access  Private (Admin/HR only)
 */
router.put('/:id', authenticate, authorize('admin', 'hr'), [
  body('name').optional().trim(),
  body('address').optional().trim(),
  body('isActive').optional().isBoolean(),
  body('allowedSSIDs').optional().isArray(),
  body('allowedIPRanges').optional().isArray(),
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

    const db = getDB();
    const { id } = req.params;
    const { name, address, isActive, allowedSSIDs, allowedIPRanges } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (address !== undefined) updateData.address = address || null;
    if (isActive !== undefined) updateData.isActive = isActive;
    if (allowedSSIDs !== undefined) updateData.allowedSSIDs = allowedSSIDs;
    if (allowedIPRanges !== undefined) updateData.allowedIPRanges = allowedIPRanges;

    const [updated] = await db
      .update(offices)
      .set(updateData)
      .where(eq(offices.id, parseInt(id)))
      .returning();

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Office not found'
      });
    }

    res.json({
      success: true,
      message: 'Office updated successfully',
      data: updated
    });
  } catch (error) {
    console.error('Update office error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating office'
    });
  }
});

/**
 * @route   GET /api/offices/:id/geofences
 * @desc    Get geofences for an office
 * @access  Private
 */
router.get('/:id/geofences', authenticate, async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;
    const { activeOnly = 'true' } = req.query;

    let conditions = [eq(geofences.officeId, parseInt(id))];
    if (activeOnly === 'true') {
      conditions.push(eq(geofences.isActive, true));
    }

    const geofenceList = await db
      .select()
      .from(geofences)
      .where(and(...conditions))
      .orderBy(geofences.name);

    res.json({
      success: true,
      data: geofenceList
    });
  } catch (error) {
    console.error('Get geofences error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error fetching geofences'
    });
  }
});

/**
 * @route   POST /api/offices/:id/geofences
 * @desc    Create a geofence for an office
 * @access  Private (Admin/HR only)
 */
router.post('/:id/geofences', authenticate, authorize('admin', 'hr'), [
  body('name').notEmpty().trim().withMessage('Geofence name is required'),
  body('polygon').isObject().withMessage('Polygon (GeoJSON) is required'),
  body('polygon.type').equals('Polygon').withMessage('Polygon type must be "Polygon"'),
  body('polygon.coordinates').isArray().withMessage('Polygon coordinates are required'),
  body('tolerance').optional().isInt({ min: 5, max: 50 }).withMessage('Tolerance must be between 5-50 meters'),
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

    const db = getDB();
    const { id } = req.params;
    const { name, polygon, tolerance = 15 } = req.body;

    // Verify office exists
    const [office] = await db
      .select()
      .from(offices)
      .where(eq(offices.id, parseInt(id)))
      .limit(1);

    if (!office) {
      return res.status(404).json({
        success: false,
        message: 'Office not found'
      });
    }

    const [geofence] = await db
      .insert(geofences)
      .values({
        officeId: parseInt(id),
        name,
        polygon,
        tolerance,
        createdById: req.user.id
      })
      .returning();

    res.status(201).json({
      success: true,
      message: 'Geofence created successfully',
      data: geofence
    });
  } catch (error) {
    console.error('Create geofence error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error creating geofence'
    });
  }
});

/**
 * @route   PUT /api/offices/:id/geofences/:geofenceId
 * @desc    Update a geofence
 * @access  Private (Admin/HR only)
 */
router.put('/:id/geofences/:geofenceId', authenticate, authorize('admin', 'hr'), [
  body('name').optional().trim(),
  body('polygon').optional().isObject(),
  body('polygon.type').optional().equals('Polygon'),
  body('polygon.coordinates').optional().isArray(),
  body('tolerance').optional().isInt({ min: 5, max: 50 }),
  body('isActive').optional().isBoolean(),
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

    const db = getDB();
    const { id, geofenceId } = req.params;
    const { name, polygon, tolerance, isActive } = req.body;

    const updateData = {};
    if (name !== undefined) updateData.name = name;
    if (polygon !== undefined) updateData.polygon = polygon;
    if (tolerance !== undefined) updateData.tolerance = tolerance;
    if (isActive !== undefined) updateData.isActive = isActive;

    const [updated] = await db
      .update(geofences)
      .set(updateData)
      .where(and(eq(geofences.id, parseInt(geofenceId)), eq(geofences.officeId, parseInt(id))))
      .returning();

    if (!updated) {
      return res.status(404).json({
        success: false,
        message: 'Geofence not found'
      });
    }

    res.json({
      success: true,
      message: 'Geofence updated successfully',
      data: updated
    });
  } catch (error) {
    console.error('Update geofence error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error updating geofence'
    });
  }
});

/**
 * @route   DELETE /api/offices/:id/geofences/:geofenceId
 * @desc    Delete a geofence
 * @access  Private (Admin/HR only)
 */
router.delete('/:id/geofences/:geofenceId', authenticate, authorize('admin', 'hr'), async (req, res) => {
  try {
    const db = getDB();
    const { id, geofenceId } = req.params;

    const [deleted] = await db
      .delete(geofences)
      .where(and(eq(geofences.id, parseInt(geofenceId)), eq(geofences.officeId, parseInt(id))))
      .returning();

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Geofence not found'
      });
    }

    res.json({
      success: true,
      message: 'Geofence deleted successfully'
    });
  } catch (error) {
    console.error('Delete geofence error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting geofence'
    });
  }
});

/**
 * @route   DELETE /api/offices/:id
 * @desc    Delete an office
 * @access  Private (Admin/HR only)
 */
router.delete('/:id', authenticate, authorize('admin', 'hr'), async (req, res) => {
  try {
    const db = getDB();
    const { id } = req.params;

    const [deleted] = await db
      .delete(offices)
      .where(eq(offices.id, parseInt(id)))
      .returning();

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Office not found'
      });
    }

    res.json({
      success: true,
      message: 'Office deleted successfully'
    });
  } catch (error) {
    console.error('Delete office error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error deleting office'
    });
  }
});

/**
 * @route   GET /api/offices/:id/qr-token
 * @desc    Get a signed QR token for an office (Dynamic QR)
 * @access  Private (Admin/HR only)
 */
router.get('/:id/qr-token', authenticate, authorize('admin', 'hr'), async (req, res) => {
  try {
    const { id } = req.params;
    const token = generateQRToken(parseInt(id));

    res.json({
      success: true,
      data: {
        token,
        expiresIn: 30 // seconds
      }
    });
  } catch (error) {
    console.error('Get QR Token error:', error);
    res.status(500).json({ success: false, message: 'Server error generating QR token' });
  }
});

export default router;
