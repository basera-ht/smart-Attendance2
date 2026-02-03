
import crypto from 'crypto';
import { getDB } from '../config/db.js';

const QR_SECRET = process.env.JWT_SECRET || 'qr_secret_key'; // Reuse JWT secret or separate
const VALIDITY_WINDOW_MS = 30 * 1000; // 30 seconds validity

/**
 * Generates a signed QR token for an office
 * @param {number} officeId 
 * @returns {string} Signed Token (Base64)
 */
export const generateQRToken = (officeId) => {
    const payload = JSON.stringify({
        oid: officeId,
        ts: Date.now(),
        nonce: Math.random().toString(36).substring(7)
    });

    const signature = crypto
        .createHmac('sha256', QR_SECRET)
        .update(payload)
        .digest('hex');

    // Return format: payload_base64.signature
    return Buffer.from(payload).toString('base64') + '.' + signature;
};

/**
 * Verifies a QR token
 * @param {string} token 
 * @returns {object|null} { officeId } if valid, null otherwise
 */
export const verifyQRToken = (token) => {
    try {
        if (!token || !token.includes('.')) return null;

        const [payloadB64, signature] = token.split('.');
        if (!payloadB64 || !signature) return null;

        const payloadStr = Buffer.from(payloadB64, 'base64').toString('utf-8');

        // 1. Verify Signature
        const expectedSignature = crypto
            .createHmac('sha256', QR_SECRET)
            .update(payloadStr)
            .digest('hex');

        if (signature !== expectedSignature) return null;

        // 2. Parse & Verify Timestamp
        const payload = JSON.parse(payloadStr);
        const now = Date.now();

        // Check if token is too old (replay protection)
        // Allow 2 windows (current and previous) + grace, say 60s total
        if (now - payload.ts > VALIDITY_WINDOW_MS * 2) {
            console.warn(`[QR] Expired token. Age: ${now - payload.ts}ms`);
            return null;
        }

        // Check if token is from the future (clock drift)
        if (payload.ts - now > 5000) {
            console.warn(`[QR] Future token. Drift: ${payload.ts - now}ms`);
            return null;
        }

        return { officeId: payload.oid };

    } catch (error) {
        console.error('QR Verification Error:', error.message);
        return null;
    }
};
