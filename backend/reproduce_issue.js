
import { getDB, connectDB } from './src/config/db.js';
import { users } from './src/db/schema.js';
import { eq, desc } from 'drizzle-orm';
import dotenv from 'dotenv';
dotenv.config();

async function reproduce() {
    try {
        await connectDB();
        const db = getDB();

        // Exact query from employeeRoutes.js (simplified for one user)
        const employees = await db
            .select({
                id: users.id,
                name: users.name,
                email: users.email,
                registeredDeviceId: users.registeredDeviceId,
                deviceLastSeen: users.deviceLastSeen,
            })
            .from(users)
            .where(eq(users.email, 'parasbasera9@gmail.com')) // Targeting the user we know has data
            .limit(1);

        console.log('Query Result:', JSON.stringify(employees, null, 2));

        if (employees.length > 0 && employees[0].registeredDeviceId) {
            console.log('SUCCESS: registeredDeviceId is present.');
        } else {
            console.log('FAILURE: registeredDeviceId is missing.');
        }

    } catch (error) {
        console.error('Error:', error);
    }
    process.exit(0);
}

reproduce();
