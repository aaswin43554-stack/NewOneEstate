'use strict';

const express = require('express');
const { requireAuth, requireRole } = require('../middleware/auth');
const roastHardware = require('../services/roastHardware');

let SerialPort = null;
try {
  SerialPort = require('serialport').SerialPort;
} catch (err) {
  console.warn('[hardware] serialport module not available on this server host:', err.message);
}

const router = express.Router();
router.use(requireAuth);

// GET /api/hardware/ports
// Lists all available serial ports on the server host
router.get('/ports', requireRole('admin', 'roaster'), async (req, res) => {
  if (!SerialPort) {
    return res.json({ ports: [], message: 'Serial hardware support is not available on this server environment.' });
  }
  try {
    const ports = await SerialPort.list();
    return res.json({ ports });
  } catch (err) {
    console.error('[hardware] Failed to list serial ports:', err);
    return res.status(500).json({ error: 'Failed to scan serial ports.' });
  }
});

// GET /api/hardware/status
// Returns the current connection state and active port path
router.get('/status', async (req, res) => {
  try {
    const status = roastHardware.getHardwareStatus();
    return res.json(status);
  } catch (err) {
    console.error('[hardware] Failed to get status:', err);
    return res.status(500).json({ error: 'Failed to retrieve hardware status.' });
  }
});

// POST /api/hardware/connect
// Attempts to dynamically connect to a specific port path
router.post('/connect', requireRole('admin', 'roaster'), async (req, res) => {
  const { portPath } = req.body;
  if (!portPath) {
    return res.status(400).json({ error: 'portPath is required.' });
  }

  try {
    await roastHardware.connectHardware(portPath);
    return res.json({ success: true, message: `Connected to Skywalker V2 on ${portPath}` });
  } catch (err) {
    console.error(`[hardware] Connection failed on ${portPath}:`, err);
    return res.status(500).json({ error: `Connection failed: ${err.message}` });
  }
});

// POST /api/hardware/disconnect
// Manually closes the active serial port connection
router.post('/disconnect', requireRole('admin', 'roaster'), async (req, res) => {
  try {
    await roastHardware.disconnectHardware();
    return res.json({ success: true, message: 'Disconnected from Skywalker V2.' });
  } catch (err) {
    console.error('[hardware] Disconnect failed:', err);
    return res.status(500).json({ error: 'Failed to disconnect.' });
  }
});

module.exports = router;
