require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

// Force IPv4 — Render's network cannot reach Supabase over IPv6
require('dns').setDefaultResultOrder('ipv4first');

// Prevent ANY unhandled error from crashing the server
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandledRejection:', reason?.message || reason);
});
process.on('uncaughtException', (err) => {
  console.error('[server] uncaughtException:', err.message);
});

const http    = require('http');
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const migrate = require('./scripts/migrate');
const seed    = require('./scripts/seed');

const { requireAuth } = require('./middleware/auth');
const pool = require('./config/db');

const authRoutes          = require('./routes/auth');
const lotsRoutes          = require('./routes/lots');
const roastSessionRoutes  = require('./routes/roastSessions');
const allocationRoutes    = require('./routes/allocations');
const profileRoutes       = require('./routes/profiles');
const cuppingRoutes       = require('./routes/cupping');
const labelRoutes         = require('./routes/labels');
const contactRoutes       = require('./routes/contacts');
const journalRoutes       = require('./routes/journal');
const { setupRoastWebSocket } = require('./services/roastHardwareMock');

const app  = express();
const PORT = process.env.PORT || 3001;

// Allow all origins in production (frontend is same-origin anyway)
app.use(cors({
  origin: process.env.NODE_ENV === 'production' ? true : (process.env.CLIENT_URL || 'http://localhost:5173'),
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));

// Health check — always responds, no DB required
app.get('/api/health', (_req, res) =>
  res.json({ status: 'ok', timestamp: new Date().toISOString(), db: !!process.env.DATABASE_URL })
);

app.use('/api/auth',             authRoutes);
app.use('/api/lots',             lotsRoutes);
app.use('/api/roast-sessions',   roastSessionRoutes);
app.use('/api/allocations',      allocationRoutes);
app.use('/api/profiles',         profileRoutes);
app.use('/api/cupping-sessions', cuppingRoutes);
app.use('/api/labels',           labelRoutes);
app.use('/api/contacts',         contactRoutes);
app.use('/api/journal',          journalRoutes);

// Dashboard Stats Endpoint
app.get('/api/dashboard-stats', requireAuth, async (req, res) => {
  try {
    const tenant_id = req.user.tenant_id;
    const [
      { rows: [{ total_stock }] },
      { rows: [{ active_allocs }] },
      { rows: [{ total_contacts }] },
      { rows: [{ total_roasts }] },
      { rows: [{ requested_bags }] },
      { rows: activeAllocsList }
    ] = await Promise.all([
      pool.query("SELECT COALESCE(SUM(current_weight_g), 0)::bigint AS total_stock FROM oec_lots WHERE tenant_id = $1 AND deleted_at IS NULL", [tenant_id]),
      pool.query("SELECT COUNT(*)::int AS active_allocs FROM oec_allocations WHERE tenant_id = $1 AND state != 'archived' AND deleted_at IS NULL", [tenant_id]),
      pool.query("SELECT COUNT(*)::int AS total_contacts FROM oec_contacts WHERE tenant_id = $1 AND deleted_at IS NULL", [tenant_id]),
      pool.query("SELECT COUNT(*)::int AS total_roasts FROM oec_roast_sessions WHERE tenant_id = $1 AND deleted_at IS NULL", [tenant_id]),
      pool.query("SELECT COALESCE(SUM(quantity_bags), 0)::int AS requested_bags FROM oec_allocation_requests WHERE tenant_id = $1 AND status != 'fulfilled'", [tenant_id]),
      pool.query("SELECT allocation_code, state, process FROM oec_allocations WHERE tenant_id = $1 AND state = 'open_for_requests' AND deleted_at IS NULL LIMIT 1", [tenant_id])
    ]);

    return res.json({
      totalGreenStockG: parseInt(total_stock),
      activeAllocationsCount: active_allocs,
      totalContactsCount: total_contacts,
      totalRoastsCount: total_roasts,
      totalBagsRequested: requested_bags,
      activeAllocation: activeAllocsList[0] || null
    });
  } catch (err) {
    console.error('Fetch dashboard stats:', err);
    return res.status(500).json({ error: 'Failed to fetch dashboard stats.' });
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
app.use((err, _req, res, _next) => {
  console.error('[server] express error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Serve built frontend in production
const clientDistPath = path.join(__dirname, '../../client/dist');
app.use(express.static(clientDistPath));
app.get('*', (_req, res) => res.sendFile(path.join(clientDistPath, 'index.html')));

const server = http.createServer(app);
setupRoastWebSocket(server);

server.listen(PORT, async () => {
  console.log(`[server] listening on port ${PORT}`);
  console.log(`[server] DATABASE_URL: ${process.env.DATABASE_URL ? 'SET ✓' : 'NOT SET ✗'}`);
  console.log(`[server] NODE_ENV: ${process.env.NODE_ENV || 'development'}`);

  try {
    await migrate();
    await seed();
  } catch (err) {
    console.error('[server] Startup migrate/seed failed:', err.message);
  }
});

