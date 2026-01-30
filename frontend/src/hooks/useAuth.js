import { useEffect, useRef } from 'react'
import { useDispatch, useSelector } from 'react-redux'
import { useRouter } from 'next/router'
import { authAPI } from '../services/api'
import { loginSuccess, logout, setLoading } from '../redux/authSlice'

// Helper to delay execution
const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms))

// Global flag to prevent multiple simultaneous validations
let isValidating = false

export const useAuth = () => {
  const dispatch = useDispatch()
  const router = useRouter()
  const { user, token, isAuthenticated, loading } = useSelector(state => state.auth)
  const validationAttemptRef = useRef(0)

  useEffect(() => {
    const validateToken = async () => {
      // Prevent multiple simultaneous validations
      if (isValidating) {
        console.log('Token validation already in progress, skipping...')
        return
      }

      const storedToken = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      
      const storedRefreshToken = typeof window !== 'undefined' 
        ? localStorage.getItem('refreshToken') 
        : null
      
      // If no token exists, set loading to false immediately
      if (!storedToken) {
        dispatch(setLoading(false))
        return
      }
      
      if (storedToken && !user) {
        isValidating = true
        try {
          const response = await authAPI.getProfile()
          
          // Handle different response structures
          const userData = response?.data?.data?.user || response?.data?.user
          
          if (userData) {
            dispatch(loginSuccess({
              user: userData,
              token: storedToken
            }))
            validationAttemptRef.current = 0 // Reset on success
          } else {
            throw new Error('Invalid response structure')
          }
        } catch (error) {
          console.error('Token validation failed:', error)
          
          // Handle 429 Rate Limit errors
          if (error.response?.status === 429) {
            const retryCount = validationAttemptRef.current
            const maxRetries = 2
            
            if (retryCount < maxRetries) {
              validationAttemptRef.current++
              
              // Get retry-after header if available, otherwise use exponential backoff
              const retryAfter = error.response.headers['retry-after']
              const waitTime = retryAfter 
                ? parseInt(retryAfter) * 1000 
                : Math.min(2000 * Math.pow(2, retryCount), 10000) // Max 10 seconds
              
              console.log(`Rate limited. Retrying after ${waitTime}ms (attempt ${retryCount + 1}/${maxRetries})`)
              
              // Wait before retrying
              await delay(waitTime)
              
              // Retry validation
              isValidating = false
              validateToken()
              return
            } else {
              console.warn('Max retries reached for token validation. Rate limit exceeded.')
              // Don't logout on rate limit, just log the error
              // The user can still use the app if they have a valid token
              isValidating = false
              return
            }
          }
          
          // If token validation fails (non-429 errors), try to refresh
          if (storedRefreshToken) {
            try {
              const refreshResponse = await authAPI.refreshToken(storedRefreshToken)
              if (refreshResponse.data?.success) {
                const newAccessToken = refreshResponse.data.data.accessToken
                localStorage.setItem('token', newAccessToken)
                // Retry getting profile
                const profileResponse = await authAPI.getProfile()
                const refreshedUserData = profileResponse?.data?.data?.user || profileResponse?.data?.user
                
                if (refreshedUserData) {
                  dispatch(loginSuccess({
                    user: refreshedUserData,
                    token: newAccessToken
                  }))
                  validationAttemptRef.current = 0 // Reset on success
                } else {
                  throw new Error('Invalid response structure after refresh')
                }
                isValidating = false
                return
              }
            } catch (refreshError) {
              console.error('Token refresh failed:', refreshError)
              // If refresh also fails with 429, don't logout
              if (refreshError.response?.status === 429) {
                console.warn('Rate limited during token refresh. Will retry later.')
                isValidating = false
                return
              }
            }
          }
          
          // If refresh also fails (and not 429), logout
          // Only logout for non-429 errors
          if (error.response?.status !== 429) {
            dispatch(logout())
            if (typeof window !== 'undefined') {
              localStorage.removeItem('token')
              localStorage.removeItem('refreshToken')
            }
          }
        } finally {
          isValidating = false
        }
      }
    }

    // Add a small delay to prevent rapid successive calls
    const timeoutId = setTimeout(() => {
      validateToken()
    }, 100)

    return () => {
      clearTimeout(timeoutId)
    }
  }, [dispatch, user])

  const login = async (credentials, retryCount = 0) => {
    const maxRetries = 2
    
    try {
      console.log('Login credentials:', credentials)
      const response = await authAPI.login(credentials)
      const raw = response?.data || {}
      
      console.log('Login response:', raw)
      
      if (raw.success && raw.data) {
        const { user, accessToken, refreshToken } = raw.data
        
        // Validate tokens exist
        if (!accessToken) {
          console.error('No access token received')
          return { success: false, error: 'Authentication error: No access token received' }
        }
        
        // Store tokens in localStorage
        if (typeof window !== 'undefined') {
          if (accessToken) {
            localStorage.setItem('token', accessToken)
          }
          if (refreshToken) {
            localStorage.setItem('refreshToken', refreshToken)
          }
        }

        dispatch(loginSuccess({ 
          user: user, 
          token: accessToken 
        }))
        return { success: true }
      }

      // Handle validation errors
      if (raw.errors && Array.isArray(raw.errors)) {
        const errorMessages = raw.errors.map(e => e.msg || e.message).join(', ')
        return { success: false, error: errorMessages || raw.message || 'Login failed' }
      }

      return { success: false, error: raw.message || 'Login failed' }
    } catch (error) {
      console.error('Login error:', error)
      console.error('Login error details:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      })
      
      // Handle different error types
      if (error.response) {
        const errorData = error.response.data || {}
        const status = error.response.status
        
        // Handle 429 Rate Limit error with retry logic
        if (status === 429) {
          if (retryCount < maxRetries) {
            // Get retry-after header if available, otherwise use exponential backoff
            const retryAfter = error.response.headers['retry-after']
            const waitTime = retryAfter 
              ? parseInt(retryAfter) * 1000 
              : Math.min(2000 * Math.pow(2, retryCount), 10000) // Max 10 seconds
            
            console.log(`Rate limited during login. Retrying after ${waitTime}ms (attempt ${retryCount + 1}/${maxRetries})`)
            
            // Wait before retrying
            await delay(waitTime)
            
            // Retry login
            return login(credentials, retryCount + 1)
          } else {
            // Max retries reached
            const retryAfter = error.response.headers['retry-after']
            const waitTime = retryAfter ? `${retryAfter} seconds` : 'a few minutes'
            return { 
              success: false, 
              error: `Too many login attempts. Please wait ${waitTime} before trying again.`
            }
          }
        }
        
        return { 
          success: false, 
          error: errorData.message || `Login failed: ${status} ${error.response.statusText}` || 'Login failed'
        }
      } else if (error.request) {
        return { 
          success: false, 
          error: 'Network error. Please check if the server is running.'
        }
      }
      
      return { 
        success: false, 
        error: error.message || 'Login failed' 
      }
    }
  }

  const logoutUser = async () => {
    try {
      const refreshToken = typeof window !== 'undefined' 
        ? localStorage.getItem('refreshToken') 
        : null
      
      // Call logout API to revoke refresh token
      if (refreshToken) {
        try {
          await authAPI.logout({ refreshToken })
        } catch (err) {
          console.error('Logout API error:', err)
          // Continue with logout even if API call fails
        }
      }
    } catch (error) {
      console.error('Logout error:', error)
    } finally {
      // Clear tokens and state
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token')
        localStorage.removeItem('refreshToken')
      }
      dispatch(logout())
      router.push('/login')
    }
  }

  const hasRole = (requiredRole) => {
    if (!user) return false
    return user.role === requiredRole
  }

  const hasAnyRole = (roles) => {
    if (!user) return false
    return roles.includes(user.role)
  }

  return {
    user,
    token,
    isAuthenticated,
    loading,
    login,
    logout: logoutUser,
    hasRole,
    hasAnyRole
  }
}