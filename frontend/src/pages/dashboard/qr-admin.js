'use client'
import { useState, useEffect, useRef } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import ProtectedRoute from '../../components/ProtectedRoute'
import { qrAPI, officesAPI } from '../../services/api'
import {
  QrCode,
  AlertTriangle,
  RefreshCw,
  Download,
  MapPin,
  Clock,
  History,
  CheckCircle2,
  XCircle,
  Monitor
} from 'lucide-react'

export default function QRAdminPage() {
  const [offices, setOffices] = useState([])
  const [selectedOffice, setSelectedOffice] = useState(null)
  const [activeQR, setActiveQR] = useState(null)
  const [validationLogs, setValidationLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const officesLoadInFlight = useRef(false)
  const officesRetryTimeout = useRef(null)

  useEffect(() => {
    loadOffices()
  }, [])

  useEffect(() => {
    if (selectedOffice) {
      loadActiveQR(selectedOffice)
      loadValidationLogs({ officeId: selectedOffice })
    }
  }, [selectedOffice])

  useEffect(() => {
    if (selectedOffice) {
      const interval = setInterval(() => {
        loadValidationLogs({ officeId: selectedOffice })
      }, 5000)
      return () => clearInterval(interval)
    }
  }, [selectedOffice])

  const loadOffices = async () => {
    if (officesLoadInFlight.current) return
    officesLoadInFlight.current = true
    try {
      const response = await officesAPI.getOffices({ activeOnly: 'true' })
      if (response.data.success) {
        setOffices(response.data.data)
        if (response.data.data.length > 0 && !selectedOffice) {
          setSelectedOffice(response.data.data[0].id)
        }
      }
    } catch (err) {
      console.error('Load offices error:', err)
      if (err.response?.status === 429) {
        setError('Too many requests. Retrying in a few seconds...')
        if (!officesRetryTimeout.current) {
          officesRetryTimeout.current = setTimeout(() => {
            officesRetryTimeout.current = null
            loadOffices()
          }, 3000)
        }
      }
    } finally {
      officesLoadInFlight.current = false
    }
  }

  const loadActiveQR = async (officeId) => {
    try {
      const response = await qrAPI.getActive({ officeId })
      if (response.data.success && response.data.data.length > 0) {
        const apiActive = response.data.data[0]
        setActiveQR((prev) => ({
          ...apiActive,
          qrImage: prev?.qrImage || apiActive.qrImage || null
        }))
      } else {
        setActiveQR(null)
      }
    } catch (err) {
      console.error('Load active QR error:', err)
    }
  }

  const loadValidationLogs = async (params) => {
    try {
      const response = await qrAPI.getValidationLogs({ ...params, limit: 50 })
      if (response.data.success) {
        setValidationLogs(response.data.data.docs)
      }
    } catch (err) {
      console.error('Load validation logs error:', err)
    }
  }

  const generateQR = async () => {
    if (!selectedOffice) {
      setError('Please select an office')
      return
    }

    try {
      setLoading(true)
      setError(null)
      const response = await qrAPI.generate({
        officeId: selectedOffice,
        expiresIn: 300
      })

      if (response.data?.success) {
        setActiveQR({
          qrId: response.data.data.qrId,
          qrImage: response.data.data.qrImage,
          expiresAt: response.data.data.expiresAt,
          office: response.data.data.office,
          officeNetwork: response.data.data.officeNetwork
        })
      } else {
        setError(response.data?.message || 'Failed to generate QR code')
      }
    } catch (err) {
      console.error('Generate QR error:', err)
      const message =
        err.response?.data?.message ||
        err.response?.data?.errors?.[0]?.msg ||
        'Failed to generate QR code'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const downloadQR = () => {
    if (!activeQR?.qrImage) return

    const link = document.createElement('a')
    link.href = activeQR.qrImage
    link.download = `QR-${activeQR.qrId}-${Date.now()}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  const selectedOfficeDetails = offices.find((office) => office.id === selectedOffice)

  return (
    <ProtectedRoute requiredRoles={['admin', 'hr']}>
      <DashboardLayout>
        <div className="space-y-8">
          {/* Header */}
          {/* <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-black text-slate-900 tracking-tight">QR Management</h1>
              <p className="text-slate-500 font-medium">Generate and monitor secure office entry keys</p>
            </div>
          </div> */}

          {error && (
            <div className="bg-rose-50 border border-rose-200 text-rose-700 px-6 py-4 rounded-2xl flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <p className="font-medium text-sm">{error}</p>
            </div>
          )}

          {/* Configuration Card */}
          <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-8">
            <div className="flex flex-col lg:flex-row items-start lg:items-center gap-8">
              <div className="flex-1 w-full space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest pl-1">Select Office Location</label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                    <MapPin className="w-5 h-5 text-blue-500" />
                  </div>
                  <select
                    className="w-full pl-12 pr-10 py-4 bg-slate-50 border-none rounded-2xl text-slate-900 font-bold focus:ring-2 focus:ring-blue-500 appearance-none transition-all cursor-pointer shadow-inner"
                    value={selectedOffice || ''}
                    onChange={(e) => setSelectedOffice(Number(e.target.value))}
                  >
                    <option value="">Select an office</option>
                    {offices.map((office) => (
                      <option key={office.id} value={office.id}>
                        {office.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="w-full lg:w-auto pt-2 lg:pt-6">
                <button
                  onClick={generateQR}
                  disabled={loading || !selectedOffice}
                  className="w-full bg-slate-900 hover:bg-black disabled:bg-slate-200 text-white px-8 py-4 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all active:scale-95 shadow-xl shadow-slate-200 disabled:shadow-none"
                >
                  <QrCode className="w-5 h-5" />
                  {loading ? 'Processing...' : 'Generate New Key'}
                </button>
              </div>
            </div>

            {selectedOfficeDetails && (
              <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="px-6 py-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">Allowed SSIDs</span>
                  <span className="text-sm font-bold text-slate-700">{(selectedOfficeDetails.allowedSSIDs || []).join(', ') || '—'}</span>
                </div>
                <div className="px-6 py-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block mb-1">IP Access Policy</span>
                  <span className="text-sm font-bold text-slate-700">{(selectedOfficeDetails.allowedIPRanges || []).join(', ') || '—'}</span>
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Active QR Monitor */}
            <div className="lg:col-span-1 space-y-4">
              <div className="flex items-center gap-2 px-2">
                <Monitor className="w-4 h-4 text-blue-500" />
                <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Live Monitor</h2>
              </div>

              <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 p-8 flex flex-col items-center">
                {activeQR ? (
                  <div className="w-full space-y-8 flex flex-col items-center">
                    {/* Focused QR Display Area */}
                    <div className="relative group w-full aspect-square max-w-[240px]">
                      <div className="absolute -inset-2 bg-blue-500/5 rounded-3xl blur-2xl group-hover:bg-blue-500/10 transition-all duration-1000"></div>
                      <div className="relative bg-white rounded-3xl p-4 shadow-inner border border-slate-50 aspect-square flex items-center justify-center">
                        <img
                          src={activeQR.qrImage}
                          alt="Active QR"
                          className="w-full h-full object-contain"
                        />

                        {/* Smaller, Clean Logo Overlay */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-10 bg-white rounded-lg p-1 shadow-md border border-slate-50">
                          <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
                        </div>
                      </div>
                    </div>

                    <div className="w-full space-y-4">
                      <div className="flex flex-col items-center py-4 bg-slate-50 rounded-2xl border border-slate-100">
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-[0.2em] mb-1">Expires At</p>
                        <p className="text-xl font-mono font-bold text-slate-900">
                          {new Date(activeQR.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </p>
                      </div>

                      <button
                        onClick={downloadQR}
                        className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-black text-white py-3 rounded-2xl font-bold text-xs transition-all shadow-lg shadow-slate-200"
                      >
                        <Download className="w-3.5 h-3.5" />
                        Download Asset
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="py-20 text-center space-y-4">
                    <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mx-auto">
                      <QrCode className="w-8 h-8 text-slate-200" />
                    </div>
                    <p className="text-slate-400 font-medium text-sm italic">No active tokens for this office</p>
                  </div>
                )}
              </div>
            </div>

            {/* Validation History */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-blue-500" />
                  <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">Live Validation Logs</h2>
                </div>
                <button
                  onClick={() => loadValidationLogs({ officeId: selectedOffice })}
                  className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  <RefreshCw className="w-4 h-4 text-slate-400" />
                </button>
              </div>

              <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
                <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                  {validationLogs.length === 0 ? (
                    <div className="py-24 text-center">
                      <p className="text-slate-400 font-medium">No activity recorded today</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-50">
                      {validationLogs.map((log) => (
                        <div key={log.id} className="p-6 hover:bg-slate-50/50 transition-colors group">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex items-center gap-4">
                              <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${log.isValid ? 'bg-emerald-50 text-emerald-500' : 'bg-rose-50 text-rose-500'}`}>
                                {log.isValid ? <CheckCircle2 className="w-6 h-6" /> : <XCircle className="w-6 h-6" />}
                              </div>
                              <div>
                                <p className="font-bold text-slate-900">
                                  {log.user?.name || 'Security Key Tap'}
                                  <span className="ml-2 text-xs font-medium text-slate-400">
                                    {log.user?.employeeId ? `ID: ${log.user.employeeId}` : ''}
                                  </span>
                                </p>
                                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-xs font-semibold text-slate-500">
                                  <span className="flex items-center gap-1">
                                    <Monitor className="w-3 h-3" />
                                    {log.validationResult?.mode || 'remote'}
                                  </span>
                                  <span>{log.ipAddress || 'Internal IP'}</span>
                                  {log.validationResult?.ssid && (
                                    <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-md uppercase tracking-tighter text-[9px]">
                                      WiFi: {log.validationResult.ssid}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-xs font-black text-slate-900">
                                {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </p>
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                                {new Date(log.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                              </p>
                            </div>
                          </div>
                          {log.failureReason && (
                            <div className="mt-4 ml-16 p-3 bg-rose-50/50 border border-rose-100 rounded-xl text-xs font-bold text-rose-600">
                              Error: {log.failureReason}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  )
}
