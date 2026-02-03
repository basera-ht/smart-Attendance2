import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

// MOCK CONSTANTS
const BASE_URL = 'http://localhost:5000/api';
const EMAIL = 'test@example.com';
const PASSWORD = 'password123';
const DEVICE_ID = 'device_test_123'; // The ID we CLAIM is ours
const JWT_SECRET = process.env.JWT_SECRET || 'your_super_secret_jwt_key';

async function run() {
    try {
        console.log('--- 1. Logging in ---');
        const loginRes = await fetch(`${BASE_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email: EMAIL,
                password: PASSWORD,
                deviceId: DEVICE_ID
            })
        });

        const loginData = await loginRes.json();
        console.log('Login Status:', loginRes.status);

        if (!loginData.success) {
            console.error('Login Failed:', loginData);
            return;
        }

        console.log('Login Success! Token received.');
        const token = loginData.data.token;
        const user = loginData.data.user;
        console.log('User Registered Device:', user.registeredDeviceId);

        console.log('--- 2. Generating QR Token (Mock Admin) ---');
        // We need an Office ID. Assuming ID 1 exists.
        const officeId = 1;
        const qrPayload = {
            officeId,
            timestamp: Date.now(),
            nonce: Math.random().toString(36).substring(7)
        };
        const qrToken = jwt.sign(qrPayload, JWT_SECRET, { expiresIn: '30s' });
        console.log('QR Token Generated:', qrToken.substring(0, 20) + '...');

        console.log('--- 3. Attempting QR Check-in ---');
        const checkInRes = await fetch(`${BASE_URL}/attendance/checkin-qr`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                qrToken,
                deviceId: DEVICE_ID,
                latitude: 12.9716, // Mock location
                longitude: 77.5946
            })
        });
        const checkInData = await checkInRes.json();
        if (checkInRes.ok) {
            console.log('✅ Check-in Success:', checkInData);
        } else {
            console.error('❌ Check-in Failed:', checkInData);
        }

        console.log('--- 4. Attempting QR Check-in with WRONG Device ---');
        const failRes = await fetch(`${BASE_URL}/attendance/checkin-qr`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
                qrToken,
                deviceId: 'wrong_device_id', // Intentionally wrong
                latitude: 12.9716,
                longitude: 77.5946
            })
        });
        const failData = await failRes.json();
        if (failRes.ok) {
            console.log('❌ Unexpected Success (Should have failed)');
        } else {
            console.log('✅ Check-in Correctly Failed (Device Mismatch):', failData.message);
        }

    } catch (error) {
        console.error('Script Error:', error);
    }
}

run();
