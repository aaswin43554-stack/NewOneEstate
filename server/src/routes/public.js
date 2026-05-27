const express = require('express');
const pool    = require('../config/db');

const router = express.Router();

// GET /api/public/allocations/:id
// No auth — returns only safe public fields
router.get('/allocations/:id', async (req, res) => {
  try {
    const { rows: [alloc] } = await pool.query(
      `SELECT a.id, a.allocation_code, a.process, a.harvest_year,
              COALESCE(l.estate, a.estate) AS estate,
              l.lot_code
       FROM oec_allocations a
       LEFT JOIN oec_lots l ON l.id = a.lot_id AND l.deleted_at IS NULL
       WHERE a.id = $1 AND a.deleted_at IS NULL`,
      [req.params.id]
    );
    if (!alloc) return res.status(404).json({ error: 'Not found.' });

    const { rows: [label] } = await pool.query(
      `SELECT roast_date_start, roast_date_end, ready_to_brew_date, best_consumed_by_date
       FROM oec_labels WHERE allocation_id = $1`,
      [req.params.id]
    );

    // All 4 published journal types — admin decides what to publish
    const { rows: journal } = await pool.query(
      `SELECT document_type, published_content
       FROM oec_journal_entries
       WHERE allocation_id = $1 AND status = 'published'
         AND deleted_at IS NULL
       ORDER BY
         CASE document_type
           WHEN 'field_notes'       THEN 1
           WHEN 'roast_log'         THEN 2
           WHEN 'cupping_record'    THEN 3
           WHEN 'allocation_record' THEN 4
           ELSE 5
         END`,
      [req.params.id]
    );

    return res.json({
      allocation: {
        allocation_code: alloc.allocation_code,
        process:         alloc.process,
        harvest_year:    alloc.harvest_year,
        estate:          alloc.estate,
        lot_code:        alloc.lot_code,
      },
      label: label || null,
      journal,
    });
  } catch (err) {
    console.error('Public allocation:', err);
    return res.status(500).json({ error: 'Failed to fetch allocation.' });
  }
});

module.exports = router;
