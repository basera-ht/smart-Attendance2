'use client'
import { useEffect, useState } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import ProtectedRoute from '../../components/ProtectedRoute'
import { officesAPI } from '../../services/api'

export default function OfficesPage() {
  const [offices, setOffices] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [deletingOfficeId, setDeletingOfficeId] = useState('')
  const [editingOfficeId, setEditingOfficeId] = useState('')
  const [ipDetecting, setIpDetecting] = useState(false)
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    allowedSSIDs: '',
    allowedIPRanges: ''
  })

  const fetchOffices = async () => {
    try {
      setLoading(true)
      setError('')
      const response = await officesAPI.getOffices({ activeOnly: 'false' })
      if (response.data?.success) {
        setOffices(response.data.data || [])
      } else {
        setError('Failed to load offices')
      }
    } catch (err) {
      console.error('Load offices error:', err)
      setError(err.response?.data?.message || 'Failed to load offices')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOffices()
  }, [])

  const handleInputChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    })
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!formData.name.trim()) {
      setError('Office name is required')
      return
    }

    try {
      setCreating(true)
      setError('')
      const payload = {
        name: formData.name.trim(),
        address: formData.address.trim() || undefined,
        allowedSSIDs: formData.allowedSSIDs
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean),
        allowedIPRanges: formData.allowedIPRanges
          .split(/\r?\n|,/)
          .map((s) => s.trim())
          .filter(Boolean)
      }
      const response = editingOfficeId
        ? await officesAPI.updateOffice(editingOfficeId, payload)
        : await officesAPI.createOffice(payload)

      if (response.data?.success) {
        setFormData({ name: '', address: '', allowedSSIDs: '', allowedIPRanges: '' })
        setEditingOfficeId('')
        await fetchOffices()
      } else {
        setError(`Failed to ${editingOfficeId ? 'update' : 'create'} office`)
      }
    } catch (err) {
      console.error('Create office error:', err)
      const message =
        err.response?.data?.message ||
        err.response?.data?.errors?.[0]?.msg ||
        'Failed to create office'
      setError(message)
    } finally {
      setCreating(false)
    }
  }

  const handleAutoDetectIp = async (mode = 'single') => {
    try {
      setIpDetecting(true)
      setError('')
      const response = await officesAPI.getNetworkIp()
      if (!response.data?.success) {
        setError(response.data?.message || 'Failed to detect IP')
        return
      }

      const ip = response.data?.data?.ip
      if (!ip) {
        setError('Failed to detect IP')
        return
      }

      let newCidr = ''
      if (mode === 'range') {
        // Create /24 range for IPv4
        if (ip.includes('.')) {
          const parts = ip.split('.')
          parts[3] = '0'
          newCidr = `${parts.join('.')}/24`
        } else if (ip.includes(':')) {
          // Simple /64 assumption for IPv6
          // This is a naive split, real IPv6 handling is complex but this covers common cases
          const parts = ip.split(':');
          // Keep first 4 blocks for /64
          if (parts.length >= 4) {
            newCidr = `${parts.slice(0, 4).join(':')}::/64`
          } else {
            newCidr = `${ip}/128` // Fallback
          }
        }
      } else {
        newCidr = ip.includes(':') ? `${ip}/128` : `${ip}/32`
      }

      const existing = formData.allowedIPRanges
        .split(/\r?\n|,/)
        .map((s) => s.trim())
        .filter(Boolean)

      if (!existing.includes(newCidr)) {
        existing.push(newCidr)
      }

      setFormData((prev) => ({
        ...prev,
        allowedIPRanges: existing.join('\n')
      }))
    } catch (err) {
      console.error('Auto IP detect error:', err)
      const message =
        err.response?.data?.message ||
        err.response?.data?.errors?.[0]?.msg ||
        'Failed to detect IP'
      setError(message)
    } finally {
      setIpDetecting(false)
    }
  }

  const handleDeleteOffice = async (officeId) => {
    const confirmed = window.confirm('Delete this office? This will remove its QR codes.')
    if (!confirmed) return

    try {
      setDeletingOfficeId(String(officeId))
      setError('')
      await officesAPI.deleteOffice(officeId)
      await fetchOffices()
    } catch (err) {
      console.error('Delete office error:', err)
      const message =
        err.response?.data?.message ||
        err.response?.data?.errors?.[0]?.msg ||
        'Failed to delete office'
      setError(message)
    } finally {
      setDeletingOfficeId('')
    }
  }

  const startEditOffice = (office) => {
    setEditingOfficeId(String(office.id))
    setFormData({
      name: office.name || '',
      address: office.address || '',
      allowedSSIDs: (office.allowedSSIDs || []).join(', '),
      allowedIPRanges: (office.allowedIPRanges || []).join('\n')
    })
  }

  const cancelEditOffice = () => {
    setEditingOfficeId('')
    setFormData({ name: '', address: '', allowedSSIDs: '', allowedIPRanges: '' })
  }

  return (
    <ProtectedRoute requiredRoles={['admin', 'hr']}>
      <DashboardLayout>
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Offices</h1>
            {/* <p className="text-gray-600 mt-1">Configure office network access</p> */}
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">
              {editingOfficeId ? 'Edit Office' : 'Create Office'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Office Name
                </label>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g. Head Office"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Address (optional)
                </label>
                <input
                  type="text"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Street, City, Country"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Allowed Wi-Fi SSIDs (comma-separated)
                </label>
                <input
                  type="text"
                  name="allowedSSIDs"
                  value={formData.allowedSSIDs}
                  onChange={handleInputChange}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="CompanyCorp-Office, CompanyCorp-Guest"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Allowed IP Ranges (CIDR, one per line)
                </label>
                <textarea
                  name="allowedIPRanges"
                  value={formData.allowedIPRanges}
                  onChange={handleInputChange}
                  rows={4}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                  placeholder={`192.168.1.0/24\n10.0.0.0/16`}
                />
                <div className="mt-2 flex space-x-2">
                  <button
                    type="button"
                    onClick={() => handleAutoDetectIp('single')}
                    disabled={ipDetecting}
                    className="bg-gray-100 hover:bg-gray-200 disabled:bg-gray-200 text-gray-800 px-3 py-2 rounded-lg text-sm font-medium"
                  >
                    {ipDetecting ? 'Detecting...' : 'Add Current IP'}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAutoDetectIp('range')}
                    disabled={ipDetecting}
                    className="bg-blue-50 hover:bg-blue-100 disabled:bg-gray-200 text-blue-700 border border-blue-200 px-3 py-2 rounded-lg text-sm font-medium"
                    title="Allows any device on this WiFi network (Use if IP changes frequently)"
                  >
                    {ipDetecting ? 'Detecting...' : 'Create Static IP Range'}
                  </button>
                </div>
              </div>
              <div className="flex items-center space-x-3">
                <button
                  type="submit"
                  disabled={creating}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium"
                >
                  {creating ? 'Saving...' : editingOfficeId ? 'Update Office' : 'Create Office'}
                </button>
                {editingOfficeId && (
                  <button
                    type="button"
                    onClick={cancelEditOffice}
                    className="bg-gray-100 hover:bg-gray-200 text-gray-800 px-4 py-2 rounded-lg font-medium"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </form>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Office List</h2>
            {loading ? (
              <div className="text-gray-600">Loading offices...</div>
            ) : offices.length === 0 ? (
              <div className="text-gray-600">No offices created yet.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Address</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">SSIDs</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">IP Ranges</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {offices.map((office) => (
                      <tr key={office.id}>
                        <td className="px-4 py-3 text-sm text-gray-900">{office.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">{office.address || '—'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {(office.allowedSSIDs || []).join(', ') || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {(office.allowedIPRanges || []).join(', ') || '—'}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={office.isActive ? 'text-green-700' : 'text-gray-500'}>
                            {office.isActive ? 'Active' : 'Inactive'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <button
                            onClick={() => handleDeleteOffice(office.id)}
                            disabled={deletingOfficeId === String(office.id)}
                            className="text-red-600 hover:text-red-700 disabled:text-gray-400"
                          >
                            {deletingOfficeId === String(office.id) ? 'Deleting...' : 'Delete'}
                          </button>
                          <button
                            onClick={() => startEditOffice(office)}
                            className="ml-4 text-blue-600 hover:text-blue-700"
                          >
                            Edit
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute >
  )
}
