import { useState, useEffect, useRef } from 'react';
import DashboardLayout from '../../components/DashboardLayout';
import { officesAPI } from '../../services/api';
import { QRCodeSVG } from 'qrcode.react';
import { toast } from 'react-hot-toast';

export default function QRKiosk() {
    const [offices, setOffices] = useState([]);
    const [selectedOffice, setSelectedOffice] = useState('');
    const [qrToken, setQrToken] = useState(null);
    const [loading, setLoading] = useState(false);
    const [countdown, setCountdown] = useState(30);
    const timerRef = useRef(null);

    useEffect(() => {
        fetchOffices();
        return () => clearInterval(timerRef.current);
    }, []);

    useEffect(() => {
        if (selectedOffice) {
            fetchQRToken();
            // Poll every 30s
            timerRef.current = setInterval(fetchQRToken, 30000);
        } else {
            setQrToken(null);
            clearInterval(timerRef.current);
        }
        return () => clearInterval(timerRef.current);
    }, [selectedOffice]);

    // Countdown timer effect
    useEffect(() => {
        if (selectedOffice && qrToken) {
            setCountdown(30);
            const countdownInterval = setInterval(() => {
                setCountdown((prev) => (prev > 0 ? prev - 1 : 0));
            }, 1000);
            return () => clearInterval(countdownInterval);
        }
    }, [qrToken, selectedOffice]);

    const fetchOffices = async () => {
        try {
            const res = await officesAPI.getOffices({ activeOnly: 'true' });
            if (res.data.success) {
                setOffices(res.data.data);
            }
        } catch (error) {
            console.error('Failed to fetch offices', error);
            toast.error('Failed to load offices');
        }
    };

    const fetchQRToken = async () => {
        if (!selectedOffice) return;
        try {
            // Direct call since we haven't updated api.js yet, typically we should update api.js
            // But for now accessing axios via imports is messy if api.js wraps it.
            // I will update api.js in the next step, assuming officesAPI.getQRToken exists.
            const res = await officesAPI.getQRToken(selectedOffice);
            if (res.data.success) {
                setQrToken(res.data.data.token);
            }
        } catch (error) {
            console.error('QR fetch error', error);
            // Don't toast on every poll error to avoid spam
        }
    };

    return (
        <DashboardLayout>
            <div className="max-w-4xl mx-auto p-6">
                <h1 className="text-2xl font-bold mb-6 text-gray-800">QR Check-In Kiosk</h1>

                <div className="bg-white p-6 rounded-lg shadow-md">
                    <div className="mb-6">
                        <label className="block text-sm font-medium text-gray-700 mb-2">Select Office Location</label>
                        <select
                            className="w-full md:w-1/2 p-2 border rounded-md"
                            value={selectedOffice}
                            onChange={(e) => setSelectedOffice(e.target.value)}
                        >
                            <option value="">-- Start Kiosk Mode --</option>
                            {offices.map((office) => (
                                <option key={office.id} value={office.id}>
                                    {office.name}
                                </option>
                            ))}
                        </select>
                    </div>

                    {selectedOffice && qrToken ? (
                        <div className="flex flex-col items-center justify-center py-10 space-y-6">
                            <div className="text-center">
                                <h2 className="text-3xl font-bold text-blue-600 mb-2">Scan to Check In</h2>
                                <p className="text-gray-500">Open the Employee App and scan this code</p>
                            </div>

                            <div className="p-4 bg-white border-4 border-blue-500 rounded-xl relative">
                                <QRCodeSVG value={qrToken} size={300} level="H" includeMargin={true} />
                                {/* Overlay Logo? Optional */}
                            </div>

                            <div className="text-sm text-gray-400">
                                Resets in {countdown}s
                            </div>
                        </div>
                    ) : (
                        <div className="text-center py-10 text-gray-400">
                            {selectedOffice ? 'Generating secure code...' : 'Please select an office to begin'}
                        </div>
                    )}
                </div>
            </div>
        </DashboardLayout>
    );
}
