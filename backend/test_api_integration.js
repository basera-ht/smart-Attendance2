
import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';
dotenv.config();

const API_Base = 'http://localhost:5000/api';
// Use the secret from env or fallback
const JWT_SECRET = process.env.JWT_SECRET || 'b4c92798-fb9e-4498-8076-9dd493a4bf4e';
const USER_ID = 8;

// Generate a valid token
const token = jwt.sign(
    { id: USER_ID, type: 'access' },
    JWT_SECRET,
    { expiresIn: '15m' }
);

const testPayload = {
    latitude: 28.6139,
    longitude: 77.2090,
    accuracy: 10,
    timestamp: Date.now(),
    deviceId: "dev_TEST_INTEGRATION_" + Date.now()
};

async function runTest() {
    try {
        console.log('TEST: Sending CheckIn Secure request to ' + API_Base + '/attendance/checkin-secure');
        console.log('TEST: Payload Device ID:', testPayload.deviceId);

        const response = await fetch(`${API_Base}/attendance/checkin-secure`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(testPayload)
        });

        const data = await response.json();

        console.log('TEST: Response Status:', response.status);
        console.log('TEST: Response Data:', JSON.stringify(data, null, 2));

        if (data.success) {
            console.log('TEST: SUCCESS! Check-in processed.');
        } else {
            console.log(`TEST: FAILED. Message: ${data.message}`);
        }

    } catch (error) {
        console.error('TEST: HTTP Request Failed', error);
    }
}

runTest();
