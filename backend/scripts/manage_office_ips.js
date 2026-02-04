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

const command = process.argv[2];
const ipToAdd = process.argv[3];

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

        const targetOffice = allOffices[0];
        console.log(`Targeting First Office: ${targetOffice.name} (ID: ${targetOffice.id})`);

        let currentIps = targetOffice.allowedIPRanges || [];
        console.log(`Current Allowed IPs: ${JSON.stringify(currentIps)}`);

        if (command === 'add' && ipToAdd) {
            // Validate basic IP format (simplistic check)
            if (!ipToAdd.includes('.')) {
                console.log('❌ Invalid IP format. Please provide a valid IPv4 address (e.g., 1.2.3.4)');
                return;
            }

            // Append CIDR /32 if missing
            const cidrIp = ipToAdd.includes('/') ? ipToAdd : `${ipToAdd}/32`;

            if (!currentIps.includes(cidrIp)) {
                const newIps = [...currentIps, cidrIp];

                await db
                    .update(offices)
                    .set({
                        allowedIPRanges: newIps,
                        updatedAt: new Date()
                    })
                    .where(eq(offices.id, targetOffice.id));

                console.log(`✅ Added ${cidrIp}. New list:`, newIps);
            } else {
                console.log(`ℹ️ IP ${cidrIp} is already allowed.`);
            }
        } else if (command === 'list') {
            // Just listing (already done above)
        } else {
            console.log('\nUsage:');
            console.log('  node scripts/manage_office_ips.js list         -> View allowed IPs');
            console.log('  node scripts/manage_office_ips.js add <IP>     -> Add a new IP (e.g. 1.2.3.4)');
            console.log('\nRunning in default mode (Restoring default IPs + Localhost)...');

            // Default restoration behavior (Legacy support)
            const defaultIps = ['127.0.0.1/32', '::1/128', '106.215.138.170/32'];
            // Merge defaults with current to avoid losing custom ones if running default mode
            // But originally this script OVERWROTE everything. Let's make it safer: only add defaults if missing.
            let updated = false;
            let mergedIps = [...currentIps];

            for (const ip of defaultIps) {
                if (!mergedIps.includes(ip)) {
                    mergedIps.push(ip);
                    updated = true;
                }
            }

            if (updated) {
                await db
                    .update(offices)
                    .set({
                        allowedIPRanges: mergedIps,
                        updatedAt: new Date()
                    })
                    .where(eq(offices.id, targetOffice.id));
                console.log(`✅ restored/added default IPs:`, mergedIps);
            } else {
                console.log('✅ Default IPs are already present.');
            }
        }

    } catch (err) {
        console.error('❌ Error updating office IPs:', err);
    } finally {
        process.exit(0);
    }
}

manageOfficeIps();
