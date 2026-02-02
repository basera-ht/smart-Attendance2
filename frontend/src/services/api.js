import axios from 'axios'

// Use environment variable if set, otherwise use /api (which Next.js rewrites to backend)
// For server-side rendering, if NEXT_PUBLIC_API_BASE_URL is not set, use direct backend URL
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL
  || (typeof window !== 'undefined' ? '/api' : (process.env.BACKEND_URL || 'http://localhost:5000') + '/api')

// Helper to add legacy _id fields for compatibility with previous Mongo-style data
const addLegacyIds = (value, seen = new WeakSet()) => {
  if (!value || typeof value !== 'object') {
    return value
  }

  if (seen.has(value)) {
    return value
  }
  seen.add(value)

  if (Array.isArray(value)) {
    return value.map(item => addLegacyIds(item, seen))
  }

  // Skip special objects like Blob/FormData/Date
  if (value instanceof Date || (typeof Blob !== 'undefined' && value instanceof Blob) || (typeof FormData !== 'undefined' && value instanceof FormData)) {
    return value
  }

  Object.keys(value).forEach(key => {
    value[key] = addLegacyIds(value[key], seen)
  })

  if (value.id && !value._id) {
    value._id = value.id
  }

  return value
}

// Create a separate axios instance for refresh token to avoid circular dependency
const refreshApi = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
  withCredentials: true,
})

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
  withCredentials: true,
})

// Request interceptor to add auth token
api.interceptors.request.use(
  (config) => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => {
    return Promise.reject(error)
  }
)

// Response interceptor for error handling and token refresh
api.interceptors.response.use(
  (response) => {
    try {
      if (response?.data && response.config?.responseType !== 'blob') {
        addLegacyIds(response.data)
      }
    } catch (err) {
      console.warn('Failed to normalize response ids:', err)
    }
    return response
  },
  async (error) => {
    const originalRequest = error.config;

    // If error is 401 and we haven't already tried to refresh
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      const refreshToken = typeof window !== 'undefined'
        ? localStorage.getItem('refreshToken')
        : null;

      if (refreshToken) {
        try {
          // Try to refresh the access token (use separate instance to avoid loop)
          const refreshResponse = await refreshApi.post('/auth/refresh', { refreshToken });

          if (refreshResponse.data?.success) {
            const newAccessToken = refreshResponse.data.data.accessToken;

            // Store new access token
            if (typeof window !== 'undefined') {
              localStorage.setItem('token', newAccessToken);
            }

            // Retry original request with new token
            originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
            return api(originalRequest);
          }
        } catch (refreshError) {
          // Refresh failed, logout user
          if (typeof window !== 'undefined') {
            localStorage.removeItem('token');
            localStorage.removeItem('refreshToken');
            window.location.href = '/login';
          }
          return Promise.reject(refreshError);
        }
      } else {
        // No refresh token, logout user
        if (typeof window !== 'undefined') {
          localStorage.removeItem('token');
          localStorage.removeItem('refreshToken');
          window.location.href = '/login';
        }
      }
    }

    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (credentials) => api.post('/auth/login', credentials),
  register: (userData) => api.post('/auth/register', userData),
  getProfile: () => api.get('/auth/profile'),
  updateProfile: (data) => api.put('/auth/profile', data),
  refreshToken: (refreshToken) => api.post('/auth/refresh', { refreshToken }),
  logout: (data) => api.post('/auth/logout', data),
  getTokens: () => api.get('/auth/tokens'),
}

// Attendance API
export const attendanceAPI = {
  checkIn: (data) => api.post('/attendance/checkin', data),
  checkInSecure: (data) => api.post('/attendance/checkin-secure', data),
  checkOut: (data) => api.post('/attendance/checkout', data),

  getAttendance: (params) => api.get('/attendance', { params }),
  getEmployeeAttendance: (employeeId, params) => api.get(`/attendance/employee/${employeeId}`, { params }),
  updateAttendance: (id, data) => api.put(`/attendance/${id}`, data),
  getTodayAttendance: () => api.get('/attendance/today'),
  // Admin check-in/check-out
  adminCheckIn: (data) => api.post('/attendance/admin/checkin', data),
  adminCheckOut: (data) => api.post('/attendance/admin/checkout', data),
  // Admin update attendance status by date
  adminUpdateStatus: (data) => api.post('/attendance/admin/update-status', data),
  // Export monthly attendance to Excel
  exportMonthlyExcel: (year, month) => api.get('/attendance/export/monthly', {
    params: { year, month },
    responseType: 'blob'
  }),
}

// Employees API
export const employeesAPI = {
  getEmployees: () => api.get('/employees'),
  getEmployee: (id) => api.get(`/employees/${id}`),
  createEmployee: (data) => api.post('/employees', data),
  updateEmployee: (id, data) => api.put(`/employees/${id}`, data),
  deleteEmployee: (id, permanent = false) => api.delete(`/employees/${id}${permanent ? '?permanent=true' : ''}`),
  resetDevice: (id) => api.put(`/employees/${id}/reset-device`),
  updateDevice: (id, deviceId) => api.put(`/employees/${id}/device`, { deviceId }),
}

// Analytics API
export const analyticsAPI = {
  getDashboardStats: () => api.get('/analytics/dashboard'),
  getAttendanceReport: (params) => api.get('/analytics/attendance', { params }),
  getAdvancedAnalytics: (params) => api.get('/analytics/advanced', { params }),
  exportReport: (params) => api.get('/analytics/attendance', {
    params: { ...params, format: 'csv' },
    responseType: 'blob'
  }),
}

// Tasks API
export const tasksAPI = {
  getTasks: (params) => api.get('/tasks', { params }),
  createTask: (data) => api.post('/tasks', data),
  updateTask: (id, data) => api.put(`/tasks/${id}`, data),
  deleteTask: (id) => api.delete(`/tasks/${id}`),
}

// Leaves API
export const leavesAPI = {
  getLeaves: (params) => api.get('/leaves', { params }),
  createLeave: (data) => api.post('/leaves', data),
  updateLeave: (id, data) => api.put(`/leaves/${id}`, data),
  deleteLeave: (id) => api.delete(`/leaves/${id}`),
  getLeaveStats: () => api.get('/leaves/stats'),
}

// Holidays API
export const holidaysAPI = {
  getSelectedHolidays: (year) => api.get('/holidays/selected', { params: { year } }),
  setSelectedHolidays: (holidayIds, year) => api.post('/holidays/selected', { holidayIds, year }),
  updateSelectedHolidays: (holidayIds, year) => api.put('/holidays/selected', { holidayIds, year }),
}



// Offices API
export const officesAPI = {
  getOffices: (params) => api.get('/offices', { params }),
  getNetworkIp: () => api.get('/offices/network/ip'),
  createOffice: (data) => api.post('/offices', data),
  updateOffice: (officeId, data) => api.put(`/offices/${officeId}`, data),
  deleteOffice: (officeId) => api.delete(`/offices/${officeId}`),
}

export default api