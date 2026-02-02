
import dotenv from 'dotenv';
import { connectDB, closeDB } from '../src/config/db.js';

dotenv.config();

const testConnection = async () => {
    console.log('Testing database connection...');
    try {
        await connectDB();
        console.log('✅ Connection successful!');
    } catch (error) {
        console.error('❌ Connection failed:', error.message);
    } finally {
        await closeDB();
    }
};

testConnection();
