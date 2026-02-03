
import { getDB, connectDB } from './src/config/db.js';
import { users } from './src/db/schema.js';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';
dotenv.config();

async function check() {
    await connectDB();
    const db = getDB();
    const [user] = await db.select().from(users).where(eq(users.email, 'parasbasera9@gmail.com'));
    console.log('User ID:', user?.id);
    console.log('Device ID:', user?.registeredDeviceId);
    process.exit(0);
}
check();
