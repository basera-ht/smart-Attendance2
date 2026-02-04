const API_URL = 'http://localhost:5000/api/auth';

async function verify() {
    console.log('--- Verifying Admin Check Endpoint ---');
    try {
        const response = await fetch(`${API_URL}/admin-check`);
        const data = await response.json();

        console.log('Status:', response.status);
        console.log('Data:', JSON.stringify(data, null, 2));

        if (data.exists === true) {
            console.log('✅ SUCCESS: Endpoint reports admin exists.');
        } else {
            console.log('❌ FAIL: Endpoint reports admin does NOT exist (expected true).');
        }
    } catch (error) {
        console.log('Error:', error.message);
    }
}

verify();
