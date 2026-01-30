import jwt from 'jsonwebtoken';

export const generateToken = (id, expiresIn = '15m') => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  return jwt.sign(
    { id, type: 'access' },
    process.env.JWT_SECRET,
    { expiresIn }
  );
};

export const verifyToken = (token) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    throw new Error('Invalid token');
  }
};

export const generateRefreshToken = (id, expiresIn = '7d') => {
  const secret = process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET or REFRESH_TOKEN_SECRET is not configured');
  }
  return jwt.sign(
    { id, type: 'refresh' },
    secret,
    { expiresIn }
  );
};

export const verifyRefreshToken = (token) => {
  const secret = process.env.REFRESH_TOKEN_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET or REFRESH_TOKEN_SECRET is not configured');
  }
  return jwt.verify(token, secret);
};
