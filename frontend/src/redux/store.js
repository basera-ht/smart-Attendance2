import { configureStore } from '@reduxjs/toolkit'
import authReducer from './authSlice'
import attendanceReducer from './attendanceSlice'

export const store = configureStore({
  reducer: {
    auth: authReducer,
    attendance: attendanceReducer,
  },
})

export default store    