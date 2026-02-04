import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { connectDB, getDB } from '../src/config/db.js';
import { users } from '../src/db/schema.js';
import { desc } from 'drizzle-orm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function listUsers() {
    console.log('--- Listing All Users ---');
    await connectDB();
    const db = getDB();

    const allUsers = await db.select().from(users).orderBy(desc(users.createdAt));

    console.log(`Found ${allUsers.length} users.`);

    allUsers.forEach(u => {
        console.log(`ID: ${u.id}, Name: ${u.name}, Role: '${u.role}', Created: ${u.createdAt}`);
    });

    const adminCount = allUsers.filter(u => u.role === 'admin').length;
    console.log(`Total Admins: ${adminCount}`);

    process.exit(0);
}

listUsers();
