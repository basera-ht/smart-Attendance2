
import axios from 'axios';
import { getDB, connectDB } from './src/config/db.js';
import { users } from './src/db/schema.js';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';
dotenv.config();

const API_Base = 'http://localhost:5000/api';
const TEST_EMAIL = 'parasbasera9@gmail.com';
const TEST_PASSWORD = 'Basera00'; // Assuming this is correct from logs, if not test will fail (401)
const TEST_DEVICE_ID = 'dev_LOGIN_TEST_' + Date.now();

async function testLoginBinding() {
    try {
        console.log('TEST: Resetting device ID for User...');
        await connectDB();
        const db = getDB();
        // 1. Reset Device ID to null
        await db.update(users).set({ registeredDeviceId: null }).where(eq(users.email, TEST_EMAIL));

        // 2. Perform Login with Device ID
        console.log('TEST: Logging in with Device ID:', TEST_DEVICE_ID);
        const res = await axios.post(`${API_Base}/auth/login`, {
            email: TEST_EMAIL,
            password: TEST_PASSWORD,
            deviceId: TEST_DEVICE_ID
        });

        console.log('TEST: Login Status:', res.status);

        if (res.data.success) {
            console.log('TEST: Login Successful.');

            // 3. Verify DB update
            const [user] = await db.select().from(users).where(eq(users.email, TEST_EMAIL));
            console.log(`TEST: DB registeredDeviceId: ${user.registeredDeviceId}`);

            if (user.registeredDeviceId === TEST_DEVICE_ID) {
                console.log('TEST: SUCCESS! Device bound on login.');
            } else {
                console.log('TEST: FAILED. Device not bound.');
            }
        } else {
            console.log('TEST: Login Failed:', res.data.message);
        }

    } catch (error) {
        console.error('TEST ERROR:', error.message);
        if (error.response) {
            console.error('Response Data:', error.response.data);
        }
    }
    process.exit(0);
}

testLoginBinding();
