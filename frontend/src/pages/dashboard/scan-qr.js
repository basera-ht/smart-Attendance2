import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import DashboardLayout from '../../components/DashboardLayout';
import { attendanceAPI } from '../../services/api';
import { getDeviceId } from '../../utils/deviceUtils'; // Reuse persistent ID
import QrScanner from 'react-qr-scanner';
import { toast } from 'react-hot-toast';

export default function ScanQR() {
    const router = useRouter();
    const [data, setData] = useState('No result');
    const [isScanning, setIsScanning] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleScan = async (result) => {
        if (result && isScanning && !loading) {
            // The library returns an object with 'text' property or just the string depending on version
            // Let's handle both
            const token = result?.text || result;

            if (!token) return;

            setIsScanning(false); // Stop scanning immediately
            setLoading(true);
            setData(token);

            try {
                const deviceId = getDeviceId();
                if (!deviceId) {
                    setError('Device ID not found. Please log in again.');
                    return;
                }

                let location = null;
                try {
                    location = await new Promise((resolve, reject) => {
                        if (!navigator.geolocation) {
                            resolve(null);
                            return;
                        }
                        navigator.geolocation.getCurrentPosition(
                            (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
                            (err) => {
                                console.warn('Location access denied or failed', err);
                                resolve(null); // Proceed without location if failed
                            },
                            { enableHighAccuracy: true, timeout: 5000 }
                        );
                    });
                } catch (e) {
                    console.warn('Location error', e);
                }

                await processCheckIn(token, deviceId, location);

            } catch (err) {
                console.error('Processing error', err);
                setError('Failed to process QR code');
                setLoading(false);
                setIsScanning(true); // Resume scanning on error? Maybe manual retry is better.
            }
        }
    };

    const processCheckIn = async (qrToken, deviceId, location) => {
        try {
            const payload = {
                qrToken,
                deviceId,
                latitude: location?.latitude,
                longitude: location?.longitude
            };

            const response = await attendanceAPI.checkInQR(payload);
            if (response.data.success) {
                toast.success(response.data.message);
                router.push('/dashboard');
            } else {
                throw new Error(response.data.message || 'Check-in failed');
            }
        } catch (err) {
            const msg = err.response?.data?.message || err.message || 'Check-in failed';
            toast.error(msg);
            setError(msg);
            setLoading(false);
            // Maybe don't auto-resume scanning, let user click "Try Again"
        }
    }

    const handleError = (err) => {
        console.error(err);
        setError('Camera access error. Please ensure permissions are granted.');
    };

    return (
        <DashboardLayout>
            <div className="max-w-md mx-auto p-4">
                <h1 className="text-2xl font-bold mb-4 text-gray-800">Scan QR Code</h1>

                <div className="bg-white rounded-lg shadow-md p-4 flex flex-col items-center">
                    {error ? (
                        <div className="text-center p-6">
                            <div className="text-red-500 text-xl mb-4">⚠️</div>
                            <p className="text-red-600 mb-4">{error}</p>
                            <button
                                onClick={() => { setError(''); setIsScanning(true); setLoading(false); }}
                                className="px-4 py-2 bg-blue-600 text-white rounded-md"
                            >
                                Try Again
                            </button>
                        </div>
                    ) : isScanning ? (
                        <div className="w-full overflow-hidden rounded-lg bg-black relative aspect-square">
                            <QrScanner
                                delay={300}
                                onError={handleError}
                                onScan={handleScan}
                                style={{ width: '100%', height: '100%' }}
                            // constraints={{ video: { facingMode: 'environment' } }} // Use back camera
                            />
                            <div className="absolute inset-0 border-2 border-blue-500/50 pointer-events-none flex items-center justify-center">
                                <div className="w-48 h-48 border-2 border-blue-400 rounded-lg"></div>
                            </div>
                            <div className="absolute bottom-4 left-0 right-0 text-center text-white text-sm bg-black/50 py-1">
                                Point camera at the Office QR Code
                            </div>
                        </div>
                    ) : loading ? (
                        <div className="py-12 flex flex-col items-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
                            <p className="text-gray-600">Verifying QR Code...</p>
                        </div>
                    ) : (
                        <div className="text-center">
                            <p className="text-green-600 font-medium">Scanned!</p>
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
