
import { verifyDevice } from './src/services/deviceService.js';
import { getDB, connectDB } from './src/config/db.js';
import { users } from './src/db/schema.js';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';
dotenv.config();

const TARGET_USER_EMAIL = 'parasbasera9@gmail.com';
const TEST_DEVICE_ID = 'test_device_' + Date.now();

async function testBinding() {
    try {
        await connectDB();
        const db = getDB();

        // 1. Get User ID
        const [user] = await db.select().from(users).where(eq(users.email, TARGET_USER_EMAIL));
        if (!user) throw new Error('User not found for test');

        console.log(`TEST: Found user ${user.id} with registeredDeviceId: ${user.registeredDeviceId}`);

        // 2. Call Service
        console.log(`TEST: Attempting to bind device ${TEST_DEVICE_ID}...`);
        await verifyDevice(user.id, TEST_DEVICE_ID);

        // 3. Verify Result
        const [updatedUser] = await db.select().from(users).where(eq(users.id, user.id));
        console.log(`TEST: Result registeredDeviceId: ${updatedUser.registeredDeviceId}`);

        if (updatedUser.registeredDeviceId === TEST_DEVICE_ID) {
            console.log('TEST: SUCCESS! Device bound.');
        } else if (user.registeredDeviceId && updatedUser.registeredDeviceId === user.registeredDeviceId) {
            console.log('TEST: SKIPPED (Already bound to another device). Service correctly didn\'t overwrite.');
        } else {
            console.log('TEST: FAILED. Device not bound.');
        }

    } catch (error) {
        console.error('TEST ERROR:', error);
    }
    process.exit(0);
}

testBinding();
