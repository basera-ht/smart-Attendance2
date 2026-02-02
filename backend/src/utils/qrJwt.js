import crypto from 'crypto';
import jwt from 'jsonwebtoken';

const getEnvKey = (value) => {
  if (!value) return null;
  return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
};

export const getQrKeyId = () => process.env.QR_KEY_ID || 'default';

export const getQrPrivateKey = () => getEnvKey(process.env.QR_PRIVATE_KEY);

export const getQrPublicKey = () => getEnvKey(process.env.QR_PUBLIC_KEY);

export const hashList = (items) => {
  const normalized = Array.isArray(items)
    ? items.map((item) => String(item).trim()).filter(Boolean).sort()
    : [];
  const payload = JSON.stringify(normalized);
  return crypto.createHash('sha256').update(payload).digest('hex');
};

export const signQrToken = ({ qrId, officeId, allowedSSIDs, allowedIPRanges, expiresAt }) => {
  const privateKey = getQrPrivateKey();
  if (!privateKey) {
    throw new Error('QR_PRIVATE_KEY is not configured');
  }

  const payload = {
    qrId,
    officeId,
    exp: Math.floor(new Date(expiresAt).getTime() / 1000)
  };

  return jwt.sign(payload, privateKey, {
    algorithm: 'RS256',
    keyid: getQrKeyId()
  });
};

export const verifyQrToken = (token) => {
  const publicKey = getQrPublicKey();
  if (!publicKey) {
    throw new Error('QR_PUBLIC_KEY is not configured');
  }

  return jwt.verify(token, publicKey, { algorithms: ['RS256'] });
};
