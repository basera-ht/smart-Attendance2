import express from 'express';
import { body, validationResult } from 'express-validator';
import { eq, and, desc } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { tasks } from '../db/schema.js';
import { authenticate } from '../middleware/authMiddleware.js';

const router = express.Router();

// @route   GET /api/tasks
// @desc    Get all tasks for the authenticated employee
// @access  Private
router.get('/', authenticate, async (req, res) => {
  try {
    const db = getDB();
    const { status, priority } = req.query;
    
    let conditions = [eq(tasks.employeeId, req.user.id)];
    
    if (status) {
      conditions.push(eq(tasks.status, status));
    }
    
    if (priority) {
      conditions.push(eq(tasks.priority, priority));
    }

    const whereClause = and(...conditions);

    const taskRecords = await db
      .select()
      .from(tasks)
      .where(whereClause)
      .orderBy(desc(tasks.createdAt));

    res.json({
      success: true,
      data: taskRecords
    });
  } catch (error) {
    console.error('Get tasks error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching tasks'
    });
  }
});

// @route   POST /api/tasks
// @desc    Create a new task
// @access  Private
router.post('/', authenticate, [
  body('title').trim().notEmpty().withMessage('Task title is required'),
  body('description').optional().trim(),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('dueDate').optional().isISO8601()
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

    const { title, description, priority, dueDate, tags } = req.body;
    const db = getDB();

    const [task] = await db
      .insert(tasks)
      .values({
        employeeId: req.user.id,
        title: title.trim(),
        description: description?.trim() || null,
        priority: priority || 'medium',
        dueDate: dueDate ? new Date(dueDate) : null,
        tags: tags || [],
        status: 'pending',
      })
      .returning();

    res.status(201).json({
      success: true,
      message: 'Task created successfully',
      data: task
    });
  } catch (error) {
    console.error('Create task error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while creating task'
    });
  }
});

// @route   PUT /api/tasks/:id
// @desc    Update a task
// @access  Private
router.put('/:id', authenticate, [
  body('title').optional().trim().notEmpty(),
  body('description').optional().trim(),
  body('priority').optional().isIn(['low', 'medium', 'high', 'urgent']),
  body('status').optional().isIn(['pending', 'in-progress', 'completed', 'cancelled']),
  body('dueDate').optional().isISO8601()
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
    const [task] = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.id, req.params.id),
          eq(tasks.employeeId, req.user.id)
        )
      )
      .limit(1);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    const { title, description, priority, status, dueDate, tags } = req.body;
    const updateData = { updatedAt: new Date() };

    if (title) updateData.title = title.trim();
    if (description !== undefined) updateData.description = description?.trim() || null;
    if (priority) updateData.priority = priority;
    if (dueDate) updateData.dueDate = new Date(dueDate);
    if (tags) updateData.tags = tags;

    // Handle status change
    if (status) {
      updateData.status = status;
      if (status === 'completed' && !task.completedAt) {
        updateData.completedAt = new Date();
      } else if (status !== 'completed') {
        updateData.completedAt = null;
      }
    }

    const [updatedTask] = await db
      .update(tasks)
      .set(updateData)
      .where(eq(tasks.id, req.params.id))
      .returning();

    res.json({
      success: true,
      message: 'Task updated successfully',
      data: updatedTask
    });
  } catch (error) {
    console.error('Update task error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while updating task'
    });
  }
});

// @route   DELETE /api/tasks/:id
// @desc    Delete a task
// @access  Private
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const db = getDB();
    const [task] = await db
      .select()
      .from(tasks)
      .where(
        and(
          eq(tasks.id, req.params.id),
          eq(tasks.employeeId, req.user.id)
        )
      )
      .limit(1);

    if (!task) {
      return res.status(404).json({
        success: false,
        message: 'Task not found'
      });
    }

    await db
      .delete(tasks)
      .where(eq(tasks.id, req.params.id));

    res.json({
      success: true,
      message: 'Task deleted successfully'
    });
  } catch (error) {
    console.error('Delete task error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting task'
    });
  }
});

export default router;
