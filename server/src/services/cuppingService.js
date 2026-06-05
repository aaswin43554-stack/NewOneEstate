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

// Calculate cup-check score from a boolean array
function calcCupCheckScore(cupsArray) {
  if (!Array.isArray(cupsArray)) return 0;
  return cupsArray.filter(Boolean).length * 2;
}

// Calculate total defects score from the defects JSON array
function calcTotalDefects(defectsJson) {
  if (!Array.isArray(defectsJson)) return 0;
  return defectsJson.reduce((sum, d) => {
    const multiplier = d.type === 'fault' ? 4 : 2;
    return sum + (parseInt(d.cups_affected) || 0) * (parseInt(d.intensity) || 0) * multiplier;
  }, 0);
}

function generateJournalDraft(sample, roast_session, process, days_off_roast, legacy) {
  const harvest_year = roast_session.harvest_year || '';
  const batch_code   = roast_session.batch_code || '';

  let text = `Cupped ${days_off_roast} days off roast. ${batch_code}, ${process}${harvest_year ? `, ${harvest_year} harvest` : ''}.`;

  if (legacy) {
    // Old 7-attribute format
    const attrs = [
      { key: 'fragrance_aroma', label: 'Fragrance/Aroma' },
      { key: 'flavor',          label: 'Flavor' },
      { key: 'acidity',         label: 'Acidity' },
      { key: 'body',            label: 'Body' },
      { key: 'sweetness',       label: 'Sweetness' },
      { key: 'aftertaste',      label: 'Aftertaste' },
      { key: 'overall',         label: 'Overall' },
    ];
    for (const { key, label } of attrs) {
      const score = sample[`score_${key}`];
      const obs   = sample[`obs_${key}`] || sample[`obs_fragrance_dry`];
      if (obs && obs.trim()) {
        text += ` ${label} ${score}/10 — ${obs.trim()}.`;
      } else {
        text += ` ${label} ${score}/10.`;
      }
    }
  } else {
    // SCA format
    const scored = [
      { score: sample.score_fragrance_aroma, label: 'Fragrance/Aroma', obs: [sample.obs_fragrance_dry, sample.obs_aroma_wet].filter(Boolean).join('; ') },
      { score: sample.score_flavor,          label: 'Flavor',          obs: sample.obs_flavor },
      { score: sample.score_aftertaste,      label: 'Aftertaste',      obs: sample.obs_aftertaste },
      { score: sample.score_acidity,         label: 'Acidity',         obs: sample.obs_acidity, qualifier: sample.acidity_intensity },
      { score: sample.score_body,            label: 'Body',            obs: sample.obs_body,    qualifier: sample.body_level },
      { score: sample.score_balance,         label: 'Balance',         obs: sample.obs_balance },
      { score: sample.score_overall,         label: 'Overall',         obs: sample.obs_overall },
    ];

    for (const { score, label, obs, qualifier } of scored) {
      const parts = [];
      if (qualifier) parts.push(qualifier);
      if (obs && obs.trim()) parts.push(obs.trim());
      text += ` ${label} ${parseFloat(score).toFixed(2)}${parts.length ? ` — ${parts.join(', ')}` : ''}.`;
    }

    // Cup checks
    const uniformity = calcCupCheckScore(sample.uniformity_cups);
    const cleanCup   = calcCupCheckScore(sample.clean_cup_cups);
    const sweetness  = calcCupCheckScore(sample.sweetness_cups);
    text += ` Uniformity ${uniformity}/10. Clean Cup ${cleanCup}/10. Sweetness ${sweetness}/10.`;

    // Defects
    const defectsTotal = calcTotalDefects(sample.defects_json);
    if (defectsTotal > 0) text += ` Defects: −${defectsTotal}.`;

    // Final score
    const finalScore =
      (parseFloat(sample.score_fragrance_aroma) || 0) +
      (parseFloat(sample.score_flavor)          || 0) +
      (parseFloat(sample.score_aftertaste)      || 0) +
      (parseFloat(sample.score_acidity)         || 0) +
      (parseFloat(sample.score_body)            || 0) +
      (parseFloat(sample.score_balance)         || 0) +
      (parseFloat(sample.score_overall)         || 0) +
      uniformity + cleanCup + sweetness - defectsTotal;

    text += ` Final SCA score: ${finalScore.toFixed(2)}.`;
  }

  text += ` Decision: ${sample.final_decision}.`;
  return text;
}

module.exports = {
  getProcessFromSession,
  generateJournalDraft,
  calcCupCheckScore,
  calcTotalDefects,
  REST_DAYS,
  getProcessFromBatchCode,
};
