import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config/env';

export function generateMagicToken(): string {
  return crypto.randomBytes(32).toString('hex');
}

export interface JWTPayload {
  sub: string;
  email: string;
  role: string;
  jti: string;
  iat?: number;
  exp?: number;
}

export function createJWT(
  userId: string,
  email: string,
  role: string,
): { token: string; jti: string } {
  const jti = uuidv4();
  const payload: Omit<JWTPayload, 'iat' | 'exp'> = { sub: userId, email, role, jti };
  const token = jwt.sign(payload, config.jwtSecret, {
    expiresIn: config.jwtExpiry as jwt.SignOptions['expiresIn'],
  });
  return { token, jti };
}

export function verifyJWT(token: string): JWTPayload {
  const decoded = jwt.verify(token, config.jwtSecret);
  return decoded as JWTPayload;
}
