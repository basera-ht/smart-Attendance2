import { useEffect, useState, useCallback } from 'react'
import DashboardLayout from '../../components/DashboardLayout'
import ProtectedRoute from '../../components/ProtectedRoute'
import { qrAPI, officesAPI } from '../../services/api'
import {
  Loader2,
  MapPin,
  RefreshCw,
  AlertCircle,
  Clock,
  Scan,
  MoreVertical,
  ChevronDown
} from 'lucide-react'

export default function ShowQRPage() {
  const [offices, setOffices] = useState([])
  const [selectedOffice, setSelectedOffice] = useState('')
  const [activeQR, setActiveQR] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)
  const [rotationInterval, setRotationInterval] = useState(30)

  // 1. Load Offices
  useEffect(() => {
    const loadOffices = async () => {
      try {
        const response = await officesAPI.getOffices({ activeOnly: 'true' })
        if (response.data?.success) {
          const list = response.data.data || []
          setOffices(list)
          if (list.length > 0 && !selectedOffice) {
            setSelectedOffice(String(list[0].id))
          }
        }
      } catch (err) {
        console.error('Load offices error:', err)
        setError('Unable to load offices')
      }
    }
    loadOffices()
  }, [])

  // 2. Load Rotating QR
  const loadRotatingQR = useCallback(async () => {
    if (!selectedOffice) return

    // Don't show full loading spinner on every rotation to keep UI smooth
    // Only show if it's the first load or if specific state needs it
    if (!activeQR) setLoading(true)

    try {
      const response = await qrAPI.getActiveRotating({ officeId: selectedOffice })
      if (response.data?.success) {
        const { qrId, qrImage, expiresAt, interval } = response.data.data
        setActiveQR({ qrId, qrImage })

        // Sync timer
        const expiry = new Date(expiresAt)
        const seconds = Math.max(0, Math.floor((expiry.getTime() - Date.now()) / 1000))
        setTimeLeft(seconds)
        if (interval) setRotationInterval(interval)

        setError('')
      } else {
        setError(response.data?.message || 'Failed to load code')
      }
    } catch (err) {
      console.error('Rotate error:', err)
      setError('Connection lost. Retrying...')
    } finally {
      setLoading(false)
    }
  }, [selectedOffice])

  // Initial Load
  useEffect(() => {
    loadRotatingQR()
  }, [selectedOffice, loadRotatingQR])

  // 3. Timer & Auto-Refresh Loop
  useEffect(() => {
    if (!activeQR) return

    const timer = setInterval(() => {
      setTimeLeft((prev) => {
        if (prev <= 1) {
          // Time up! Refresh immediately
          loadRotatingQR()
          return rotationInterval
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [activeQR, rotationInterval, loadRotatingQR])

  return (
    <ProtectedRoute requiredRoles={['admin', 'hr', 'employee']}>
      <DashboardLayout>
        <div className="min-h-[calc(100vh-10rem)] flex items-center justify-center py-10 px-4 bg-slate-900/50 backdrop-blur-sm rounded-[3rem] my-4">
          <div className="w-full max-w-sm flex flex-col items-center">

            {/* Office Selector */}
            <div className="w-full mb-8 relative group">
              <select
                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-2xl py-3 px-10 text-slate-300 font-medium appearance-none focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all cursor-pointer text-center text-sm"
                value={selectedOffice}
                onChange={(e) => {
                  setSelectedOffice(e.target.value)
                  setActiveQR(null) // Reset to trigger loading state
                }}
              >
                {offices.map((office) => (
                  <option key={office.id} value={office.id} className="bg-slate-900 text-white">
                    {office.name}
                  </option>
                ))}
              </select>
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-500" />
              <ChevronDown className="absolute right-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            </div>

            {/* QR Display */}
            <div className="relative group w-full aspect-square max-w-[340px]">
              <div className="absolute -inset-4 bg-blue-500/10 rounded-[3rem] blur-3xl group-hover:bg-blue-500/15 transition-all duration-1000"></div>

              <div className="relative w-full h-full bg-white rounded-[2.5rem] p-8 shadow-2xl flex items-center justify-center overflow-hidden">
                {loading && !activeQR ? (
                  <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                ) : activeQR?.qrImage ? (
                  <div className="relative w-full h-full flex items-center justify-center">
                    <img
                      src={activeQR.qrImage}
                      alt="Secure QR"
                      className="w-full h-full object-contain"
                    />

                    {/* Security Watermark / Animation */}
                    <div className="absolute inset-0 pointer-events-none">
                      <div className="w-full h-1 bg-blue-500/20 animate-[scan_2s_linear_infinite]" />
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-4">
                    <AlertCircle className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm font-medium">{error || 'Initializing Secure QR...'}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Security Timer Bar */}
            <div className="mt-8 w-full max-w-[200px] space-y-2">
              <div className="flex justify-between text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                <span>Secure ID</span>
                <span>{timeLeft}s</span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-1000 ${timeLeft < 10 ? 'bg-rose-500' : 'bg-blue-500'}`}
                  style={{ width: `${(timeLeft / rotationInterval) * 100}%` }}
                />
              </div>
            </div>

            {/* Info */}
            <div className="mt-8 flex items-center gap-3 px-6 py-3 bg-white/5 rounded-2xl border border-white/5">
              <Scan className="w-4 h-4 text-blue-400" />
              <p className="text-slate-400 text-[11px] font-medium tracking-wide">
                Valid for ONE scan only. Don't share.
              </p>
            </div>

          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  )
}
