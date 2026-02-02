'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { attendanceAPI } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { MapPin, CheckCircle, AlertCircle, Loader2, ShieldCheck, RefreshCw, Lock } from 'lucide-react'

export default function SecureCheckInPage() {
  const router = useRouter()
  const { isAuthenticated, user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('idle') // idle, locating, verifying, success, error
  const [message, setMessage] = useState('')
  const [distance, setDistance] = useState(null)

  useEffect(() => {
    if (!isAuthenticated) router.push('/login')
  }, [isAuthenticated, router])

  const handleCheckIn = async () => {
    try {
      setStatus('locating')
      setLoading(true)
      setMessage('Acquiring precise location...')

      // 1. Get GPS
      if (!navigator.geolocation) {
        throw new Error("Geolocation is not supported by this browser.")
      }

      navigator.geolocation.getCurrentPosition(async (pos) => {
        try {
          setStatus('verifying')
          setMessage('Verifying Security Tokens...')

          const { latitude, longitude, accuracy } = pos.coords
          const timestamp = pos.timestamp

          // Validate Accuracy locally (Warn if > 50m, but let server decide strictness)
          if (accuracy > 100) {
            console.warn("Low GPS Accuracy:", accuracy);
            // We continue, but server might reject if out of bounds
          }

          const response = await attendanceAPI.checkInSecure({
            latitude,
            longitude,
            accuracy,
            timestamp
          })

          if (response.data?.success) {
            setStatus('success')
            setMessage(response.data.message || 'Check-in Successful')
            setDistance(response.data.data?.distance)
            if ('vibrate' in navigator) navigator.vibrate([100, 50, 100])
          } else {
            throw new Error(response.data?.message || 'Check-in failed')
          }
        } catch (apiErr) {
          console.error(apiErr)
          setStatus('error')
          setMessage(apiErr.response?.data?.message || apiErr.message || "Server Verification Failed")
        } finally {
          setLoading(false)
        }

      }, (geoErr) => {
        console.error(geoErr)
        setStatus('error')
        setMessage("Location Access Denied. Please enable GPS to check in.")
        setLoading(false)
      }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 })

    } catch (err) {
      setStatus('error')
      setMessage(err.message)
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm bg-slate-800/50 backdrop-blur-xl border border-slate-700/50 rounded-3xl p-8 flex flex-col items-center text-center shadow-2xl">

        <div className="mb-6 p-4 bg-blue-500/10 rounded-full">
          <Lock className="w-12 h-12 text-blue-500" />
        </div>

        <h1 className="text-2xl font-bold text-white mb-2">Secure Check-In</h1>
        <p className="text-slate-400 text-sm mb-8">
          Requires Office Wi-Fi & GPS within 50m.
        </p>

        {status === 'idle' || status === 'error' ? (
          <button
            onClick={handleCheckIn}
            disabled={loading}
            className="group relative w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-2xl transition-all active:scale-95 shadow-lg shadow-blue-900/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <span className="flex items-center justify-center gap-2 text-lg">
              {status === 'error' ? <RefreshCw className="w-5 h-5" /> : <ShieldCheck className="w-5 h-5" />}
              {status === 'error' ? 'Retry Check-In' : 'Start Check-In'}
            </span>
          </button>
        ) : (
          <div className="w-full py-4 rounded-2xl bg-slate-900/50 border border-slate-700 flex flex-col items-center justify-center gap-3">
            {status === 'success' ? (
              <CheckCircle className="w-10 h-10 text-emerald-500 animate-in zoom-in duration-300" />
            ) : (
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            )}
            <span className={`font-medium ${status === 'success' ? 'text-emerald-400' : 'text-blue-400'}`}>
              {message}
            </span>
            {distance !== null && <span className="text-xs text-slate-500">Distance: {distance}m</span>}
          </div>
        )}

        {status === 'error' && (
          <div className="mt-6 flex items-start gap-3 text-left bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl">
            <AlertCircle className="w-5 h-5 text-rose-500 flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-rose-200 text-sm font-medium">{message}</p>
              <p className="text-rose-400/60 text-xs text-center mt-2">Common Fixes: Connect to Office Wi-Fi • Move closer to entry • Enable Precise Location</p>
            </div>
          </div>
        )}

        <div className="mt-8 flex items-center justify-center gap-4 text-[10px] text-slate-600 uppercase tracking-widest font-semibold">
          <span className="flex items-center gap-1"><ShieldCheck className="w-3 h-3" /> Anti-Spoofing</span>
          <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> Geofence</span>
        </div>

      </div>
    </div>
  )
}
