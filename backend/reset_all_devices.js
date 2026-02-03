import { getDB, connectDB } from './src/config/db.js';
import { users } from './src/db/schema.js';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';
dotenv.config();

async function resetAllDevices() {
    try {
        await connectDB();
        const db = getDB();

        console.log('Resetting "registeredDeviceId" for ALL users...');
        const result = await db.update(users).set({ registeredDeviceId: null }).returning();

        console.log(`✅ Successfully reset devices for ${result.length} users.`);
        console.log('Users will need to Log Out and Log In again to bind their current device.');

    } catch (error) {
        console.error('Reset Error:', error);
    }
    process.exit(0);
}

resetAllDevices();
