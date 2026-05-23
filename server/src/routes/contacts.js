const express = require('express');
const pool    = require('../config/db');
const { requireAuth, requireRole } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

const VALID_STATUSES = ['prospect', 'active_buyer', 'private_list', 'trade_account'];
const VALID_SEGMENTS = ['Laos', 'Thailand', 'Malaysia', 'Singapore', 'Other'];

// GET /api/contacts/private-list  — must be before /:id
router.get('/private-list', async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const { rows } = await pool.query(
      `SELECT * FROM oec_contacts
       WHERE tenant_id = $1 AND status = 'private_list' AND deleted_at IS NULL
       ORDER BY name ASC`,
      [tenant_id]
    );
    return res.json({ contacts: rows });
  } catch (err) {
    console.error('Private list:', err);
    return res.status(500).json({ error: 'Failed to fetch private list.' });
  }
});

// GET /api/contacts
router.get('/', async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { status, segment, search } = req.query;

  const params = [tenant_id];
  const conditions = ['c.tenant_id = $1', 'c.deleted_at IS NULL'];

  if (status && VALID_STATUSES.includes(status)) {
    params.push(status); conditions.push(`c.status = $${params.length}`);
  }
  if (segment && VALID_SEGMENTS.includes(segment)) {
    params.push(segment); conditions.push(`c.market_segment = $${params.length}`);
  }
  if (search && search.trim()) {
    params.push(`%${search.trim()}%`); conditions.push(`c.name ILIKE $${params.length}`);
  }

  try {
    const { rows } = await pool.query(
      `SELECT c.*,
         COUNT(DISTINCT ar.allocation_id)::int                                        AS total_allocations_participated,
         COUNT(DISTINCT ar.allocation_id) FILTER (WHERE ar.status IN ('confirmed','fulfilled'))::int
                                                                                       AS confirmed_allocations
       FROM oec_contacts c
       LEFT JOIN oec_contact_request_links crl ON crl.contact_id = c.id
       LEFT JOIN oec_allocation_requests ar     ON ar.id = crl.allocation_request_id
       WHERE ${conditions.join(' AND ')}
       GROUP BY c.id
       ORDER BY c.name ASC`,
      params
    );

    const contacts = rows.map(c => ({
      ...c,
      return_rate: c.total_allocations_participated > 0
        ? Math.round((c.confirmed_allocations / c.total_allocations_participated) * 100) / 100
        : null,
    }));

    return res.json({ contacts });
  } catch (err) {
    console.error('List contacts:', err);
    return res.status(500).json({ error: 'Failed to fetch contacts.' });
  }
});

// POST /api/contacts
router.post('/', requireRole('admin', 'roaster'), async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { name, primary_contact_method, location, market_segment, preferred_channel, personal_notes, status } = req.body;

  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required.' });
  const resolvedStatus = status || 'prospect';
  if (!VALID_STATUSES.includes(resolvedStatus)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  try {
    const { rows: [contact] } = await pool.query(
      `INSERT INTO oec_contacts
         (tenant_id, name, primary_contact_method, location, market_segment,
          preferred_channel, personal_notes, status, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9) RETURNING *`,
      [
        tenant_id, name.trim(),
        primary_contact_method || null, location || null,
        market_segment || null, preferred_channel || null,
        personal_notes || null, resolvedStatus,
        req.user.id,
      ]
    );
    return res.status(201).json({ contact: { ...contact, total_allocations_participated: 0, return_rate: null } });
  } catch (err) {
    console.error('Create contact:', err);
    return res.status(500).json({ error: 'Failed to create contact.' });
  }
});

// GET /api/contacts/:id
router.get('/:id', async (req, res) => {
  const tenant_id = req.user.tenant_id;
  try {
    const { rows: [contact] } = await pool.query(
      'SELECT * FROM oec_contacts WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
      [req.params.id, tenant_id]
    );
    if (!contact) return res.status(404).json({ error: 'Contact not found.' });

    const { rows: history } = await pool.query(
      `SELECT ar.id, ar.allocation_id, ar.quantity_bags, ar.status, ar.created_at,
              a.allocation_code, a.process, a.harvest_year
       FROM oec_contact_request_links crl
       JOIN oec_allocation_requests ar ON ar.id  = crl.allocation_request_id
       JOIN oec_allocations a          ON a.id   = ar.allocation_id
       WHERE crl.contact_id = $1
       ORDER BY ar.created_at DESC`,
      [contact.id]
    );

    const totalAllocs = new Set(history.map(h => h.allocation_id)).size;
    const confirmedAllocs = new Set(
      history.filter(h => ['confirmed','fulfilled'].includes(h.status)).map(h => h.allocation_id)
    ).size;

    return res.json({
      contact: {
        ...contact,
        total_allocations_participated: totalAllocs,
        return_rate: totalAllocs > 0 ? Math.round((confirmedAllocs / totalAllocs) * 100) / 100 : null,
      },
      purchase_history: history,
    });
  } catch (err) {
    console.error('Get contact:', err);
    return res.status(500).json({ error: 'Failed to fetch contact.' });
  }
});

// PUT /api/contacts/:id
router.put('/:id', requireRole('admin', 'roaster'), async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { rows: [contact] } = await pool.query(
    'SELECT * FROM oec_contacts WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [req.params.id, tenant_id]
  );
  if (!contact) return res.status(404).json({ error: 'Contact not found.' });

  const { name, primary_contact_method, location, market_segment, preferred_channel, personal_notes, status } = req.body;
  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  try {
    const { rows: [updated] } = await pool.query(
      `UPDATE oec_contacts SET
         name                   = COALESCE($1, name),
         primary_contact_method = $2,
         location               = $3,
         market_segment         = $4,
         preferred_channel      = $5,
         personal_notes         = $6,
         status                 = COALESCE($7, status),
         updated_at             = NOW(), updated_by = $8
       WHERE id = $9 RETURNING *`,
      [
        name ? name.trim() : null,
        primary_contact_method !== undefined ? (primary_contact_method || null) : contact.primary_contact_method,
        location              !== undefined ? (location || null)               : contact.location,
        market_segment        !== undefined ? (market_segment || null)         : contact.market_segment,
        preferred_channel     !== undefined ? (preferred_channel || null)      : contact.preferred_channel,
        personal_notes        !== undefined ? (personal_notes || null)         : contact.personal_notes,
        status || null,
        req.user.id, contact.id,
      ]
    );
    return res.json({ contact: updated });
  } catch (err) {
    console.error('Update contact:', err);
    return res.status(500).json({ error: 'Failed to update contact.' });
  }
});

// DELETE /api/contacts/:id  (soft delete — admin only)
router.delete('/:id', requireRole('admin'), async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { rows: [contact] } = await pool.query(
    'SELECT id FROM oec_contacts WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [req.params.id, tenant_id]
  );
  if (!contact) return res.status(404).json({ error: 'Contact not found.' });

  await pool.query(
    'UPDATE oec_contacts SET deleted_at = NOW(), updated_by = $1 WHERE id = $2',
    [req.user.id, contact.id]
  );
  return res.json({ ok: true });
});

// POST /api/contacts/:id/link-request
router.post('/:id/link-request', requireRole('admin', 'roaster'), async (req, res) => {
  const tenant_id = req.user.tenant_id;
  const { allocation_request_id } = req.body;
  if (!allocation_request_id) return res.status(400).json({ error: 'allocation_request_id is required.' });

  const { rows: [contact] } = await pool.query(
    'SELECT id FROM oec_contacts WHERE id = $1 AND tenant_id = $2 AND deleted_at IS NULL',
    [req.params.id, tenant_id]
  );
  if (!contact) return res.status(404).json({ error: 'Contact not found.' });

  const { rows: [ar] } = await pool.query(
    'SELECT id FROM oec_allocation_requests WHERE id = $1 AND tenant_id = $2',
    [allocation_request_id, tenant_id]
  );
  if (!ar) return res.status(404).json({ error: 'Allocation request not found.' });

  try {
    await pool.query(
      `INSERT INTO oec_contact_request_links (tenant_id, contact_id, allocation_request_id, created_by)
       VALUES ($1,$2,$3,$4) ON CONFLICT (contact_id, allocation_request_id) DO NOTHING`,
      [tenant_id, contact.id, ar.id, req.user.id]
    );
    return res.json({ ok: true });
  } catch (err) {
    console.error('Link request:', err);
    return res.status(500).json({ error: 'Failed to link request.' });
  }
});

module.exports = router;
