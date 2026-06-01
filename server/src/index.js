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

// Gzip all responses — biggest win on JSON-heavy API responses
app.use(compression());

// Allow all origins in production (frontend is same-origin anyway)
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? true : (process.env.CLIENT_URL || 'http://localhost:5173'),
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Request logger — logs every incoming request and its response status/time
app.use((req, res, next) => {
  const start = Date.now();
  const { method, path: reqPath, ip } = req;
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'log';
    console[level](`[HTTP] ${method} ${reqPath} -> ${res.statusCode} (${ms}ms) [${ip}]`);
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
    ] = await Promise.all([
      pool.query("SELECT COALESCE(SUM(current_weight_g), 0)::bigint AS total_stock FROM oec_lots WHERE tenant_id = $1 AND deleted_at IS NULL", [tenant_id]),
      pool.query("SELECT COUNT(*)::int AS active_allocs FROM oec_allocations WHERE tenant_id = $1 AND state != 'archived' AND deleted_at IS NULL", [tenant_id]),
      pool.query("SELECT COUNT(*)::int AS total_contacts FROM oec_contacts WHERE tenant_id = $1 AND deleted_at IS NULL", [tenant_id]),
      pool.query("SELECT COUNT(*)::int AS total_roasts FROM oec_roast_sessions WHERE tenant_id = $1 AND deleted_at IS NULL", [tenant_id]),
      pool.query("SELECT COALESCE(SUM(quantity_bags), 0)::int AS requested_bags FROM oec_allocation_requests WHERE tenant_id = $1 AND status != 'fulfilled'", [tenant_id]),
      pool.query("SELECT allocation_code, state, process FROM oec_allocations WHERE tenant_id = $1 AND state = 'open_for_requests' AND deleted_at IS NULL LIMIT 1", [tenant_id]),
      pool.query("SELECT COUNT(*)::int AS quality_alert_lots FROM oec_lots WHERE tenant_id = $1 AND deleted_at IS NULL AND current_weight_g > 0 AND arrival_date < NOW() - INTERVAL '365 days'", [tenant_id]),
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
    });
  } catch (err) {
    // DASH_001: DB error fetching one or more dashboard stat queries
    console.error(`[DASHBOARD][DASH_001] Stats query failed for tenant ${tenant_id} | pg code: ${err.code || 'N/A'} | ${err.message}`);
    console.error(err.stack);
    return res.status(500).json({ error: 'Failed to fetch dashboard stats.', code: 'DASH_001' });
  }
});

// Flat endpoint for all allocation requests (used by contact-linking modal)
app.get('/api/allocation-requests', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT ar.id, ar.contact_name, ar.channel, ar.quantity_bags, ar.status,
              ar.created_at, a.allocation_code, a.process
       FROM oec_allocation_requests ar
       JOIN oec_allocations a ON a.id = ar.allocation_id
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

// Global error handler
app.use((err, req, res, _next) => {
  // SRV_001: Unhandled error that bubbled up through Express (next(err) call)
  console.error(`[server][SRV_001] Unhandled Express error on ${req.method} ${req.path}`);
  console.error(`[server][SRV_001] ${err.name || 'Error'}: ${err.message}`);
  if (err.stack) console.error(err.stack);
  res.status(500).json({ error: 'Internal server error', code: 'SRV_001' });
});

// Serve built frontend in production
const clientDistPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));
app.get('*', (_req, res) => res.sendFile(path.join(clientDistPath, 'index.html')));

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

