import { createSlice } from '@reduxjs/toolkit'

const initialState = {
  attendanceRecords: [],
  employeeList: [],
  analytics: {},
  loading: false,
  error: null
}

const attendanceSlice = createSlice({
  name: 'attendance',
  initialState,
  reducers: {
    fetchStart: (state) => {
      state.loading = true
      state.error = null
    },
    fetchAttendanceSuccess: (state, action) => {
      state.loading = false
      state.attendanceRecords = action.payload
    },
    fetchEmployeesSuccess: (state, action) => {
      state.loading = false
      state.employeeList = action.payload
    },
    fetchAnalyticsSuccess: (state, action) => {
      state.loading = false
      state.analytics = action.payload
    },
    fetchFailure: (state, action) => {
      state.loading = false
      state.error = action.payload
    },
    checkInSuccess: (state, action) => {
      state.attendanceRecords.unshift(action.payload)
    },
    checkOutSuccess: (state, action) => {
      const index = state.attendanceRecords.findIndex(record => record._id === action.payload._id)
      if (index !== -1) {
        state.attendanceRecords[index] = action.payload
      }
    }
  }
})

export const {
  fetchStart,
  fetchAttendanceSuccess,
  fetchEmployeesSuccess,
  fetchAnalyticsSuccess,
  fetchFailure,
  checkInSuccess,
  checkOutSuccess
} = attendanceSlice.actions

export default attendanceSlice.reducer