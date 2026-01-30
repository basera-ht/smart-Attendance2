'use client'
import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import jsQR from 'jsqr'
import { attendanceAPI, qrAPI } from '../../services/api'
import { useAuth } from '../../hooks/useAuth'
import { Camera, AlertCircle, CheckCircle, Loader, Upload, WifiOff, Zap, ZapOff, RefreshCcw } from 'lucide-react'
import { getCachedKey, setCachedKey } from '../../utils/keyCache'
import { saveAttendanceAttempt, listQueuedRecords, updateQueueRecord } from '../../utils/offlineQueue'

export default function QRScanPage() {
  const router = useRouter()
  const { isAuthenticated } = useAuth()
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const streamRef = useRef(null)
  const fileInputRef = useRef(null)

  const [scanning, setScanning] = useState(false)
  const [qrData, setQrData] = useState(null)
  const [processing, setProcessing] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)
  const [cameraError, setCameraError] = useState(null)
  const [fileError, setFileError] = useState(null)
  const [ssid, setSsid] = useState('')
  const [networkInfo, setNetworkInfo] = useState({ networkType: 'unknown', isCellular: false })
  const [syncNotice, setSyncNotice] = useState(null)
  const [canUseCamera, setCanUseCamera] = useState(false)
  const [torchOn, setTorchOn] = useState(false)
  const [hasTorch, setHasTorch] = useState(false)

  useEffect(() => {
    if (!isAuthenticated) {
      router.push('/login')
    }
  }, [isAuthenticated, router])

  useEffect(() => {
    const info = getNetworkInfo()
    setNetworkInfo(info)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return
    const available = !!navigator?.mediaDevices?.getUserMedia
    setCanUseCamera(available)
    if (!available) {
      setCameraError('Camera requires HTTPS (or localhost) on mobile browsers.')
    } else {
      // Auto-start camera if available
      startCamera()
    }
  }, [])

  useEffect(() => {
    const refreshQueueStatus = async () => {
      try {
        const records = await listQueuedRecords()
        const rejected = records.filter((record) => record.status === 'REJECTED')
        if (rejected.length > 0) {
          setSyncNotice('Some offline scans were rejected during sync. Please contact admin.')
        }
      } catch (err) {
        console.error('Failed to load offline queue status:', err)
      }
    }

    refreshQueueStatus()
    const handleOnline = () => refreshQueueStatus()
    window.addEventListener('online', handleOnline)
    return () => window.removeEventListener('online', handleOnline)
  }, [])

  const decodeQRPayload = (encodedPayload) => {
    try {
      // Try parsing as JSON first (legacy support)
      return JSON.parse(encodedPayload)
    } catch (err) {
      // If not JSON, it's a raw token string (new format)
      return encodedPayload
    }
  }

  const base64UrlToUint8Array = (value) => {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  };

  const parseJwt = (token) => {
    const parts = token.split('.');
    if (parts.length !== 3) {
      throw new Error('Invalid JWT structure');
    }
    const [headerB64, payloadB64, signatureB64] = parts;
    const header = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(headerB64)));
    const payload = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(payloadB64)));
    return { header, payload, signatureB64, signingInput: `${headerB64}.${payloadB64}` };
  };

  const importPublicKey = async (pem) => {
    const cleaned = pem
      .replace(/-----BEGIN PUBLIC KEY-----/g, '')
      .replace(/-----END PUBLIC KEY-----/g, '')
      .replace(/\s/g, '');
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    return window.crypto.subtle.importKey(
      'spki',
      bytes.buffer,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false,
      ['verify']
    );
  };

  const verifyJwt = async (token, publicKeyPem) => {
    const { signatureB64, signingInput } = parseJwt(token);
    const key = await importPublicKey(publicKeyPem);
    const signature = base64UrlToUint8Array(signatureB64);
    const data = new TextEncoder().encode(signingInput);
    return window.crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, signature, data);
  };

  const getPublicKey = async (keyId) => {
    const cached = keyId ? await getCachedKey(keyId) : null;
    if (cached?.publicKey) {
      return cached.publicKey;
    }
    const response = await qrAPI.getPublicKey();
    if (!response.data?.success) {
      throw new Error(response.data?.message || 'Unable to fetch public key');
    }
    const { keyId: serverKeyId, publicKey } = response.data.data;
    await setCachedKey({ keyId: serverKeyId, publicKey });
    return publicKey;
  };

  const getNetworkInfo = () => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection || {}
    const type = connection.type || connection.effectiveType || 'unknown'
    const normalized = String(type).toLowerCase()
    const isCellular = normalized === 'cellular' || ['2g', '3g', '4g', '5g', 'slow-2g'].includes(normalized)
    return { networkType: normalized || 'unknown', isCellular }
  }

  const startCamera = async () => {
    try {
      setCameraError(null)
      setResult(null)
      if (typeof window === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
        setCameraError('Camera access is not available here. Use HTTPS (or localhost) on a supported device.')
        setScanning(false)
        return
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        }
      })
      streamRef.current = stream

      // Check for torch support
      const track = stream.getVideoTracks()[0]
      const capabilities = track.getCapabilities?.() || {}
      setHasTorch(!!capabilities.torch)

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setScanning(true)
      }
    } catch (err) {
      console.error('Camera error:', err)
      setCameraError('Failed to access camera. Please allow camera permissions.')
      setScanning(false)
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop())
      streamRef.current = null
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }
    setScanning(false)
    setTorchOn(false)
  }

  const toggleTorch = async () => {
    if (!streamRef.current) return
    const track = streamRef.current.getVideoTracks()[0]
    try {
      await track.applyConstraints({
        advanced: [{ torch: !torchOn }]
      })
      setTorchOn(!torchOn)
    } catch (err) {
      console.error('Failed to toggle torch:', err)
    }
  }

  const scanQR = () => {
    if (!scanning || !videoRef.current || !canvasRef.current) return

    const video = videoRef.current
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')

    if (video.readyState === video.HAVE_ENOUGH_DATA) {
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)

      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
      const code = jsQR(imageData.data, imageData.width, imageData.height)

      if (code && code.data) {
        try {
          const decoded = decodeQRPayload(code.data)
          // Vibration feedback
          if ('vibrate' in navigator) {
            navigator.vibrate(100)
          }
          setQrData(decoded)
          stopCamera()
          handleQRDetected(decoded)
        } catch (err) {
          console.error('QR decode error:', err)
          setError('Invalid QR code format')
        }
      }
    }

    if (scanning) {
      requestAnimationFrame(scanQR)
    }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setFileError('Please select an image file')
      return
    }

    setFileError(null)
    const reader = new FileReader()
    reader.onload = (event) => {
      const img = new Image()
      img.onload = () => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        canvas.width = img.width
        canvas.height = img.height
        ctx.drawImage(img, 0, 0)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const code = jsQR(imageData.data, imageData.width, imageData.height)
        if (code?.data) {
          try {
            const decoded = decodeQRPayload(code.data)
            if ('vibrate' in navigator) {
              navigator.vibrate(100)
            }
            setQrData(decoded)
            handleQRDetected(decoded)
          } catch (err) {
            setFileError('Invalid QR image')
          }
        } else {
          setFileError('No QR code found in image')
        }
      }
      img.onerror = () => {
        setFileError('Failed to load image')
      }
      img.src = event.target.result
    }
    reader.readAsDataURL(file)
  }

  const handleQRDetected = async (decodedQR) => {
    try {
      setProcessing(true)
      setError(null)

      let token;
      try {
        // Try decoding as legacy JSON first
        const decoded = JSON.parse(decodedQR)
        token = decoded.token
      } catch (e) {
        // If not JSON, treat the whole payload as the raw token
        token = decodedQR
      }

      if (!token) {
        setError('Invalid QR code payload')
        setProcessing(false)
        return
      }

      const parsed = parseJwt(token)
      const publicKey = await getPublicKey(parsed.header?.kid)
      const verified = await verifyJwt(token, publicKey)
      if (!verified) {
        setError('QR token signature verification failed.')
        setProcessing(false)
        return
      }

      const expMs = parsed.payload?.exp ? parsed.payload.exp * 1000 : null
      if (expMs && expMs < Date.now()) {
        setError('QR token has expired. Please request a new one.')
        setProcessing(false)
        return
      }

      const info = getNetworkInfo()
      setNetworkInfo(info)
      if (info.isCellular) {
        setError('Cellular network detected. Connect to office Wi-Fi.')
        setProcessing(false)
        return
      }

      const isOnline = navigator.onLine
      const authToken = typeof window !== 'undefined' ? localStorage.getItem('token') : null
      const attempt = await saveAttendanceAttempt({
        token: decodedQR.token,
        scannedAt: new Date().toISOString(),
        networkState: isOnline ? 'ONLINE' : 'OFFLINE',
        networkType: info.networkType,
        ssid: ssid.trim() || null,
        status: 'PENDING',
        syncAttempts: 0,
        authHeader: authToken ? `Bearer ${authToken}` : null
      })

      if (!isOnline) {
        setResult({ status: 'PENDING' })
        setProcessing(false)
        return
      }

      const response = await attendanceAPI.submit({
        id: attempt.id,
        token: attempt.token,
        scannedAt: attempt.scannedAt,
        networkState: attempt.networkState,
        networkType: attempt.networkType,
        ssid: attempt.ssid
      })

      if (response.data?.success) {
        const resultItem = response.data?.data?.results?.[0]
        const resultStatus = resultItem?.status || 'FINAL'
        await updateQueueRecord({
          ...attempt,
          status: resultStatus
        })
        setResult({ status: resultStatus })
        // Haptic for success
        if ('vibrate' in navigator) {
          navigator.vibrate([100, 50, 100])
        }
      } else {
        await updateQueueRecord({
          ...attempt,
          status: 'REJECTED'
        })
        setError(response.data?.message || 'Attendance validation failed')
      }
    } catch (err) {
      console.error('QR validation error:', err)
      const message =
        err.response?.data?.message ||
        err.response?.data?.errors?.[0]?.msg ||
        'Attendance validation failed'
      setError(message)
    } finally {
      setProcessing(false)
    }
  }

  useEffect(() => {
    if (scanning) {
      scanQR()
    }
  }, [scanning])

  useEffect(() => {
    return () => stopCamera()
  }, [])

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md space-y-6">
        {/* Header Section */}
        <div className="text-center space-y-2">
          <h1 className="text-3xl font-bold text-white tracking-tight">Scanner</h1>
          <p className="text-slate-400 text-sm">Align QR code within the frame</p>
        </div>

        {/* Camera/Scanner Container */}
        <div className="relative aspect-square w-full max-w-sm mx-auto bg-black rounded-3xl overflow-hidden shadow-2xl border-2 border-slate-800">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            playsInline
            muted
          />
          <canvas ref={canvasRef} className="hidden" />

          {/* Scanner Overlay */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {/* Dark Mask */}
            <div className="absolute inset-0 bg-black/40" />

            {/* Scanning Window */}
            <div className="relative w-64 h-64 border-2 border-white/30 rounded-3xl overflow-hidden shadow-[0_0_0_1000px_rgba(0,0,0,0.5)]">
              {/* Corner Indicators */}
              <div className="absolute top-0 left-0 w-8 h-8 border-t-4 border-l-4 border-blue-500 rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-8 h-8 border-t-4 border-r-4 border-blue-500 rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-8 h-8 border-b-4 border-l-4 border-blue-500 rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-8 h-8 border-b-4 border-r-4 border-blue-500 rounded-br-xl" />

              {/* Scanning Line Animation */}
              {scanning && (
                <div className="absolute top-0 left-0 w-full h-1 bg-blue-500/80 shadow-[0_0_15px_blue] animate-[scan_2s_linear_infinite]" />
              )}
            </div>

            {/* Flash/Torch Toggle */}
            {hasTorch && scanning && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleTorch();
                }}
                className="absolute bottom-8 p-4 bg-white/10 backdrop-blur-md rounded-full text-white pointer-events-auto hover:bg-white/20 transition-colors"
                title="Toggle Flashlight"
              >
                {torchOn ? <ZapOff className="w-6 h-6" /> : <Zap className="w-6 h-6" />}
              </button>
            )}
          </div>

          {/* No Camera Prompt */}
          {!scanning && !processing && !result && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900/90 text-center p-6 space-y-4">
              <Camera className="w-12 h-12 text-slate-500" />
              <div className="space-y-1">
                <p className="text-white font-medium">Ready to scan?</p>
                <p className="text-slate-400 text-sm">Start your camera to begin validation</p>
              </div>
              <button
                onClick={startCamera}
                disabled={!canUseCamera}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-700 text-white px-6 py-2.5 rounded-full font-semibold transition-all shadow-lg"
              >
                Start Camera
              </button>
            </div>
          )}

          {/* Processing State */}
          {processing && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-blue-600/90 text-center p-6 space-y-4 z-10 animate-in fade-in zoom-in duration-300">
              <Loader className="w-12 h-12 text-white animate-spin" />
              <p className="text-white font-semibold text-lg">Validating...</p>
            </div>
          )}

          {/* Success Result */}
          {result?.status === 'FINAL' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-emerald-600 text-center p-6 space-y-4 z-20 animate-in zoom-in slide-in-from-bottom duration-500">
              <div className="bg-white/20 p-4 rounded-full">
                <CheckCircle className="w-16 h-16 text-white" />
              </div>
              <div className="space-y-1">
                <p className="text-white text-2xl font-bold">Authenticated!</p>
                <p className="text-emerald-100 italic">Attendance recorded successfully</p>
              </div>
              <button
                onClick={() => { setResult(null); startCamera(); }}
                className="mt-4 bg-white text-emerald-700 px-6 py-2 rounded-full font-bold shadow-lg"
              >
                Done
              </button>
            </div>
          )}

          {/* Pending/Offline Result */}
          {result?.status === 'PENDING' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-amber-500 text-center p-6 space-y-4 z-20 animate-in zoom-in duration-500">
              <div className="bg-white/20 p-4 rounded-full">
                <WifiOff className="w-16 h-16 text-white" />
              </div>
              <div className="space-y-1">
                <p className="text-white text-2xl font-bold">Saved Offline</p>
                <p className="text-amber-100">Will sync automatically once online</p>
              </div>
              <button
                onClick={() => { setResult(null); startCamera(); }}
                className="mt-4 bg-white text-amber-700 px-6 py-2 rounded-full font-bold shadow-lg"
              >
                Continue
              </button>
            </div>
          )}

          {/* Error State */}
          {(error || cameraError || fileError) && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-rose-600 text-center p-6 space-y-4 z-20 animate-in zoom-in duration-500">
              <div className="bg-white/20 p-4 rounded-full">
                <AlertCircle className="w-16 h-16 text-white" />
              </div>
              <div className="space-y-1 px-4">
                <p className="text-white text-xl font-bold">Validation Error</p>
                <p className="text-rose-100 text-sm line-clamp-3">{error || cameraError || fileError}</p>
              </div>
              <button
                onClick={() => { setError(null); setFileError(null); setCameraError(null); startCamera(); }}
                className="mt-4 bg-white text-rose-700 px-8 py-2.5 rounded-full font-bold shadow-lg flex items-center gap-2"
              >
                <RefreshCcw className="w-4 h-4" />
                Try Again
              </button>
            </div>
          )}
        </div>

        {/* Action Buttons Section */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center justify-center gap-2 bg-slate-800 hover:bg-slate-700 text-slate-200 py-3 rounded-2xl font-medium transition-colors"
          >
            <Upload className="w-4 h-4" />
            Upload Image
          </button>

          <div className="flex flex-col">
            <input
              type="text"
              value={ssid}
              onChange={(e) => setSsid(e.target.value)}
              className="w-full bg-slate-800 border-none text-white text-sm px-4 py-3 rounded-2xl focus:ring-2 focus:ring-blue-500 transition-all placeholder:text-slate-500"
              placeholder="Office WiFi (Optional)"
            />
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={handleFileSelect}
            className="hidden"
          />
        </div>

        {/* Sync/Notice Banner */}
        {syncNotice && (
          <div className="bg-orange-500/10 border border-orange-500/20 text-orange-400 px-4 py-3 rounded-2xl flex items-center gap-3 text-sm animate-pulse">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <p>{syncNotice}</p>
          </div>
        )}

        {/* Network Info Footer */}
        <div className="flex items-center justify-center gap-2 text-xs text-slate-500 font-medium tracking-wide uppercase">
          <div className={`w-2 h-2 rounded-full ${networkInfo.isCellular ? 'bg-orange-500' : 'bg-emerald-500'}`} />
          {networkInfo.networkType} Network
        </div>
      </div>

      <style jsx global>{`
        @keyframes scan {
          0% { transform: translateY(0); opacity: 0; }
          10% { opacity: 1; }
          90% { opacity: 1; }
          100% { transform: translateY(256px); opacity: 0; }
        }
      `}</style>
    </div>
  )
}
