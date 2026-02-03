'use client'
import { useEffect, useState } from 'react'
import { useAuth } from '../../hooks/useAuth'
import { authAPI } from '../../services/api'
import { getDeviceId } from '../../utils/deviceUtils'
import { Smartphone, AlertTriangle, ShieldCheck, RefreshCw } from 'lucide-react'
import DashboardLayout from '../../components/DashboardLayout'

export default function Profile() {
  const { user, logout } = useAuth()
  const [profile, setProfile] = useState({})
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    department: '',
    position: ''
  })
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [currentDeviceId, setCurrentDeviceId] = useState('')
  const [resettingDevice, setResettingDevice] = useState(false)

  useEffect(() => {
    setCurrentDeviceId(getDeviceId())
  }, [])

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true)
        const response = await authAPI.getProfile()

        if (response.data && response.data.success) {
          const userData = response.data.data.user
          setProfile(userData)
          setFormData({
            name: userData.name || '',
            email: userData.email || '',
            phone: userData.phone || '',
            address: userData.address || '',
            department: userData.department || '',
            position: userData.position || ''
          })
        } else {
          setError('Failed to fetch profile data')
        }
      } catch (err) {
        console.error('Error fetching profile:', err)
        setError('Error loading profile data')
        // Use user data from auth context as fallback
        if (user) {
          setProfile(user)
          setFormData({
            name: user.name || '',
            email: user.email || '',
            phone: user.phone || '',
            address: user.address || '',
            department: user.department || '',
            position: user.position || ''
          })
        }
      } finally {
        setLoading(false)
      }
    }

    fetchProfile()
  }, [user])

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    try {
      setError('')
      setSuccess('')

      const response = await authAPI.updateProfile({
        name: formData.name,
        phone: formData.phone,
        address: formData.address
      })

      if (response.data && response.data.success) {
        setSuccess('Profile updated successfully!')
        setProfile(response.data.data.user)
        setEditing(false)
        // Refresh the page to update the auth context
        setTimeout(() => {
          window.location.reload()
        }, 1500)
      } else {
        setError('Failed to update profile')
      }
    } catch (err) {
      console.error('Error updating profile:', err)
      setError('Failed to update profile. Please try again.')
    }
  }

  const handleLogout = () => {
    if (window.confirm('Are you sure you want to logout?')) {
      logout()
    }
  }

  const handleDeviceReset = async () => {
    if (!window.confirm('Are you sure you want to reset your device binding? You will need to re-login to bind this current device.')) {
      return
    }

    try {
      setResettingDevice(true)
      const response = await authAPI.resetDevice()
      if (response.data && response.data.success) {
        setSuccess('Device binding reset! Please Logout and Login again to bind this new device.')
        const fetchProfile = async () => {
          try {
            const res = await authAPI.getProfile()
            if (res.data?.success) setProfile(res.data.data.user)
          } catch (e) { console.error(e) }
        }
        fetchProfile()
      }
    } catch (err) {
      console.error('Device reset error', err)
      setError('Failed to reset device binding')
    } finally {
      setResettingDevice(false)
    }
  }


  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-64">
          <div className="loading-spinner"></div>
        </div>
      </DashboardLayout>
    )
  }

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">My Profile</h1>
          <div className="flex space-x-4">
            <button
              onClick={() => setEditing(!editing)}
              className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              {editing ? 'Cancel' : 'Edit Profile'}
            </button>
            <button
              onClick={handleLogout}
              className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              Logout
            </button>
          </div>
        </div>

        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
            {error}
          </div>
        )}

        {success && (
          <div className="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">
            {success}
          </div>
        )}

        <div className="bg-white shadow rounded-lg">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">Profile Information</h3>
          </div>
          <div className="p-6">
            {editing ? (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Full Name</label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      required
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      disabled
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-100 text-gray-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">Email cannot be changed</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Phone</label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Department</label>
                    <input
                      type="text"
                      name="department"
                      value={formData.department}
                      disabled
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-100 text-gray-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">Department cannot be changed</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Position</label>
                    <input
                      type="text"
                      name="position"
                      value={formData.position}
                      disabled
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-100 text-gray-500"
                    />
                    <p className="mt-1 text-xs text-gray-500">Position cannot be changed</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Employee ID</label>
                    <input
                      type="text"
                      value={profile.employeeId || 'N/A'}
                      disabled
                      className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm bg-gray-100 text-gray-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Address</label>
                  <textarea
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    rows={3}
                    className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="flex justify-end space-x-4">
                  <button
                    type="button"
                    onClick={() => setEditing(false)}
                    className="px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600"
                  >
                    Save Changes
                  </button>
                </div>
              </form>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Full Name</label>
                    <p className="mt-1 text-sm text-gray-900">{profile.name || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Email</label>
                    <p className="mt-1 text-sm text-gray-900">{profile.email || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Phone</label>
                    <p className="mt-1 text-sm text-gray-900">{profile.phone || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Employee ID</label>
                    <p className="mt-1 text-sm text-gray-900">{profile.employeeId || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Role</label>
                    <p className="mt-1 text-sm text-gray-900 capitalize">{profile.role || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Department</label>
                    <p className="mt-1 text-sm text-gray-900">{profile.department || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Position</label>
                    <p className="mt-1 text-sm text-gray-900">{profile.position || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Last Login</label>
                    <p className="mt-1 text-sm text-gray-900">
                      {profile.lastLogin ? new Date(profile.lastLogin).toLocaleString() : 'N/A'}
                    </p>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Address</label>
                  <p className="mt-1 text-sm text-gray-900">{profile.address || 'N/A'}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Device Security Section */}
      <div className="bg-white shadow rounded-lg mt-6">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900 flex items-center gap-2">
            <Smartphone className="w-5 h-5" />
            Device Security
          </h3>
        </div>
        <div className="p-6">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <p className="text-sm text-gray-500 mb-1">Device Binding Status</p>
              {profile.registeredDeviceId ? (
                profile.registeredDeviceId === currentDeviceId ? (
                  <div className="flex items-center text-green-600 font-medium">
                    <ShieldCheck className="w-5 h-5 mr-2" />
                    <span>This device is verified and bound to your account.</span>
                  </div>
                ) : (
                  <div className="flex items-start text-red-600 font-medium">
                    <AlertTriangle className="w-5 h-5 mr-2 mt-0.5" />
                    <div>
                      <p>Device Mismatch Detected!</p>
                      <p className="text-sm font-normal text-gray-600 mt-1">
                        Your account is bound to a different device (ID ending in ...{profile.registeredDeviceId.slice(-6)}).
                        <br />
                        You cannot use Check-in features until you switch to that device or reset binding.
                      </p>
                    </div>
                  </div>
                )
              ) : (
                <div className="flex items-center text-yellow-600 font-medium">
                  <AlertTriangle className="w-5 h-5 mr-2" />
                  <span>No device is strictly bound yet. It will bind automatically on next check-in.</span>
                </div>
              )}
            </div>

            {profile.registeredDeviceId && profile.registeredDeviceId !== currentDeviceId && (
              <button
                onClick={handleDeviceReset}
                disabled={resettingDevice}
                className="flex items-center justify-center px-4 py-2 border border-red-300 shadow-sm text-sm font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${resettingDevice ? 'animate-spin' : ''}`} />
                {resettingDevice ? 'Resetting...' : 'Reset Device Binding'}
              </button>
            )}
          </div>
          <div className="mt-4 text-xs text-gray-400">
            <p>Current Device ID: {currentDeviceId}</p>
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
