const pool = require('../config/db');

const REST_DAYS = { Washed: 4, Honey: 5, Natural: 7, Anaerobic: 7 };

const BATCH_PREFIX_MAP = {
  'DEV-AN-': 'Anaerobic',
  'DEV-W-':  'Washed',
  'DEV-H-':  'Honey',
  'DEV-N-':  'Natural',
};

function getProcessFromBatchCode(batch_code) {
  for (const [prefix, process] of Object.entries(BATCH_PREFIX_MAP)) {
    if (batch_code.startsWith(prefix)) return process;
  }
  return null;
}

async function getProcessFromSession(roast_session_id, tenant_id) {
  const { rows } = await pool.query(
    `SELECT s.is_development, s.batch_code, s.allocation_id,
            a.process AS alloc_process
     FROM oec_roast_sessions s
     LEFT JOIN oec_allocations a ON a.id = s.allocation_id
     WHERE s.id = $1 AND s.tenant_id = $2`,
    [roast_session_id, tenant_id]
  );
  if (!rows[0]) return null;
  const session = rows[0];
  if (!session.is_development) return session.alloc_process;
  return getProcessFromBatchCode(session.batch_code);
}

function generateJournalDraft(sample, roast_session, process, days_off_roast) {
  const harvest_year = roast_session.harvest_year || '';
  const batch_code   = roast_session.batch_code || '';
  let text = `Cupped ${days_off_roast} days off roast. ${batch_code}, ${process}${harvest_year ? `, ${harvest_year} harvest` : ''}.`;

  const attrs = [
    { key: 'aroma',      label: 'Aroma' },
    { key: 'flavour',    label: 'Flavour' },
    { key: 'acidity',    label: 'Acidity' },
    { key: 'body',       label: 'Body' },
    { key: 'sweetness',  label: 'Sweetness' },
    { key: 'aftertaste', label: 'Aftertaste' },
    { key: 'overall',    label: 'Overall' },
  ];

  for (const { key, label } of attrs) {
    const score = sample[`score_${key}`];
    const obs   = sample[`obs_${key}`];
    if (obs && obs.trim()) {
      text += ` ${label} ${score}/10 — ${obs.trim()}.`;
    } else {
      text += ` ${label} ${score}/10.`;
    }
  }

  text += ` Decision: ${sample.final_decision}.`;
  return text;
}

module.exports = { getProcessFromSession, generateJournalDraft, REST_DAYS, getProcessFromBatchCode };
