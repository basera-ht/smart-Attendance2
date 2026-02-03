
import { getDB, connectDB } from './src/config/db.js';
import { users } from './src/db/schema.js';
import { eq } from 'drizzle-orm';
import dotenv from 'dotenv';
import fs from 'fs';
dotenv.config();

async function checkUser() {
    try {
        await connectDB();
        const db = getDB();
        const usersList = await db.select().from(users).where(eq(users.email, 'parasbasera9@gmail.com'));

        fs.writeFileSync('verification_result.json', JSON.stringify(usersList, null, 2));
        console.log('Result written to verification_result.json');

    } catch (error) {
        console.error('Error:', error);
        fs.writeFileSync('verification_result.json', JSON.stringify({ error: error.message }));
    }
    process.exit(0);
}

checkUser();
