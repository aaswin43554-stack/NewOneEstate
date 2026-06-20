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

// Security headers
app.use(helmet({ contentSecurityPolicy: false }));

// Gzip all responses — biggest win on JSON-heavy API responses
app.use(compression());

// Explicit CORS origin — never use `true` with credentials:true
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : [process.env.CLIENT_URL || 'http://localhost:5173'];
app.use(cors({
  origin: (origin, cb) => {
    // Same-origin requests (Render prod) have no Origin header — allow them
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
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
  return res.json({ status: 'ok', timestamp: new Date().toISOString(), db: !!process.env.DATABASE_URL });
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
      { rows: activityRows },
    ] = await Promise.all([
      pool.query("SELECT COALESCE(SUM(current_weight_g), 0)::bigint AS total_stock FROM oec_lots WHERE tenant_id = $1 AND deleted_at IS NULL", [tenant_id]),
      pool.query("SELECT COUNT(*)::int AS active_allocs FROM oec_allocations WHERE tenant_id = $1 AND state != 'allocation_closed' AND deleted_at IS NULL", [tenant_id]),
      pool.query("SELECT COUNT(*)::int AS total_contacts FROM oec_contacts WHERE tenant_id = $1 AND deleted_at IS NULL", [tenant_id]),
      pool.query("SELECT COUNT(*)::int AS total_roasts FROM oec_roast_sessions WHERE tenant_id = $1 AND deleted_at IS NULL", [tenant_id]),
      pool.query("SELECT COALESCE(SUM(quantity_bags), 0)::int AS requested_bags FROM oec_allocation_requests WHERE tenant_id = $1 AND status != 'fulfilled'", [tenant_id]),
      pool.query("SELECT allocation_code, state, process FROM oec_allocations WHERE tenant_id = $1 AND state = 'open_for_requests' AND deleted_at IS NULL LIMIT 1", [tenant_id]),
      pool.query("SELECT COUNT(*)::int AS quality_alert_lots FROM oec_lots WHERE tenant_id = $1 AND deleted_at IS NULL AND current_weight_g > 0 AND arrival_date < NOW() - INTERVAL '365 days'", [tenant_id]),
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
const clientDistPath = path.join(__dirname, '../../client/dist');

// Cache the content-hashed asset bundles forever (their filenames change on
// every build, so they can never go stale), but never cache index.html — the
// browser must always fetch a fresh one that references the current hashes.
app.use(express.static(clientDistPath, {
  setHeaders: (res, filePath) => {
    if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

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

