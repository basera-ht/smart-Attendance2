
import { getDB, connectDB } from './src/config/db.js';
import { users } from './src/db/schema.js';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';
dotenv.config();

async function reset() {
    await connectDB();
    const db = getDB();
    await db.update(users).set({ registeredDeviceId: null }).where(eq(users.id, 8));
    console.log('RESET: User 8 registeredDeviceId set to null');
    process.exit(0);
}
reset();
