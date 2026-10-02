const crypto = require('crypto');

const SSO_COOKIE_NAME = 'enterprise_sso_token';
const LEGACY_COOKIE_NAME = 'ai_studio_session';
const SESSION_SECRET = process.env.SESSION_SECRET || 'ai-studio-super-secret-key-2026-secure-token';
const SSO_PORTAL_URL = process.env.SSO_PORTAL_URL || 'http://100.113.149.92:3000';

function fromBase64Url(str) {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
  return Buffer.from(padded, 'base64');
}

function toBase64Url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function createSessionToken(payload) {
  const exp = Date.now() + 7 * 24 * 60 * 60 * 1000; // 7 days expiration
  const data = { ...payload, exp };
  const jsonStr = JSON.stringify(data);
  const payloadB64 = toBase64Url(Buffer.from(jsonStr, 'utf-8'));

  const hmac = crypto.createHmac('sha256', SESSION_SECRET);
  hmac.update(payloadB64);
  const signatureB64 = toBase64Url(hmac.digest());

  return `${payloadB64}.${signatureB64}`;
}

function verifySessionToken(token) {
  try {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;

    const [payloadB64, signatureB64] = parts;
    if (!payloadB64 || !signatureB64) return null;

    const hmac = crypto.createHmac('sha256', SESSION_SECRET);
    hmac.update(payloadB64);
    const expectedSignatureB64 = toBase64Url(hmac.digest());

    if (!crypto.timingSafeEqual(Buffer.from(signatureB64), Buffer.from(expectedSignatureB64))) {
      return null;
    }

    const jsonStr = fromBase64Url(payloadB64).toString('utf-8');
    const payload = JSON.parse(jsonStr);

    if (!payload.userId || !payload.exp) return null;
    if (Date.now() > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
}

/**
 * Enterprise SSO Express Guard Middleware
 * Automatically validates cookies or redirects to Central SSO Portal at :3000.
 */
function ssoGuardMiddleware(req, res, next) {
  // Allow health check and login routes without authentication
  if (
    req.path === '/api/health' ||
    req.path === '/login' ||
    req.path === '/api/auth/login'
  ) {
    return next();
  }

  const token = req.cookies?.[SSO_COOKIE_NAME] || req.cookies?.[LEGACY_COOKIE_NAME] || req.headers.authorization?.replace('Bearer ', '');
  const user = token ? verifySessionToken(token) : null;

  if (user) {
    req.user = user;
    return next();
  }

  // Not authenticated
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({
      success: false,
      authenticated: false,
      error: 'Unauthorized. Harap login terlebih dahulu.',
      loginUrl: '/login'
    });
  }

  // Web page request: Redirect to local login page (/login)
  return res.redirect('/login');
}

module.exports = {
  SSO_COOKIE_NAME,
  LEGACY_COOKIE_NAME,
  createSessionToken,
  verifySessionToken,
  ssoGuardMiddleware
};
