import { eq } from 'drizzle-orm';
import { getDB } from '../config/db.js';
import { users } from '../db/schema.js';

/**
 * Verify if the device ID matches the registered device for the user.
 * If user has no registered device, bind this device to the user.
 * 
 * @param {number} userId - The ID of the user
 * @param {string} deviceId - The device ID from the request
 * @returns {Promise<boolean>} - Returns true if valid/bound, throws error if invalid
 */
export const verifyDevice = async (userId, deviceId) => {
    if (!deviceId) {
        throw new Error('Device ID is required');
    }

    const db = getDB();
    const [user] = await db
        .select({
            registeredDeviceId: users.registeredDeviceId
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

    if (!user) {
        throw new Error('User not found');
    }

    // 1. If no device is registered, bind this one (First time use)
    if (!user.registeredDeviceId) {
        await db
            .update(users)
            .set({
                registeredDeviceId: deviceId,
                deviceLastSeen: new Date()
            })
            .where(eq(users.id, userId));
        return true;
    }

    // 2. If device is registered, check for match
    if (user.registeredDeviceId !== deviceId) {
        // SECURITY ALERT: Device mismatch
        throw new Error('Unauthorized Device: You can only check in from your registered device.');
    }

    // 3. If match, update last seen
    await db
        .update(users)
        .set({
            deviceLastSeen: new Date()
        })
        .where(eq(users.id, userId));

    return true;
};
