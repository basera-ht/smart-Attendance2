
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

        const response = await fetch('https://smartattendance2.vercel.app/api/auth/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const data = await response.json();
            console.log('✅ Registration Successful!');
            console.log('Data:', JSON.stringify(data, null, 2));
        } else {
            console.error('❌ Registration Failed');
            console.error('Status:', response.status);
            try {
                const errorData = await response.json();
                console.error('Data:', errorData);
            } catch (e) {
                console.error('Could not parse error response');
            }
        }
    } catch (error) {
        console.error('Error:', error.message);
    }
}

testRegister();
