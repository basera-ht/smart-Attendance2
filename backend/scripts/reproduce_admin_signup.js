import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

const API_URL = 'http://localhost:5000/api/auth';

async function reproduce() {
    console.log('--- Admin Signup Reproduction Script ---');

    const timestamp = Date.now();
    const email = `test_admin_${timestamp}@example.com`;
    const password = 'password123';

    console.log(`Attempting to register user: ${email} with role: 'admin'`);

    try {
        const response = await fetch(`${API_URL}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: 'Test Admin Applicant',
                email,
                password,
                role: 'admin',
                department: 'Testing',
                position: 'Tester'
            })
        });

        const data = await response.json();

        console.log('Registration Response Status:', response.status);
        console.log('Registration Response Data:', JSON.stringify(data, null, 2));

        if (data.success && data.data && data.data.user) {
            console.log('User Role in Response:', data.data.user.role);
            if (data.data.user.role === 'admin') {
                console.log('❌ FAIL: User was created as ADMIN.');
            } else if (data.data.user.role === 'employee') {
                console.log('✅ SUCCESS: User was downgraded to EMPLOYEE.');
            } else {
                console.log('❓ UNKNOWN: User created with role:', data.data.user.role);
            }
        } else {
            console.log('Request Failed:', data.message);
        }

    } catch (error) {
        console.log('Error:', error.message);
    }
}

reproduce();
