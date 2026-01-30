import { eq, and, or, like, sql, desc } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { users } from '../db/schema.js';

export const getEmployees = async (req, res) => {
  try {
    const db = getDB();
    const { page = 1, limit = 10, department, status, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    
    // Build filter conditions
    let conditions = [];
    
    if (department) {
      conditions.push(eq(users.department, department));
    }
    
    if (status) {
      // Map status to isActive
      if (status === 'active') {
        conditions.push(eq(users.isActive, true));
      } else if (status === 'inactive') {
        conditions.push(eq(users.isActive, false));
      }
    }
    
    if (search) {
      conditions.push(
        or(
          like(users.name, `%${search}%`),
          like(users.email, `%${search}%`),
          like(users.employeeId, `%${search}%`)
        )
      );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Get total count
    const totalResult = await db
      .select({ count: sql`count(*)` })
      .from(users)
      .where(whereClause);
    const total = Number(totalResult[0]?.count || 0);

    // Get employees
    const employees = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        employeeId: users.employeeId,
        department: users.department,
        position: users.position,
        phone: users.phone,
        address: users.address,
        isActive: users.isActive,
        lastLogin: users.lastLogin,
        profilePicture: users.profilePicture,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(parseInt(limit))
      .offset(offset);

    res.json({
      success: true,
      data: employees,
      pagination: {
        current: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
        total
      }
    });
  } catch (error) {
    console.error('Get employees error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching employees',
      error: error.message
    });
  }
};

export const getEmployee = async (req, res) => {
  try {
    const db = getDB();
    const [employee] = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        employeeId: users.employeeId,
        department: users.department,
        position: users.position,
        phone: users.phone,
        address: users.address,
        isActive: users.isActive,
        lastLogin: users.lastLogin,
        profilePicture: users.profilePicture,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, req.params.id))
      .limit(1);
    
    if (!employee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    res.json({
      success: true,
      data: employee
    });
  } catch (error) {
    console.error('Get employee error:', error);
    res.status(500).json({
      success: false,
      message: 'Error fetching employee',
      error: error.message
    });
  }
};

export const updateEmployee = async (req, res) => {
  try {
    const db = getDB();
    const { name, email, role, department, position, phone, status } = req.body;
    
    const updateData = {
      updatedAt: new Date(),
    };
    
    if (name) updateData.name = name.trim();
    if (email) updateData.email = email.toLowerCase().trim();
    if (role) updateData.role = role;
    if (department !== undefined) updateData.department = department?.trim() || null;
    if (position !== undefined) updateData.position = position?.trim() || null;
    if (phone !== undefined) updateData.phone = phone?.trim() || null;
    if (status !== undefined) {
      // Map status to isActive
      updateData.isActive = status === 'active';
    }
    
    const [updatedEmployee] = await db
      .update(users)
      .set(updateData)
      .where(eq(users.id, req.params.id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        employeeId: users.employeeId,
        department: users.department,
        position: users.position,
        phone: users.phone,
        address: users.address,
        isActive: users.isActive,
        lastLogin: users.lastLogin,
        profilePicture: users.profilePicture,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });

    if (!updatedEmployee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    res.json({
      success: true,
      message: 'Employee updated successfully',
      data: updatedEmployee
    });
  } catch (error) {
    console.error('Update employee error:', error);
    
    if (error.code === '23505') {
      return res.status(400).json({
        success: false,
        message: 'Email or employee ID already exists'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Error updating employee',
      error: error.message
    });
  }
};

export const deleteEmployee = async (req, res) => {
  try {
    const db = getDB();
    const [updatedEmployee] = await db
      .update(users)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(users.id, req.params.id))
      .returning({ id: users.id });

    if (!updatedEmployee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    res.json({
      success: true,
      message: 'Employee deactivated successfully'
    });
  } catch (error) {
    console.error('Delete employee error:', error);
    res.status(500).json({
      success: false,
      message: 'Error deactivating employee',
      error: error.message
    });
  }
};

export const updateEmployeeStatus = async (req, res) => {
  try {
    const db = getDB();
    const { status } = req.body;
    
    if (!['active', 'inactive'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be "active" or "inactive"'
      });
    }
    
    const [updatedEmployee] = await db
      .update(users)
      .set({
        isActive: status === 'active',
        updatedAt: new Date(),
      })
      .where(eq(users.id, req.params.id))
      .returning({
        id: users.id,
        name: users.name,
        email: users.email,
        role: users.role,
        employeeId: users.employeeId,
        department: users.department,
        position: users.position,
        phone: users.phone,
        address: users.address,
        isActive: users.isActive,
        lastLogin: users.lastLogin,
        profilePicture: users.profilePicture,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      });

    if (!updatedEmployee) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found'
      });
    }

    res.json({
      success: true,
      message: 'Employee status updated successfully',
      data: updatedEmployee
    });
  } catch (error) {
    console.error('Update employee status error:', error);
    res.status(500).json({
      success: false,
      message: 'Error updating employee status',
      error: error.message
    });
  }
};
