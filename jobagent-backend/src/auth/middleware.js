const { verifyToken } = require('@clerk/clerk-sdk-node');

const CLERK_SECRET_KEY = process.env.CLERK_SECRET_KEY;
let keyMissingWarningLogged = false;

async function requireAuth(req, res, next) {
  if (!CLERK_SECRET_KEY) {
    if (!keyMissingWarningLogged) {
      console.warn('[Auth] CLERK_SECRET_KEY is missing. Auth will fail for all requests.');
      keyMissingWarningLogged = true;
    }
    return res.status(401).json({ error: 'Unauthorized', message: 'Valid Clerk token required' });
  }

  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Valid Clerk token required' });
  }

  try {
    const payload = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
    req.userId = payload.sub;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized', message: 'Valid Clerk token required' });
  }
}

async function optionalAuth(req, res, next) {
  if (!CLERK_SECRET_KEY) {
    req.userId = null;
    return next();
  }

  const token = req.headers.authorization?.split(' ')[1];
  if (!token) {
    req.userId = null;
    return next();
  }

  try {
    const payload = await verifyToken(token, { secretKey: CLERK_SECRET_KEY });
    req.userId = payload.sub;
    next();
  } catch (err) {
    req.userId = null;
    next();
  }
}

module.exports = { requireAuth, optionalAuth };