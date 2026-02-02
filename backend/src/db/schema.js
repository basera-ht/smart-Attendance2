import { pgTable, text, timestamp, boolean, integer, jsonb, pgEnum, varchar, index, pgSchema, serial } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';


// Enums
export const userRoleEnum = pgEnum('user_role', ['admin', 'hr', 'employee']);
export const attendanceStatusEnum = pgEnum('attendance_status', ['present', 'absent', 'late', 'half-day', 'leave']);
export const leaveTypeEnum = pgEnum('leave_type', ['sick', 'vacation', 'personal', 'emergency', 'maternity', 'paternity', 'bereavement', 'other']);
export const leaveStatusEnum = pgEnum('leave_status', ['pending', 'approved', 'rejected', 'cancelled']);
export const taskPriorityEnum = pgEnum('task_priority', ['low', 'medium', 'high', 'urgent']);
export const taskStatusEnum = pgEnum('task_status', ['pending', 'in-progress', 'completed', 'cancelled']);
export const smartAttendance = pgSchema('smart_attendance')

// Users table
export const users = smartAttendance.table('users', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 50 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: text('password').notNull(),
  role: userRoleEnum('role').notNull().default('employee'),
  fingerprintHash: text('fingerprint_hash'),
  employeeId: varchar('employee_id', { length: 50 }).unique(),
  department: varchar('department', { length: 100 }),
  position: varchar('position', { length: 100 }),
  phone: varchar('phone', { length: 20 }),
  address: text('address'),
  isActive: boolean('is_active').notNull().default(true),
  lastLogin: timestamp('last_login'),
  registeredDeviceId: text('registered_device_id'),
  deviceLastSeen: timestamp('device_last_seen'),
  profilePicture: text('profile_picture'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  emailIdx: index('users_email_idx').on(table.email),
  employeeIdIdx: index('users_employee_id_idx').on(table.employeeId),
  departmentIdx: index('users_department_idx').on(table.department),
}));

// Attendance table
export const attendance = smartAttendance.table('attendance', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  date: timestamp('date').notNull().defaultNow(),
  checkInTime: timestamp('check_in_time'),
  checkInLocation: varchar('check_in_location', { length: 255 }),
  checkInIpAddress: varchar('check_in_ip_address', { length: 45 }),
  checkInDeviceInfo: text('check_in_device_info'),
  checkOutTime: timestamp('check_out_time'),
  checkOutLocation: varchar('check_out_location', { length: 255 }),
  checkOutIpAddress: varchar('check_out_ip_address', { length: 45 }),
  checkOutDeviceInfo: text('check_out_device_info'),
  status: attendanceStatusEnum('status').notNull().default('present'),
  workingHours: integer('working_hours').notNull().default(0), // in minutes
  overtime: integer('overtime').notNull().default(0), // in minutes
  notes: text('notes'),
  isApproved: boolean('is_approved').notNull().default(false),
  approvedById: integer('approved_by_id').references(() => users.id),
  approvedAt: timestamp('approved_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  employeeDateIdx: index('attendance_employee_date_idx').on(table.employeeId, table.date),
  dateIdx: index('attendance_date_idx').on(table.date),
  statusIdx: index('attendance_status_idx').on(table.status),
}));

// Leaves table
export const leaves = smartAttendance.table('leaves', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  leaveType: leaveTypeEnum('leave_type').notNull(),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date').notNull(),
  totalDays: integer('total_days').notNull().default(0),
  reason: text('reason').notNull(),
  status: leaveStatusEnum('status').notNull().default('pending'),
  appliedDate: timestamp('applied_date').notNull().defaultNow(),
  reviewedById: integer('reviewed_by_id').references(() => users.id),
  reviewedAt: timestamp('reviewed_at'),
  reviewComments: text('review_comments'),
  attachments: jsonb('attachments').default([]),
  isPaid: boolean('is_paid').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  employeeStartDateIdx: index('leaves_employee_start_date_idx').on(table.employeeId, table.startDate),
  statusStartDateIdx: index('leaves_status_start_date_idx').on(table.status, table.startDate),
  appliedDateIdx: index('leaves_applied_date_idx').on(table.appliedDate),
}));

// Tasks table
export const tasks = smartAttendance.table('tasks', {
  id: serial('id').primaryKey(),
  employeeId: integer('employee_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  title: varchar('title', { length: 200 }).notNull(),
  description: text('description'),
  priority: taskPriorityEnum('priority').notNull().default('medium'),
  status: taskStatusEnum('status').notNull().default('pending'),
  dueDate: timestamp('due_date'),
  completedAt: timestamp('completed_at'),
  tags: jsonb('tags').default([]),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  employeeStatusIdx: index('tasks_employee_status_idx').on(table.employeeId, table.status),
  dueDateIdx: index('tasks_due_date_idx').on(table.dueDate),
}));

// Refresh tokens table
export const refreshTokens = smartAttendance.table('refresh_tokens', {
  id: serial('id').primaryKey(),
  token: text('token').notNull().unique(),
  userId: integer('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at').notNull(),
  revoked: boolean('revoked').notNull().default(false),
  revokedAt: timestamp('revoked_at'),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  tokenIdx: index('refresh_tokens_token_idx').on(table.token),
  userIdIdx: index('refresh_tokens_user_id_idx').on(table.userId),
  expiresAtIdx: index('refresh_tokens_expires_at_idx').on(table.expiresAt),
}));

// Selected optional holidays table
export const selectedOptionalHolidays = smartAttendance.table('selected_optional_holidays', {
  id: serial('id').primaryKey(),
  holidayId: integer('holiday_id').notNull(), // ID from optionalHolidays array
  year: integer('year').notNull(), // Year for which the holiday is selected
  selectedBy: integer('selected_by').references(() => users.id), // Admin who selected it
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  holidayYearIdx: index('selected_holidays_holiday_year_idx').on(table.holidayId, table.year),
  yearIdx: index('selected_holidays_year_idx').on(table.year),
}));

// Relations
export const usersRelations = relations(smartAttendance.users, ({ many }) => ({
  attendance: many(attendance),
  leaves: many(leaves),
  tasks: many(tasks),
  refreshTokens: many(refreshTokens),
  approvedAttendance: many(attendance, { relationName: 'approvedBy' }),
  reviewedLeaves: many(leaves, { relationName: 'reviewedBy' }),
}));

export const attendanceRelations = relations(smartAttendance.attendance, ({ one }) => ({
  employee: one(users, {
    fields: [attendance.employeeId],
    references: [users.id],
  }),
  approvedBy: one(smartAttendance.users, {
    fields: [attendance.approvedById],
    references: [users.id],
    relationName: 'approvedBy',
  }),
}));

export const leavesRelations = relations(smartAttendance.leaves, ({ one }) => ({
  employee: one(users, {
    fields: [leaves.employeeId],
    references: [users.id],
  }),
  reviewedBy: one(users, {
    fields: [leaves.reviewedById],
    references: [users.id],
    relationName: 'reviewedBy',
  }),
}));

export const tasksRelations = relations(smartAttendance.tasks, ({ one }) => ({
  employee: one(users, {
    fields: [tasks.employeeId],
    references: [users.id],
  }),
}));

export const refreshTokensRelations = relations(smartAttendance.refreshTokens, ({ one }) => ({
  user: one(users, {
    fields: [refreshTokens.userId],
    references: [users.id],
  }),
}));

export const selectedOptionalHolidaysRelations = relations(smartAttendance.selectedOptionalHolidays, ({ one }) => ({
  selectedByUser: one(users, {
    fields: [selectedOptionalHolidays.selectedBy],
    references: [users.id],
  }),
}));

// Offices table
export const offices = smartAttendance.table('offices', {
  id: serial('id').primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  address: text('address'),
  allowedSSIDs: jsonb('allowed_ssids').default([]),
  allowedIPRanges: jsonb('allowed_ip_ranges').default([]),
  latitude: varchar('latitude', { length: 50 }),
  longitude: varchar('longitude', { length: 50 }),
  isActive: boolean('is_active').notNull().default(true),
  createdById: integer('created_by_id').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  nameIdx: index('offices_name_idx').on(table.name),
  isActiveIdx: index('offices_is_active_idx').on(table.isActive),
}));

// Geofences table (polygon boundaries for offices)
export const geofences = smartAttendance.table('geofences', {
  id: serial('id').primaryKey(),
  officeId: integer('office_id').notNull().references(() => offices.id, { onDelete: 'cascade' }),
  name: varchar('name', { length: 255 }).notNull(),
  polygon: jsonb('polygon').notNull(), // GeoJSON Polygon format
  radius: integer('radius'), // Optional radius in meters for circular geofences
  tolerance: integer('tolerance').notNull().default(15), // GPS accuracy tolerance in meters
  isActive: boolean('is_active').notNull().default(true),
  createdById: integer('created_by_id').references(() => users.id),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
}, (table) => ({
  officeIdIdx: index('geofences_office_id_idx').on(table.officeId),
  isActiveIdx: index('geofences_is_active_idx').on(table.isActive),
}));

// QR Codes table and logs removed


// Relations for new tables
export const officesRelations = relations(smartAttendance.offices, ({ one, many }) => ({
  createdBy: one(users, {
    fields: [offices.createdById],
    references: [users.id],
  }),
  geofences: many(geofences),
}));

export const geofencesRelations = relations(smartAttendance.geofences, ({ one, many }) => ({
  office: one(offices, {
    fields: [geofences.officeId],
    references: [offices.id],
  }),
  createdBy: one(users, {
    fields: [geofences.createdById],
    references: [users.id],
  }),
}));



