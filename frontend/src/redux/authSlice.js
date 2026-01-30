import { createSlice } from '@reduxjs/toolkit'

// Initialize with safe defaults to prevent hydration mismatch
// Authentication state will be hydrated on client-side only
const getInitialState = () => {
  // Always start with unauthenticated state to match server-side rendering
  // This prevents hydration mismatches
  return {
    user: null,
    token: null,
    isAuthenticated: false,
    loading: true, // Start with loading true to prevent premature renders
    error: null
  }
}

const authSlice = createSlice({
  name: 'auth',
  initialState: getInitialState(),
  reducers: {
    loginStart: (state) => {
      state.loading = true
      state.error = null
    },
    loginSuccess: (state, action) => {
      state.loading = false
      state.isAuthenticated = true
      state.user = action.payload.user
      state.token = action.payload.token
      state.error = null
      if (typeof window !== 'undefined' && action.payload.token) {
        localStorage.setItem('token', action.payload.token)
      }
    },
    loginFailure: (state, action) => {
      state.loading = false
      state.error = action.payload
      state.isAuthenticated = false
      state.user = null
      state.token = null
    },
    logout: (state) => {
      state.user = null
      state.token = null
      state.isAuthenticated = false
      state.loading = false
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token')
        localStorage.removeItem('refreshToken')
      }
    },
    clearError: (state) => {
      state.error = null
    },
    updateUser: (state, action) => {
      state.user = { ...state.user, ...action.payload }
    },
    setLoading: (state, action) => {
      state.loading = action.payload
    }
  }
})

export const { loginStart, loginSuccess, loginFailure, logout, clearError, updateUser, setLoading } = authSlice.actions
export default authSlice.reducer