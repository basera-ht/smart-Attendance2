
import dotenv from 'dotenv';
import { connectDB, closeDB } from '../src/config/db.js';
import { users } from '../src/db/schema.js';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';

dotenv.config();

const testRegister = async () => {
    console.log('Testing User Registration...');
    try {
        const db = await connectDB();
        const testEmail = 'test_register_script@example.com';

        // Cleanup previous test
        await db.delete(users).where(eq(users.email, testEmail));

        const password = 'password123';
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);
        const employeeId = `EMP${Date.now().toString().slice(-6)}`;

        const [user] = await db.insert(users).values({
            name: 'Test Registry User',
            email: testEmail,
            password: hashedPassword,
            role: 'employee',
            employeeId,
            isActive: true,
        }).returning();

        console.log('✅ User registered successfully:', user.email);

        // Verification Cleanup
        await db.delete(users).where(eq(users.email, testEmail));
        console.log('✅ Test user cleaned up.');

    } catch (error) {
        console.error('❌ Registration failed:', error);
    } finally {
        await closeDB();
    }
};

testRegister();
