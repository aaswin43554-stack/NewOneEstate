const express = require('express');
const { body, query, param, validationResult } = require('express-validator');
const pool = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const ROAST_LOSS = { Washed: 0.17, Honey: 0.16, Natural: 0.18, Anaerobic: 0.18 };
const QUALITY_ALERT_DAYS = 365;
const BUFFER_G = 700;

function qualityAlert(arrivalDate) {
  const diffDays = (Date.now() - new Date(arrivalDate).getTime()) / 86400000;
  return diffDays > QUALITY_ALERT_DAYS;
}

// POST /api/lots
router.post(
  '/',
  requireRole('admin', 'roaster'),
  [
    body('lot_code').trim().notEmpty().withMessage('lot_code is required'),
    body('estate').trim().notEmpty().withMessage('estate is required'),
    body('process').isIn(['Washed', 'Honey', 'Natural', 'Anaerobic']).withMessage('Invalid process'),
    body('harvest_year').isInt({ min: 2000, max: 2100 }).withMessage('Invalid harvest_year'),
    body('arrival_date').isISO8601().withMessage('Invalid arrival_date'),
    body('arrival_weight_g').isInt({ min: 1, max: 2147483647 }).withMessage('arrival_weight_g must be a positive integer within range'),
    body('storage_location').trim().notEmpty().withMessage('storage_location is required'),
    body('moisture_content').optional({ nullable: true }).isFloat({ min: 0, max: 100 }),
    body('water_activity').optional({ nullable: true }).isFloat({ min: 0, max: 1 }),
    body('supplier_notes').optional({ nullable: true }).isString(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const {
      lot_code, estate, process, harvest_year, arrival_date,
      arrival_weight_g, storage_location, moisture_content, water_activity, supplier_notes,
    } = req.body;

    try {
      // $7 used twice: arrival_weight_g = current_weight_g on creation
      // $12 used twice: created_by = updated_by
      const { rows: [lot] } = await pool.query(
        `INSERT INTO oec_lots
           (tenant_id, lot_code, estate, process, harvest_year, arrival_date,
            arrival_weight_g, current_weight_g, storage_location, moisture_content,
            water_activity, supplier_notes, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,$9,$10,$11,$12,$12)
         RETURNING *`,
        [
          req.user.tenant_id, lot_code, estate, process, harvest_year, arrival_date,
          arrival_weight_g, storage_location,
          moisture_content ?? null, water_activity ?? null, supplier_notes ?? null,
          req.user.id,
        ]
      );
      return res.status(201).json({ lot: { ...lot, quality_alert: qualityAlert(lot.arrival_date) } });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Lot code already exists for this tenant' });
      console.error('Create lot:', err);
      return res.status(500).json({ error: 'Failed to create lot' });
    }
  }
);

// GET /api/lots
router.get(
  '/',
  [
    query('process').optional().isIn(['Washed', 'Honey', 'Natural', 'Anaerobic']),
    query('harvest_year').optional().isInt(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const params = [req.user.tenant_id];
    const conditions = ['tenant_id = $1', 'deleted_at IS NULL'];

    if (req.query.process) {
      params.push(req.query.process);
      conditions.push(`process = $${params.length}`);
    }
    if (req.query.harvest_year) {
      params.push(parseInt(req.query.harvest_year));
      conditions.push(`harvest_year = $${params.length}`);
    }

    try {
      const { rows } = await pool.query(
        `SELECT * FROM oec_lots WHERE ${conditions.join(' AND ')}
         ORDER BY process, harvest_year DESC, lot_code`,
        params
      );

      // Group: process → harvest_year → lots[]
      const grouped = {};
      for (const lot of rows) {
        const p = lot.process;
        const y = String(lot.harvest_year);
        if (!grouped[p]) grouped[p] = {};
        if (!grouped[p][y]) grouped[p][y] = [];
        grouped[p][y].push({ ...lot, quality_alert: qualityAlert(lot.arrival_date) });
      }

      return res.json({ grouped, total: rows.length });
    } catch (err) {
      console.error('List lots:', err);
      return res.status(500).json({ error: 'Failed to fetch lots' });
    }
  }
);

// GET /api/lots/:id
router.get(
  '/:id',
  [param('id').isUUID()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { rows: [lot] } = await pool.query(
        'SELECT * FROM oec_lots WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
        [req.params.id, req.user.tenant_id]
      );
      if (!lot) return res.status(404).json({ error: 'Lot not found' });

      const { rows: movements } = await pool.query(
        `SELECT m.*, u.name AS authorised_by_name
         FROM oec_lot_movements m
         LEFT JOIN oec_users u ON u.id = m.authorised_by
         WHERE m.lot_id = $1
         ORDER BY m.created_at DESC`,
        [lot.id]
      );

      return res.json({ lot: { ...lot, quality_alert: qualityAlert(lot.arrival_date) }, movements });
    } catch (err) {
      console.error('Get lot:', err);
      return res.status(500).json({ error: 'Failed to fetch lot' });
    }
  }
);

// PUT /api/lots/:id
router.put(
  '/:id',
  requireRole('admin'),
  [
    param('id').isUUID(),
    body('lot_code').optional().trim().notEmpty(),
    body('estate').optional().trim().notEmpty(),
    body('process').optional().isIn(['Washed', 'Honey', 'Natural', 'Anaerobic']),
    body('harvest_year').optional().isInt({ min: 2000, max: 2100 }),
    body('arrival_date').optional().isISO8601(),
    body('storage_location').optional().trim().notEmpty(),
    body('moisture_content').optional({ nullable: true }).isFloat({ min: 0, max: 100 }),
    body('water_activity').optional({ nullable: true }).isFloat({ min: 0, max: 1 }),
    body('supplier_notes').optional({ nullable: true }).isString(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const fields = ['lot_code','estate','process','harvest_year','arrival_date',
                    'storage_location','moisture_content','water_activity','supplier_notes'];
    const updates = [];
    const params  = [];

    for (const f of fields) {
      if (req.body[f] !== undefined) {
        params.push(req.body[f] === '' ? null : req.body[f]);
        updates.push(`${f} = $${params.length}`);
      }
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });

    params.push(req.user.id);
    updates.push(`updated_by = $${params.length}`, 'updated_at = NOW()');
    params.push(req.user.tenant_id, req.params.id);

    try {
      const { rows: [lot] } = await pool.query(
        `UPDATE oec_lots SET ${updates.join(', ')}
         WHERE tenant_id = $${params.length - 1} AND id = $${params.length} AND deleted_at IS NULL
         RETURNING *`,
        params
      );
      if (!lot) return res.status(404).json({ error: 'Lot not found' });
      return res.json({ lot: { ...lot, quality_alert: qualityAlert(lot.arrival_date) } });
    } catch (err) {
      if (err.code === '23505') return res.status(409).json({ error: 'Lot code already exists' });
      console.error('Update lot:', err);
      return res.status(500).json({ error: 'Failed to update lot' });
    }
  }
);

// DELETE /api/lots/:id
router.delete(
  '/:id',
  requireRole('admin'),
  [param('id').isUUID()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { rows: [lot] } = await pool.query(
        `UPDATE oec_lots SET deleted_at = NOW(), updated_by = $1
         WHERE id = $2 AND tenant_id = $3 AND deleted_at IS NULL RETURNING id`,
        [req.user.id, req.params.id, req.user.tenant_id]
      );
      if (!lot) return res.status(404).json({ error: 'Lot not found' });
      return res.json({ message: 'Lot deleted' });
    } catch (err) {
      console.error('Delete lot:', err);
      return res.status(500).json({ error: 'Failed to delete lot' });
    }
  }
);

// POST /api/lots/:id/movements
router.post(
  '/:id/movements',
  requireRole('admin', 'roaster'),
  [
    param('id').isUUID(),
    body('movement_type').isIn(['sales', 'profile_development', 'personal_use', 'write_off']),
    body('weight_change_g').isInt({ min: -2147483647, max: 2147483647 }).withMessage('weight_change_g must be a non-zero integer within range'),
    body('reason').optional({ nullable: true }).isString(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { movement_type, weight_change_g, reason } = req.body;
    if (parseInt(weight_change_g) === 0) {
      return res.status(400).json({ error: 'weight_change_g cannot be zero' });
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const { rows: [lot] } = await client.query(
        'SELECT * FROM oec_lots WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL FOR UPDATE',
        [req.params.id, req.user.tenant_id]
      );
      if (!lot) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Lot not found' });
      }

      const newWeight = lot.current_weight_g + parseInt(weight_change_g);
      if (newWeight < 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          error: `Insufficient stock. Current: ${lot.current_weight_g}g, change: ${weight_change_g}g`,
        });
      }

      await client.query(
        'UPDATE oec_lots SET current_weight_g = $1, updated_at = NOW(), updated_by = $2 WHERE id = $3',
        [newWeight, req.user.id, lot.id]
      );

      const { rows: [movement] } = await client.query(
        `INSERT INTO oec_lot_movements
           (tenant_id, lot_id, movement_type, weight_change_g, reason, authorised_by, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$6) RETURNING *`,
        [req.user.tenant_id, lot.id, movement_type, parseInt(weight_change_g), reason ?? null, req.user.id]
      );

      await client.query('COMMIT');
      return res.status(201).json({ movement, current_weight_g: newWeight });
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('Movement:', err);
      return res.status(500).json({ error: 'Failed to record movement' });
    } finally {
      client.release();
    }
  }
);

// GET /api/lots/:id/yield-projection
router.get(
  '/:id/yield-projection',
  [
    param('id').isUUID(),
    query('planned_green_weight_g').isInt({ min: 1 }),
    query('bag_size_g').isInt({ min: 1 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    try {
      const { rows: [lot] } = await pool.query(
        'SELECT id, process FROM oec_lots WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
        [req.params.id, req.user.tenant_id]
      );
      if (!lot) return res.status(404).json({ error: 'Lot not found' });

      const planned_green_weight_g = parseInt(req.query.planned_green_weight_g);
      const bag_size_g = parseInt(req.query.bag_size_g);
      const roast_loss_rate = ROAST_LOSS[lot.process];
      const usable_weight = planned_green_weight_g - BUFFER_G;
      const roasted_weight_g = Math.max(0, Math.round(usable_weight * (1 - roast_loss_rate)));
      const projected_bags = usable_weight <= 0 ? 0 : Math.floor(roasted_weight_g / bag_size_g);

      return res.json({
        planned_green_weight_g,
        bag_size_g,
        process: lot.process,
        roast_loss_pct: roast_loss_rate * 100,
        buffer_g: BUFFER_G,
        roasted_weight_g,
        projected_bags,
      });
    } catch (err) {
      console.error('Yield projection:', err);
      return res.status(500).json({ error: 'Failed to calculate projection' });
    }
  }
);

module.exports = router;
