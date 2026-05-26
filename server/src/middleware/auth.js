const jwt = require('jsonwebtoken');

function requireAuth(req, res, next) {
  const header = req.headers.authorization;

  if (!header) {
    // AUTH_001a: Authorization header missing entirely
    console.warn(`[AUTH][AUTH_001a] ${req.method} ${req.path} — Authorization header missing`);
    return res.status(401).json({ error: 'No token provided', code: 'AUTH_001a' });
  }

  if (!header.startsWith('Bearer ')) {
    // AUTH_001b: Header present but not Bearer scheme
    console.warn(`[AUTH][AUTH_001b] ${req.method} ${req.path} — Authorization header not Bearer scheme (got: "${header.split(' ')[0]}")`);
    return res.status(401).json({ error: 'No token provided', code: 'AUTH_001b' });
  }

  const token = header.split(' ')[1];

  if (!token || token.length < 10) {
    // AUTH_001c: Bearer prefix present but token value is empty/too short
    console.warn(`[AUTH][AUTH_001c] ${req.method} ${req.path} — Bearer token is empty or malformed`);
    return res.status(401).json({ error: 'Malformed token', code: 'AUTH_001c' });
  }

  if (!process.env.JWT_SECRET) {
    // AUTH_006: Server misconfiguration — JWT_SECRET not set
    console.error(`[AUTH][AUTH_006] JWT_SECRET is not set — cannot verify tokens`);
    return res.status(500).json({ error: 'Server auth configuration error', code: 'AUTH_006' });
  }

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    console.log(`[AUTH] OK — user ${req.user.id} (${req.user.email}) role=${req.user.role} -> ${req.method} ${req.path}`);
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      // AUTH_003: Valid JWT that has passed its expiry time
      console.warn(`[AUTH][AUTH_003] Token expired for ${req.method} ${req.path} | expired at: ${err.expiredAt}`);
      return res.status(401).json({ error: 'Token expired', code: 'AUTH_003' });
    }
    if (err.name === 'JsonWebTokenError') {
      // AUTH_002: Token is syntactically invalid or has wrong signature
      console.warn(`[AUTH][AUTH_002] Invalid JWT for ${req.method} ${req.path} | reason: ${err.message}`);
      return res.status(401).json({ error: 'Invalid token', code: 'AUTH_002' });
    }
    if (err.name === 'NotBeforeError') {
      // AUTH_004: Token not yet active (nbf claim in future)
      console.warn(`[AUTH][AUTH_004] Token not-yet-active for ${req.method} ${req.path} | date: ${err.date}`);
      return res.status(401).json({ error: 'Token not yet active', code: 'AUTH_004' });
    }
    // AUTH_005: Unexpected JWT error
    console.error(`[AUTH][AUTH_005] Unexpected JWT error for ${req.method} ${req.path} | ${err.name}: ${err.message}`);
    return res.status(401).json({ error: 'Token verification failed', code: 'AUTH_005' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      // ROLE_001: requireRole called without requireAuth running first
      console.error(`[AUTH][ROLE_001] requireRole called but req.user is not set — middleware order issue on ${req.method} ${req.path}`);
      return res.status(401).json({ error: 'Not authenticated', code: 'ROLE_001' });
    }
    if (!roles.includes(req.user.role)) {
      // ROLE_002: Authenticated user lacks required role
      console.warn(`[AUTH][ROLE_002] Access denied — user ${req.user.id} (${req.user.email}) has role "${req.user.role}", required one of [${roles.join(', ')}] for ${req.method} ${req.path}`);
      return res.status(403).json({ error: 'Insufficient permissions', code: 'ROLE_002' });
    }
    console.log(`[AUTH] Role OK — user ${req.user.id} role=${req.user.role} -> ${req.method} ${req.path}`);
    next();
  };
}

module.exports = { requireAuth, requireRole };
