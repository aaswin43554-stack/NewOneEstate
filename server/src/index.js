require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

// Render's infrastructure doesn't support IPv6 outbound — force IPv4 DNS resolution
// so Supabase hostnames resolve to their IPv4 address instead of the IPv6 one.
const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

// Prevent ANY unhandled error from crashing the server
process.on('unhandledRejection', (reason) => {
  console.error('[server][CRASH_001] unhandledRejection:', reason?.message || reason);
  if (reason?.stack) console.error(reason.stack);
});
process.on('uncaughtException', (err) => {
  console.error('[server][CRASH_002] uncaughtException:', err.message);
  console.error(err.stack);
});

const http        = require('http');
const express     = require('express');
const cors        = require('cors');
const path        = require('path');
const compression = require('compression');
const helmet      = require('helmet');
const rateLimit   = require('express-rate-limit');

const migrate = require('./scripts/migrate');
const seed    = require('./scripts/seed');

const { requireAuth } = require('./middleware/auth');
const pool = require('./config/db');

const publicRoutes        = require('./routes/public');
const authRoutes          = require('./routes/auth');
const lotsRoutes          = require('./routes/lots');
const roastSessionRoutes  = require('./routes/roastSessions');
const allocationRoutes    = require('./routes/allocations');
const profileRoutes       = require('./routes/profiles');
const cuppingRoutes       = require('./routes/cupping');
const labelRoutes         = require('./routes/labels');
const contactRoutes       = require('./routes/contacts');
const journalRoutes       = require('./routes/journal');
const exportRoutes        = require('./routes/export');
const aiRoutes            = require('./routes/ai');
const { setupRoastWebSocket } = require('./services/roastHardware');

const app  = express();
const PORT = process.env.PORT || 3001;

// Render sits directly in front of this app as a single reverse-proxy hop.
// Without this, req.ip resolves to Render's proxy address for every request,
// so the rate limiters below key off one shared "IP" for the whole user base
// (one user's failed logins could lock out everyone) and the request logger's
// [ip] field is useless for tracing abuse back to a real client.
app.set('trust proxy', 1);

// Security headers. CSP is scoped to what this SPA actually loads: same-origin
// script/API/WS traffic, Google Fonts stylesheets, and data: URIs for the
// base64 QR code images rendered on labels/journal pages. 'unsafe-inline' on
// style-src is required because the UI uses React inline `style={{}}` props
// extensively — without it every inline-styled element would be stripped.
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      frameAncestors: ["'self'"],
    },
  },
}));

// Gzip all responses — biggest win on JSON-heavy API responses
app.use(compression());

// Serve static assets BEFORE CORS. Vite adds crossorigin="" to <link> and
// <script> tags, which causes the browser to send an Origin header even for
// same-origin asset requests. If those requests reach the CORS middleware first
// and the CLIENT_URL env var isn't set to the production URL, CORS blocks them
// with a 500 JSON error — producing the blank screen / wrong-MIME-type error.
// Serving assets here bypasses CORS entirely (they're same-origin by definition).
const clientDistPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDistPath, {
  setHeaders: (res, filePath) => {
    if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// Explicit CORS origin — never use `true` with credentials:true.
// In production on Render, Express serves both API and frontend from the same
// host, so the browser sends Origin: https://newoneestate.onrender.com for
// every API call. We must allow it explicitly or every login/API call fails.
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : [
      process.env.CLIENT_URL || 'http://localhost:5173',
      // Always allow same-host requests — the production URL where Express
      // serves both the API and the built frontend from the same origin.
      ...(process.env.RENDER_EXTERNAL_URL ? [process.env.RENDER_EXTERNAL_URL] : []),
    ];
app.use(cors({
  origin: (origin, cb) => {
    // No origin = same-origin navigation or curl — allow
    if (!origin) return cb(null, true);
    // Explicitly listed origin — allow
    if (allowedOrigins.includes(origin)) return cb(null, true);
    // Any request where the origin matches our own host — allow
    // (covers cases where RENDER_EXTERNAL_URL is not set but the app is
    //  accessed from the same Render URL it is served on)
    const hostMatch = origin.replace(/^https?:\/\//, '') ===
      (process.env.RENDER_EXTERNAL_URL || '').replace(/^https?:\/\//, '');
    if (hostMatch) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));

// Brute-force protection on auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/auth/login',    authLimiter);
app.use('/api/auth/register', authLimiter);

// Cost/abuse protection — every /api/ai call hits the paid Anthropic API,
// so cap per-client request rate to prevent runaway spend or DoS.
const aiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many AI requests, please slow down.' },
});
app.use('/api/ai', aiLimiter);

// Public (unauthenticated) journal/allocation lookups — no JWT required, so
// nothing else caps request volume on these DB-backed endpoints. Without a
// limiter here they're the cheapest path for a scraper or DoS attempt to
// hammer the database from a single IP.
const publicLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/public', publicLimiter);

// General API rate limit — a coarse ceiling on every authenticated route so a
// leaked/compromised token or a buggy client can't hammer the DB unbounded.
// Generous enough to never trip during normal UI use.
const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please slow down.' },
});
app.use('/api', apiLimiter);

// Request logger — logs every incoming request and its response status/time
app.use((req, res, next) => {
  const start = Date.now();
  const { method, path: reqPath, ip } = req;
  res.on('finish', () => {
    const ms    = Date.now() - start;
    const uid   = req.user?.id || '-';
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'log';
    console[level](`[HTTP] ${method} ${reqPath} -> ${res.statusCode} (${ms}ms) [${ip}] uid=${uid}`);
  });
  next();
});

// Health check — always responds, no DB required
app.get('/api/health', (_req, res) => {
  console.log('[HEALTH] Health check requested');
  return res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/public',           publicRoutes);
app.use('/api/auth',             authRoutes);
app.use('/api/lots',             lotsRoutes);
app.use('/api/roast-sessions',   roastSessionRoutes);
app.use('/api/allocations',      allocationRoutes);
app.use('/api/profiles',         profileRoutes);
app.use('/api/cupping-sessions', cuppingRoutes);
app.use('/api/labels',           labelRoutes);
app.use('/api/contacts',         contactRoutes);
app.use('/api/journal',          journalRoutes);
app.use('/api/export',           exportRoutes);
app.use('/api/ai',               aiRoutes);

// Dashboard Stats Endpoint
app.get('/api/dashboard-stats', requireAuth, async (req, res) => {
  const tenant_id = req.user.tenant_id;
  console.log(`[DASHBOARD] Fetching stats for tenant ${tenant_id}`);
  try {
    const [
      { rows: [{ total_stock }] },
      { rows: [{ active_allocs }] },
      { rows: [{ total_contacts }] },
      { rows: [{ total_roasts }] },
      { rows: [{ requested_bags }] },
      { rows: activeAllocsList },
      { rows: [{ quality_alert_lots }] },
      { rows: closingSoonList },
      { rows: staleRoastsList },
      { rows: activityRows },
    ] = await Promise.all([
      pool.query("SELECT COALESCE(SUM(current_weight_g), 0)::bigint AS total_stock FROM oec_lots WHERE tenant_id = $1 AND deleted_at IS NULL", [tenant_id]),
      pool.query("SELECT COUNT(*)::int AS active_allocs FROM oec_allocations WHERE tenant_id = $1 AND state != 'allocation_closed' AND deleted_at IS NULL", [tenant_id]),
      pool.query("SELECT COUNT(*)::int AS total_contacts FROM oec_contacts WHERE tenant_id = $1 AND deleted_at IS NULL", [tenant_id]),
      pool.query("SELECT COUNT(*)::int AS total_roasts FROM oec_roast_sessions WHERE tenant_id = $1 AND deleted_at IS NULL", [tenant_id]),
      pool.query(`SELECT COALESCE(SUM(r.quantity_bags), 0)::int AS requested_bags FROM oec_allocation_requests r JOIN oec_allocations a ON a.id = r.allocation_id WHERE r.tenant_id = $1 AND r.status != 'fulfilled' AND a.state != 'allocation_closed' AND a.deleted_at IS NULL`, [tenant_id]),
      pool.query("SELECT id, allocation_code, state, process FROM oec_allocations WHERE tenant_id = $1 AND state = 'open_for_requests' AND deleted_at IS NULL LIMIT 1", [tenant_id]),
      pool.query("SELECT COUNT(*)::int AS quality_alert_lots FROM oec_lots WHERE tenant_id = $1 AND deleted_at IS NULL AND current_weight_g > 0 AND arrival_date < NOW() - INTERVAL '365 days'", [tenant_id]),
      // Allocation windows closing within 3 days that are still open for requests
      pool.query(
        `SELECT id, allocation_code, window_close_date
         FROM oec_allocations
         WHERE tenant_id = $1 AND deleted_at IS NULL AND state = 'open_for_requests'
           AND window_close_date IS NOT NULL
           AND window_close_date <= (NOW() + INTERVAL '3 days')
         ORDER BY window_close_date ASC LIMIT 5`,
        [tenant_id]
      ),
      // Roast sessions stuck in_progress for more than 4 hours — likely abandoned/forgotten
      pool.query(
        `SELECT id, batch_code, started_at
         FROM oec_roast_sessions
         WHERE tenant_id = $1 AND deleted_at IS NULL AND status = 'in_progress'
           AND started_at < NOW() - INTERVAL '4 hours'
         ORDER BY started_at ASC LIMIT 5`,
        [tenant_id]
      ),
      pool.query(`
        SELECT * FROM (
          SELECT 'inventory' AS type,
                 'Lot ' || lot_code || ' added to inventory (' || process || ')' AS description,
                 created_at AS ts
          FROM oec_lots WHERE tenant_id = $1 AND deleted_at IS NULL
          UNION ALL
          SELECT 'inventory',
                 'Lot ' || lot_code || ' details updated',
                 updated_at
          FROM oec_lots WHERE tenant_id = $1 AND deleted_at IS NULL
            AND updated_at > created_at + INTERVAL '2 seconds'
          UNION ALL
          SELECT 'inventory',
                 initcap(replace(lm.movement_type::text, '_', ' ')) || ' recorded on ' || l.lot_code ||
                   CASE WHEN lm.reason IS NOT NULL AND lm.reason != '' THEN ' — ' || lm.reason ELSE '' END,
                 lm.created_at
          FROM oec_lot_movements lm
          JOIN oec_lots l ON l.id = lm.lot_id
          WHERE lm.tenant_id = $1
          UNION ALL
          SELECT 'roast',
                 'Roast session ' || batch_code || ' logged',
                 created_at
          FROM oec_roast_sessions WHERE tenant_id = $1 AND deleted_at IS NULL
          UNION ALL
          SELECT 'allocation',
                 'Allocation ' || allocation_code || ' created',
                 created_at
          FROM oec_allocations WHERE tenant_id = $1 AND deleted_at IS NULL
          UNION ALL
          SELECT 'allocation',
                 'Allocation ' || allocation_code || ' moved to ' || state,
                 updated_at
          FROM oec_allocations WHERE tenant_id = $1 AND deleted_at IS NULL
            AND updated_at > created_at + INTERVAL '2 seconds'
          UNION ALL
          SELECT 'contact',
                 'Contact ' || name || ' added',
                 created_at
          FROM oec_contacts WHERE tenant_id = $1 AND deleted_at IS NULL
          UNION ALL
          SELECT 'cupping',
                 'Cupping session logged',
                 created_at
          FROM oec_cupping_sessions WHERE tenant_id = $1 AND deleted_at IS NULL
        ) events
        ORDER BY ts DESC
        LIMIT 10
      `, [tenant_id]),
    ]);

    console.log(`[DASHBOARD] OK — tenant ${tenant_id} | stock: ${total_stock}g | allocs: ${active_allocs} | contacts: ${total_contacts} | roasts: ${total_roasts}`);
    return res.json({
      totalGreenStockG: parseInt(total_stock),
      activeAllocationsCount: active_allocs,
      totalContactsCount: total_contacts,
      totalRoastsCount: total_roasts,
      totalBagsRequested: requested_bags,
      activeAllocation: activeAllocsList[0] || null,
      qualityAlertLotsCount: quality_alert_lots,
      allocationsClosingSoon: closingSoonList,
      staleRoasts: staleRoastsList,
      recentActivity: activityRows.map(r => ({ type: r.type, description: r.description, timestamp: r.ts })),
    });
  } catch (err) {
    // DASH_001: DB error fetching one or more dashboard stat queries
    console.error(`[DASHBOARD][DASH_001] Stats query failed for tenant ${tenant_id} | pg code: ${err.code || 'N/A'} | ${err.message}`);
    console.error(err.stack);
    return res.status(500).json({ error: 'Failed to fetch dashboard stats.', code: 'DASH_001' });
  }
});

// Global search — searches lots, roast sessions, allocations, contacts
app.get('/api/search', requireAuth, async (req, res) => {
  const { q } = req.query;
  if (!q || q.trim().length < 2) return res.json({ results: [] });
  const tenant_id = req.user.tenant_id;
  const term = `%${q.trim()}%`;
  try {
    const [{ rows: lots }, { rows: roasts }, { rows: allocs }, { rows: contacts }] = await Promise.all([
      pool.query(
        `SELECT id, lot_code AS label, estate AS sub, 'lot' AS type
         FROM oec_lots WHERE tenant_id = $1 AND deleted_at IS NULL
           AND (lot_code ILIKE $2 OR estate ILIKE $2)
         LIMIT 5`,
        [tenant_id, term]
      ),
      pool.query(
        `SELECT id, batch_code AS label, status AS sub, 'roast' AS type
         FROM oec_roast_sessions WHERE tenant_id = $1 AND deleted_at IS NULL
           AND batch_code ILIKE $2
         LIMIT 5`,
        [tenant_id, term]
      ),
      pool.query(
        `SELECT id, allocation_code AS label, state AS sub, 'allocation' AS type
         FROM oec_allocations WHERE tenant_id = $1 AND deleted_at IS NULL
           AND allocation_code ILIKE $2
         LIMIT 5`,
        [tenant_id, term]
      ),
      pool.query(
        `SELECT id, name AS label, market_segment AS sub, 'contact' AS type
         FROM oec_contacts WHERE tenant_id = $1 AND deleted_at IS NULL
           AND name ILIKE $2
         LIMIT 5`,
        [tenant_id, term]
      ),
    ]);
    return res.json({ results: [...lots, ...roasts, ...allocs, ...contacts] });
  } catch (err) {
    console.error('[search]', err.message);
    return res.status(500).json({ error: 'Search failed.' });
  }
});

// Flat endpoint for all allocation requests (used by contact-linking modal)
app.get('/api/allocation-requests', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ar.id, ar.contact_name, ar.channel, ar.quantity_bags, ar.status,
              ar.created_at, a.allocation_code, a.process
       FROM oec_allocation_requests ar
       JOIN oec_allocations a ON a.id = ar.allocation_id AND a.tenant_id = $1
       WHERE ar.tenant_id = $1
       ORDER BY ar.created_at DESC`,
      [req.user.tenant_id]
    );
    return res.json({ requests: rows });
  } catch (err) {
    console.error('List all allocation requests:', err);
    return res.status(500).json({ error: 'Failed to fetch requests.' });
  }
});

// Serve built frontend in production
// SPA fallback — serve index.html for client-side routes ONLY. A request for a
// missing /assets/* or /api/* path must fall through to a real 404 and never
// receive index.html; otherwise the browser gets HTML where it expects JS/CSS/
// JSON, which is the "MIME type not supported / unexpected 500" blank screen.
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/') || req.path.startsWith('/assets/')) return next();
  res.sendFile(path.join(clientDistPath, 'index.html'), (err) => {
    if (err) next(err);
  });
});

// 404 for anything that fell through (missing asset, unknown API route)
app.use((req, res) => res.status(404).json({ error: 'Not found', code: 'NOT_FOUND' }));

// Global error handler — registered LAST so it also catches errors thrown by
// the routes and the static / SPA-fallback layer above it.
app.use((err, req, res, _next) => {
  // SRV_001: Unhandled error that bubbled up through Express (next(err) call)
  console.error(`[server][SRV_001] Unhandled Express error on ${req.method} ${req.path}`);
  console.error(`[server][SRV_001] ${err.name || 'Error'}: ${err.message}`);
  if (err.stack) console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', code: 'SRV_001' });
});

const server = http.createServer(app);
setupRoastWebSocket(server);

server.listen(PORT, async () => {
  console.log(`[server] ========== SERVER STARTED ==========`);
  console.log(`[server] Port         : ${PORT}`);
  console.log(`[server] NODE_ENV     : ${process.env.NODE_ENV || 'development'}`);
  console.log(`[server] DATABASE_URL : ${process.env.DATABASE_URL ? 'SET ✓' : 'NOT SET ✗'}`);
  console.log(`[server] JWT_SECRET   : ${process.env.JWT_SECRET ? 'SET ✓' : 'NOT SET ✗'}`);
  console.log(`[server] JWT_EXPIRES  : ${process.env.JWT_ACCESS_EXPIRES || '15m (default)'}`);
  console.log(`[server] ========================================`);

  if (!process.env.DATABASE_URL) {
    console.error('[server][SRV_ENV_001] DATABASE_URL missing — all DB operations will fail');
  }
  if (!process.env.JWT_SECRET) {
    console.error('[server][SRV_ENV_002] JWT_SECRET missing — auth will fail');
  }

  try {
    console.log('[server] Running migrations...');
    await migrate();
    console.log('[server] Migrations complete');
    console.log('[server] Running seed...');
    await seed();
    console.log('[server] Seed complete');
  } catch (err) {
    console.error(`[server][SRV_STARTUP_001] Startup migrate/seed failed | ${err.message}`);
    console.error(err.stack);
  }
});

