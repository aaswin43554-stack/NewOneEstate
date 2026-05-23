// TODO: Replace this entire mock with the real Skywalker V2 BLE/USB hardware driver.
// Reference: https://github.com/artisan-roaster-scope/artisan — see Skywalker/Cyberoaster device
// handler for the exact BLE characteristic UUIDs and USB serial protocol used to stream roast data.

const WebSocket = require('ws');
const pool = require('../config/db');

const TICK_MS = 2000;

function setupRoastWebSocket(server) {
  const wss = new WebSocket.Server({ server, path: '/ws/roast-live' });

  wss.on('connection', async (ws, req) => {
    const qs = (req.url || '').split('?')[1] || '';
    const session_id = new URLSearchParams(qs).get('session_id');

    if (!session_id) {
      ws.send(JSON.stringify({ error: 'session_id query param is required' }));
      ws.close();
      return;
    }

    let session;
    try {
      const { rows } = await pool.query(
        'SELECT * FROM oec_roast_sessions WHERE id = $1 AND deleted_at IS NULL',
        [session_id]
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
    let elapsed     = 0;
    let currentTemp = chargeTemp;

    const interval = setInterval(() => {
      elapsed += 2;

      // Phase 1 (0–120s): moisture dip — drops to charge - 30
      if (elapsed <= 120) {
        const progress = elapsed / 120;
        currentTemp = chargeTemp - progress * 30;
      }
      // Phase 2 (120–300s): steady climb back to charge + 20
      else if (elapsed <= 300) {
        const progress = (elapsed - 120) / 180;
        const lowest   = chargeTemp - 30;
        const target   = chargeTemp + 20;
        currentTemp = lowest + progress * (target - lowest);
      }
      // Phase 3 (300–480s): first crack approach, +2°C/tick
      else if (elapsed <= 480) {
        currentTemp += 2;
      }
      // Phase 4 (480–600s): development, +0.5°C/tick
      else if (elapsed <= 600) {
        currentTemp += 0.5;
      }

      if (elapsed >= 600) {
        clearInterval(interval);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ event: 'eject_suggested', temp: Math.round(currentTemp) }));
        }
        return;
      }

      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ t: elapsed, temp: Math.round(currentTemp) }));
      }
    }, TICK_MS);

    ws.on('message', (msg) => {
      if (msg.toString().trim() === 'complete') {
        clearInterval(interval);
        ws.close();
      }
    });

    ws.on('close', () => clearInterval(interval));
    ws.on('error', (err) => {
      console.error('[WS] client error:', err.message);
      clearInterval(interval);
    });
  });

  console.log('[server] WebSocket mock hardware service ready at /ws/roast-live');
}

module.exports = { setupRoastWebSocket };
