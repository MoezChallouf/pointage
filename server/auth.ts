import crypto from 'crypto';

// ---------------------------------------------------------------------------
// Authentification administrateur sans état (stateless) : JWT HS256 signé
// avec JWT_SECRET. Compatible avec un déploiement serverless (Vercel) où
// plusieurs instances traitent les requêtes (pas de session en mémoire).
// ---------------------------------------------------------------------------

export interface AdminSession {
  adminId: string;
  email: string;
  name: string;
}

function getSecret(): string {
  return process.env.JWT_SECRET || 'pointagerh-dev-secret-change-me';
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export function signToken(session: AdminSession, ttlSeconds = 24 * 3600): string {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    ...session,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };

  const data = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = crypto.createHmac('sha256', getSecret()).update(data).digest('base64url');
  return `${data}.${signature}`;
}

export function verifyToken(token: string): (AdminSession & { exp?: number }) | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [header, payload, signature] = parts;
  const expected = crypto.createHmac('sha256', getSecret()).update(`${header}.${payload}`).digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (decoded.exp && decoded.exp * 1000 < Date.now()) return null;
    return decoded;
  } catch {
    return null;
  }
}
