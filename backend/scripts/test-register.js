
import axios from 'axios';

async function testRegister() {
    try {
        const timestamp = Date.now();
        const payload = {
            name: `Test User ${timestamp}`,
            email: `test${timestamp}@example.com`,
            password: 'password123',
            role: 'employee'
        };

        console.log('Testing registration with:', payload.email);

        const response = await axios.post('http://localhost:5000/api/auth/register', payload);

        console.log('✅ Registration Successful!');
        console.log('Status:', response.status);
        console.log('Data:', JSON.stringify(response.data, null, 2));
    } catch (error) {
        console.error('❌ Registration Failed');
        if (error.response) {
            console.error('Status:', error.response.status);
            console.error('Data:', error.response.data);
        } else {
            console.error('Error:', error.message);
        }
    }
}

testRegister();
