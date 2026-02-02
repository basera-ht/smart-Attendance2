import crypto from 'crypto';
import QRCode from 'qrcode';

/**
 * Generate a secure QR code payload
 * @param {Object} params - QR generation parameters
 * @param {string} params.qrId - Unique QR identifier (UUID)
 * @param {number} params.expiresAt - Expiration timestamp
 * @param {string} params.nonce - Random nonce for replay prevention
 * @param {string[]} params.allowedSSIDs - Allowed Wi-Fi SSIDs
 * @param {string[]} params.allowedIPRanges - Allowed IP CIDR ranges
 * @returns {string} Base64-encoded JSON payload
 */
export const generateQRPayload = ({ qrId, expiresAt, nonce, allowedSSIDs, allowedIPRanges }) => {
  const payload = {
    qrId,
    expiresAt,
    officeNetwork: {
      allowedSSIDs: allowedSSIDs || [],
      allowedIPRanges: allowedIPRanges || []
    },
    nonce
  };

  // Encode as base64 JSON
  const jsonString = JSON.stringify(payload);
  return Buffer.from(jsonString).toString('base64');
};

/**
 * Decode QR payload from base64
 * @param {string} encodedPayload - Base64-encoded payload
 * @returns {Object} Decoded payload object
 */
export const decodeQRPayload = (encodedPayload) => {
  try {
    const jsonString = Buffer.from(encodedPayload, 'base64').toString('utf-8');
    return JSON.parse(jsonString);
  } catch (error) {
    throw new Error('Invalid QR payload format');
  }
};

/**
 * Generate QR code as data URL (SVG)
 * @param {string} payload - Base64-encoded payload
 * @returns {Promise<string>} Data URL of QR code
 */
export const generateQRCodeImage = async (payload) => {
  try {
    const dataUrl = await QRCode.toDataURL(payload, {
      errorCorrectionLevel: 'L', // Keep 'L'. This creates the least dense/simplest grid.
      type: 'image/png',
      margin: 1,                 // Reduced from 2 to 1 for a tighter, cleaner look.
      width: 500,                // Increased to 500 for better resolution on high-density screens.
      color: {
        dark: '#000000',         // Changed to Black for maximum contrast compliance.
        light: '#FFFFFF'
      }
    });
    return dataUrl;
  } catch (error) {
    throw new Error(`Failed to generate QR code: ${error.message}`);
  }
};

/**
 * Generate a secure random nonce
 * @param {number} length - Nonce length in bytes (default: 32)
 * @returns {string} Hex-encoded nonce
 */
export const generateNonce = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

/**
 * Generate a unique QR ID (UUID v4)
 * @returns {string} UUID
 */
export const generateQRId = () => {
  return crypto.randomUUID();
};
