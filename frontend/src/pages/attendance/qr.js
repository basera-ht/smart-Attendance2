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
  const [refreshing, setRefreshing] = useState(false)
  const [timeLeft, setTimeLeft] = useState(0)

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

  const loadQR = useCallback(async (isManual = false) => {
    if (!selectedOffice) return
    if (isManual) setRefreshing(true)
    else setLoading(true)

    setError('')
    try {
      const response = await qrAPI.getActivePublic({ officeId: selectedOffice })
      if (response.data?.success && response.data.data) {
        setActiveQR(response.data.data)
        const expiry = new Date(response.data.data.expiresAt)
        const seconds = Math.max(0, Math.floor((expiry.getTime() - Date.now()) / 1000))
        setTimeLeft(seconds)
      } else {
        setActiveQR(null)
        setError(response.data?.message || 'No active QR found for this office.')
      }
    } catch (err) {
      console.error('Load active QR error:', err)
      setActiveQR(null)
      setError(err.response?.data?.message || 'Unable to load QR')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [selectedOffice])

  useEffect(() => {
    loadOffices()
  }, [])

  useEffect(() => {
    loadQR()
  }, [selectedOffice, loadQR])

  // Timer logic
  useEffect(() => {
    if (timeLeft <= 0) return

    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev <= 1) {
          clearInterval(timer)
          loadQR() // Auto refresh
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [timeLeft, loadQR])

  return (
    <ProtectedRoute requiredRoles={['admin', 'hr', 'employee']}>
      <DashboardLayout>
        <div className="min-h-[calc(100vh-10rem)] flex items-center justify-center py-10 px-4 bg-slate-900/50 backdrop-blur-sm rounded-[3rem] my-4">
          <div className="w-full max-w-sm flex flex-col items-center">

            {/* Minimalist Office Selector */}
            <div className="w-full mb-12 relative group">
              <select
                className="w-full bg-slate-800/50 border border-slate-700/50 rounded-2xl py-3 px-10 text-slate-300 font-medium appearance-none focus:outline-none focus:ring-1 focus:ring-blue-500/50 transition-all cursor-pointer text-center text-sm"
                value={selectedOffice}
                onChange={(e) => setSelectedOffice(e.target.value)}
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

            {/* Focused QR Display */}
            <div className="relative group w-full aspect-square max-w-[340px]">
              {/* Subtle ambient glow */}
              <div className="absolute -inset-4 bg-blue-500/10 rounded-[3rem] blur-3xl group-hover:bg-blue-500/15 transition-all duration-1000"></div>

              <div className="relative w-full h-full bg-white rounded-[2.5rem] p-8 shadow-2xl flex items-center justify-center">
                {loading ? (
                  <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
                ) : activeQR?.qrImage ? (
                  <div className="relative w-full h-full flex items-center justify-center">
                    <img
                      src={activeQR.qrImage}
                      alt="QR"
                      className={`w-full h-full object-contain ${refreshing ? 'opacity-20' : 'opacity-100'} transition-opacity`}
                    />

                    {/* Small, Clean Logo Overlay */}
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-14 h-14 bg-white rounded-xl p-1.5 shadow-md border border-slate-50">
                      <img src="/logo.png" alt="Logo" className="w-full h-full object-contain" />
                    </div>
                  </div>
                ) : (
                  <div className="text-center p-4">
                    <AlertCircle className="w-8 h-8 text-slate-200 mx-auto mb-2" />
                    <p className="text-slate-400 text-sm font-medium">{error || 'No active QR'}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Minimalist Digital Timer */}
            <div className="mt-12 w-full flex flex-col items-center gap-6">
              {activeQR && (
                <>
                  <div className="flex flex-col items-center">
                    <div className={`text-4xl font-mono font-bold tracking-tighter ${timeLeft < 20 ? 'text-rose-500 animate-pulse' : 'text-white'}`}>
                      {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, '0')}
                    </div>
                    <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em] mt-1">Token Lifetime</span>
                  </div>

                  <button
                    onClick={() => loadQR(true)}
                    disabled={refreshing || loading}
                    className="group bg-slate-800/40 hover:bg-slate-800/60 border border-slate-700/50 text-slate-400 hover:text-white px-6 py-2.5 rounded-full text-xs font-bold flex items-center gap-2 transition-all disabled:opacity-30"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-500' : ''}`} />
                    Manual Sync
                  </button>
                </>
              )}
            </div>

            {/* Minimal Background Context */}
            <div className="mt-16 flex items-center gap-3 px-6 py-3 bg-white/5 rounded-2xl border border-white/5">
              <Scan className="w-4 h-4 text-blue-400" />
              <p className="text-slate-400 text-[11px] font-medium tracking-wide">Align with terminal for automatic validation</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    </ProtectedRoute>
  )
}
