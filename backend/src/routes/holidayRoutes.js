import express from 'express';
import { body, validationResult } from 'express-validator';
import { eq, and, inArray, asc } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { selectedOptionalHolidays } from '../db/schema.js';
import { authenticate, authorize } from '../middleware/authMiddleware.js';

const router = express.Router();

// @route   GET /api/holidays/selected
// @desc    Get selected optional holidays for a year (public read, admin-only write)
// @access  Private (All authenticated users can read, Admin/HR can write)
router.get('/selected', authenticate, async (req, res) => {
  try {
    const db = getDB();
    const { year = new Date().getFullYear() } = req.query;
    const yearNum = parseInt(year);

    const selectedHolidays = await db
      .select()
      .from(selectedOptionalHolidays)
      .where(eq(selectedOptionalHolidays.year, yearNum))
      .orderBy(asc(selectedOptionalHolidays.holidayId));

    res.json({
      success: true,
      data: selectedHolidays.map(h => h.holidayId)
    });
  } catch (error) {
    console.error('Error fetching selected holidays:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch selected holidays',
      error: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
});

// @route   POST /api/holidays/selected
// @desc    Set selected optional holidays for a year
// @access  Private (Admin/HR only)
router.post('/selected', 
  authenticate, 
  authorize('admin', 'hr'),
  [
    body('holidayIds').isArray().withMessage('holidayIds must be an array'),
    body('holidayIds.*').isInt().withMessage('Each holiday ID must be an integer'),
    body('year').optional().isInt().withMessage('Year must be an integer')
  ],
  async (req, res) => {
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
      const { holidayIds, year = new Date().getFullYear() } = req.body;
      const yearNum = parseInt(year);

      // Validate that at most 2 holidays are selected
      if (holidayIds.length > 2) {
        return res.status(400).json({
          success: false,
          message: 'Maximum 2 optional holidays can be selected per year'
        });
      }

      // Start transaction: delete existing selections for the year, then insert new ones
      // First, delete all existing selections for this year
      await db
        .delete(selectedOptionalHolidays)
        .where(eq(selectedOptionalHolidays.year, yearNum));

      // Insert new selections
      if (holidayIds.length > 0) {
        const insertData = holidayIds.map(holidayId => ({
          holidayId: parseInt(holidayId),
          year: yearNum,
          selectedBy: req.user.id
        }));

        await db
          .insert(selectedOptionalHolidays)
          .values(insertData);
      }

      res.json({
        success: true,
        message: 'Selected holidays updated successfully',
        data: {
          year: yearNum,
          selectedHolidayIds: holidayIds
        }
      });
    } catch (error) {
      console.error('Error updating selected holidays:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update selected holidays',
        error: error.message
      });
    }
  }
);

// @route   PUT /api/holidays/selected
// @desc    Update selected optional holidays for a year (same as POST, but for RESTful consistency)
// @access  Private (Admin/HR only)
router.put('/selected',
  authenticate,
  authorize('admin', 'hr'),
  [
    body('holidayIds').isArray().withMessage('holidayIds must be an array'),
    body('holidayIds.*').isInt().withMessage('Each holiday ID must be an integer'),
    body('year').optional().isInt().withMessage('Year must be an integer')
  ],
  async (req, res) => {
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
      const { holidayIds, year = new Date().getFullYear() } = req.body;
      const yearNum = parseInt(year);

      // Validate that at most 2 holidays are selected
      if (holidayIds.length > 2) {
        return res.status(400).json({
          success: false,
          message: 'Maximum 2 optional holidays can be selected per year'
        });
      }

      // Start transaction: delete existing selections for the year, then insert new ones
      // First, delete all existing selections for this year
      await db
        .delete(selectedOptionalHolidays)
        .where(eq(selectedOptionalHolidays.year, yearNum));

      // Insert new selections
      if (holidayIds.length > 0) {
        const insertData = holidayIds.map(holidayId => ({
          holidayId: parseInt(holidayId),
          year: yearNum,
          selectedBy: req.user.id
        }));

        await db
          .insert(selectedOptionalHolidays)
          .values(insertData);
      }

      res.json({
        success: true,
        message: 'Selected holidays updated successfully',
        data: {
          year: yearNum,
          selectedHolidayIds: holidayIds
        }
      });
    } catch (error) {
      console.error('Error updating selected holidays:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to update selected holidays',
        error: error.message
      });
    }
  }
);

export default router;

