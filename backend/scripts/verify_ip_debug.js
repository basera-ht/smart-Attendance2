const API_URL = 'http://localhost:5000/api/debug/ip';

async function verify() {
    console.log('--- Verifying IP Debug Endpoint ---');
    try {
        const response = await fetch(API_URL);
        const data = await response.json();

        console.log('Status:', response.status);
        console.log('Data:', JSON.stringify(data, null, 2));

        if (data.ip) {
            console.log('✅ SUCCESS: Endpoint returns IP information.');
        } else {
            console.log('❌ FAIL: Endpoint response missing IP.');
        }
    } catch (error) {
        console.log('Error:', error.message);
    }
}

verify();
