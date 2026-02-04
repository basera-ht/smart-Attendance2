import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { eq } from 'drizzle-orm';
import { connectDB, getDB } from '../src/config/db.js';
import { offices } from '../src/db/schema.js';

// Fix for ES modules __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Explicitly load .env from backend root
dotenv.config({ path: path.join(__dirname, '../.env') });

async function manageOfficeIps() {
    console.log('--- Office IP Management Script ---');

    await connectDB();
    const db = getDB();

    try {
        // 1. List existing offices
        const allOffices = await db.select().from(offices);

        if (allOffices.length === 0) {
            console.log('❌ No offices found in database.');
            return;
        }

        console.log(`Found ${allOffices.length} offices.`);

        // 2. Update the first office (or a specific one if needed)
        // For this task, we'll update the first active office we find, or all of them.
        // Let's target the one named 'Head Office' or similar, or just the first one.

        const targetOffice = allOffices[0];
        console.log(`Targeting Office: ${targetOffice.name} (ID: ${targetOffice.id})`);
        console.log(`Current IPs: ${JSON.stringify(targetOffice.allowedIPRanges)}`);

        // IPs to add: Localhost (IPv4/IPv6) and the specific Public IP
        const newIps = ['127.0.0.1/32', '::1/128', '106.215.138.170/32'];

        // Update
        await db
            .update(offices)
            .set({
                allowedIPRanges: newIps,
                updatedAt: new Date()
            })
            .where(eq(offices.id, targetOffice.id));

        console.log(`✅ Updated IP ranges for ${targetOffice.name} to:`, newIps);

        // Verify
        const [updatedOffice] = await db
            .select()
            .from(offices)
            .where(eq(offices.id, targetOffice.id))
            .limit(1);

        console.log('--- Verification ---');
        console.log(`ID: ${updatedOffice.id}`);
        console.log(`Name: ${updatedOffice.name}`);
        console.log(`Allowed IPs: ${JSON.stringify(updatedOffice.allowedIPRanges)}`);

    } catch (err) {
        console.error('❌ Error updating office IPs:', err);
    } finally {
        process.exit(0);
    }
}

manageOfficeIps();
