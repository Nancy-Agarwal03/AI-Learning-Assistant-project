import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { memDb, isUsingPostgres, getPgPool } from './db';
import { User, UserPreferences } from './types';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_key_1234567890';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret_key_0987654321';

// Token generation
export function generateAccessToken(user: { id: string; email: string }): string {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_SECRET, { expiresIn: '15m' });
}

export function generateRefreshToken(user: { id: string; email: string }): string {
  return jwt.sign({ sub: user.id, email: user.email }, JWT_REFRESH_SECRET, { expiresIn: '7d' });
}

export function verifyRefreshToken(token: string): { sub: string; email: string } | null {
  try {
    return jwt.verify(token, JWT_REFRESH_SECRET) as { sub: string; email: string };
  } catch {
    return null;
  }
}

// Password hashing with Node crypto scrypt
export async function hashPassword(plain: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(plain, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  if (hashed.startsWith('scrypt:')) {
    const [, salt, originalHash] = hashed.split(':');
    const computed = crypto.scryptSync(plain, salt, 64).toString('hex');
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(originalHash));
  }
  return hashed === plain;
}

// User repository helpers
export async function findUserByEmail(email: string): Promise<User | null> {
  const normalized = email.trim().toLowerCase();
  if (isUsingPostgres()) {
    const pool = getPgPool();
    if (pool) {
      const res = await pool.query('SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1', [normalized]);
      if (res.rows.length > 0) {
        return res.rows[0];
      }
    }
  }

  for (const user of memDb.users.values()) {
    if (user.email.toLowerCase() === normalized) {
      return user;
    }
  }
  return null;
}

export async function findUserById(id: string): Promise<User | null> {
  if (isUsingPostgres()) {
    const pool = getPgPool();
    if (pool) {
      const res = await pool.query('SELECT * FROM users WHERE id = $1 LIMIT 1', [id]);
      if (res.rows.length > 0) {
        return res.rows[0];
      }
    }
  }
  return memDb.users.get(id) || null;
}

export async function createUser(data: {
  email: string;
  passwordHash: string;
  fullName: string;
  googleId?: string;
}): Promise<User> {
  const newUser: User = {
    id: `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    email: data.email.trim().toLowerCase(),
    password_hash: data.passwordHash,
    full_name: data.fullName,
    google_id: data.googleId,
    preferences: {
      allowFutureContent: false,
      animationsEnabled: true,
      companionVoice: 'patient',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  if (isUsingPostgres()) {
    const pool = getPgPool();
    if (pool) {
      await pool.query(
        `INSERT INTO users (id, email, password_hash, full_name, google_id, preferences, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          newUser.id,
          newUser.email,
          newUser.password_hash,
          newUser.full_name,
          newUser.google_id || null,
          JSON.stringify(newUser.preferences),
          newUser.created_at,
          newUser.updated_at,
        ]
      );
    }
  }

  memDb.users.set(newUser.id, newUser);
  return newUser;
}

export async function updateUserPreferences(userId: string, preferences: Partial<UserPreferences>): Promise<User | null> {
  const user = await findUserById(userId);
  if (!user) return null;

  const updatedPrefs: UserPreferences = {
    ...user.preferences,
    ...preferences,
  };

  user.preferences = updatedPrefs;
  user.updated_at = new Date().toISOString();

  if (isUsingPostgres()) {
    const pool = getPgPool();
    if (pool) {
      await pool.query('UPDATE users SET preferences = $1, updated_at = $2 WHERE id = $3', [
        JSON.stringify(updatedPrefs),
        user.updated_at,
        userId,
      ]);
    }
  }

  memDb.users.set(userId, user);
  return user;
}

// Password reset tokens map: token -> { email: string; expiresAt: number }
const resetTokens = new Map<string, { email: string; expiresAt: number }>();

export function createPasswordResetToken(email: string): string {
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = Date.now() + 60 * 60 * 1000; // 1 hour
  resetTokens.set(token, { email, expiresAt });
  return token;
}

export function verifyPasswordResetToken(token: string): string | null {
  const record = resetTokens.get(token);
  if (!record) return null;
  if (Date.now() > record.expiresAt) {
    resetTokens.delete(token);
    return null;
  }
  return record.email;
}

export function consumePasswordResetToken(token: string): void {
  resetTokens.delete(token);
}

// Express Auth Middleware
export interface AuthenticatedRequest extends Request {
  user?: User;
}

export async function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication token required.' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; email: string };
    const user = await findUserById(decoded.sub);
    if (!user) {
      res.status(401).json({ error: 'User no longer exists.' });
      return;
    }
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired access token.' });
  }
}

export async function optionalAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.split(' ')[1];
    try {
      const decoded = jwt.verify(token, JWT_SECRET) as { sub: string; email: string };
      const user = await findUserById(decoded.sub);
      if (user) {
        req.user = user;
      }
    } catch {
      // Ignored for optional auth
    }
  }
  next();
}
