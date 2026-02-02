import { getDB } from './src/config/db.js';
import { offices, geofences } from './src/db/schema.js';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(process.cwd(), '.env') });

async function inspect() {
    const db = getDB();
    console.log('--- Inspecting Offices ---');
    const officeList = await db.select().from(offices).limit(2);
    console.log(JSON.stringify(officeList, null, 2));

    console.log('\n--- Inspecting Geofences ---');
    const geofenceList = await db.select().from(geofences).limit(2);
    console.log(JSON.stringify(geofenceList, null, 2));

    process.exit(0);
}

inspect();
