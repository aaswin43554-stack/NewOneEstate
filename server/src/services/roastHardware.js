'use strict';

const WebSocket = require('ws');
const jwt       = require('jsonwebtoken');
const pool      = require('../config/db');

const TICK_MS = 2000;

// Shared serial driver — one port, many WS subscribers (fan-out via EventEmitter).
// Null means hardware unavailable; connections fall back to the mock simulation.
let serial = null;

function initSerial() {
  const portPath = process.env.SKYWALKER_PORT;
  if (!portPath) {
    console.log('[server] SKYWALKER_PORT not set — hardware mock active');
    return;
  }

  const { SkywalkerSerial } = require('./roastHardwareSerial');
  const dev = new SkywalkerSerial(portPath);

  dev.open()
    .then(() => {
      serial = dev;
      console.log(`[server] Skywalker V2 connected on ${portPath}`);
    })
    .catch((err) => {
      console.warn(`[server] Skywalker V2 not available on ${portPath} — mock active (${err.message})`);
    });

  dev.on('disconnect', (err) => {
    console.warn(`[server] Skywalker V2 disconnected — mock active (${err.message})`);
    serial = null;
  });
}

// Four-phase mock simulation identical to the original roastHardwareMock.js
function runMock(ws, chargeTemp) {
  let elapsed     = 0;
  let currentTemp = chargeTemp;

  const iv = setInterval(() => {
    elapsed += 2;

    if (elapsed <= 120) {
      const progress = elapsed / 120;
      currentTemp = chargeTemp - progress * 30;
    } else if (elapsed <= 300) {
      const progress = (elapsed - 120) / 180;
      const lowest   = chargeTemp - 30;
      const target   = chargeTemp + 20;
      currentTemp = lowest + progress * (target - lowest);
    } else if (elapsed <= 480) {
      currentTemp += 2;
    } else if (elapsed <= 600) {
      currentTemp += 0.5;
    }

    if (elapsed >= 600) {
      clearInterval(iv);
      if (ws.readyState === WebSocket.OPEN)
        ws.send(JSON.stringify({ event: 'eject_suggested', temp: Math.round(currentTemp) }));
      return;
    }

    if (ws.readyState === WebSocket.OPEN)
      ws.send(JSON.stringify({ t: elapsed, temp: Math.round(currentTemp) }));
  }, TICK_MS);

  const stop = () => clearInterval(iv);
  ws.on('message', (msg) => { if (msg.toString().trim() === 'complete') { stop(); ws.close(); } });
  ws.on('close', stop);
  ws.on('error', stop);
}

function setupRoastWebSocket(server) {
  initSerial();

  const wss = new WebSocket.Server({ server, path: '/ws/roast-live' });

  wss.on('connection', async (ws, req) => {
    const qs         = (req.url || '').split('?')[1] || '';
    const params     = new URLSearchParams(qs);
    const session_id = params.get('session_id');
    const rawToken   = params.get('token')
      || (req.headers.authorization || '').replace(/^Bearer /, '');

    // Verify JWT before doing anything
    if (!rawToken || !process.env.JWT_SECRET) {
      ws.send(JSON.stringify({ error: 'Authentication required' }));
      ws.close();
      return;
    }
    let wsUser;
    try {
      wsUser = jwt.verify(rawToken, process.env.JWT_SECRET);
    } catch {
      ws.send(JSON.stringify({ error: 'Invalid or expired token' }));
      ws.close();
      return;
    }

    if (!session_id) {
      ws.send(JSON.stringify({ error: 'session_id query param is required' }));
      ws.close();
      return;
    }

    let session;
    try {
      const { rows } = await pool.query(
        'SELECT * FROM oec_roast_sessions WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
        [session_id, wsUser.tenant_id]
      );
      session = rows[0];
    } catch (err) {
      console.error('[WS] DB error fetching session:', err.message);
      ws.send(JSON.stringify({ error: 'Database error' }));
      ws.close();
      return;
    }

    if (!session) {
      ws.send(JSON.stringify({ error: 'Session not found' }));
      ws.close();
      return;
    }

    const chargeTemp = session.charge_temp_c || 200;

    if (serial && serial.connected) {
      // Hardware path — subscribe to shared serial EventEmitter
      let elapsed = 0;

      const onTemp = (temp) => {
        elapsed += TICK_MS / 1000;
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ t: elapsed, temp, source: 'hardware' }));
      };

      const onDisconnect = () => {
        if (ws.readyState === WebSocket.OPEN)
          ws.send(JSON.stringify({ event: 'hardware_disconnected' }));
        ws.close();
      };

      serial.on('temp', onTemp);
      serial.once('disconnect', onDisconnect);

      const cleanup = () => {
        if (serial) {
          serial.off('temp', onTemp);
          serial.off('disconnect', onDisconnect);
        }
      };

      ws.on('message', (msg) => { if (msg.toString().trim() === 'complete') { cleanup(); ws.close(); } });
      ws.on('close', cleanup);
      ws.on('error', cleanup);
    } else {
      // Mock fallback
      runMock(ws, chargeTemp);
    }
  });

  console.log('[server] WebSocket hardware service ready at /ws/roast-live');
}

module.exports = { setupRoastWebSocket };
