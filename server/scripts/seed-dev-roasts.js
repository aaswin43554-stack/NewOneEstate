/**
 * Applies migration 019 and seeds all 12 development roast sessions
 * from the Dev Roast Log spreadsheet.
 * Run: node server/scripts/seed-dev-roasts.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SESSIONS = [
  {
    batch_code: 'DEV-NA-01',
    date: '2026-04-20',
    estate: 'Suan Saket',
    process_description: 'Natural Anaerobic 48HR',
    green_weight_in_g: 400,
    moisture_pct: 10.5,
    charge_temp_c: 197.0,
    tp_temp_c: 101.0,   tp_time_seconds: 66,
    yellow_temp_c: 145.0, yellow_time_seconds: null,
    first_crack_temp_c: 194.0, first_crack_time_seconds: 529, ror_first_crack: null,
    eject_temp_c: 198.0, total_time_seconds: 630, ror_eject: null,
    development_time_seconds: 101, dtr: 16.0,
    roasted_weight_out_g: 344,
    status: 'completed',
    decision_notes: 'ADJUST — DTR too low. Short dev window. Fruit restrained. Anise possible artefact. Cupped Day 10 — 7/10. Proceed DEV-NA-02.',
  },
  {
    batch_code: 'DEV-NA-02',
    date: '2026-05-19',
    estate: 'Suan Saket',
    process_description: 'Natural Anaerobic 48HR',
    green_weight_in_g: 400,
    moisture_pct: null,
    charge_temp_c: 198.0,
    tp_temp_c: 105.0,   tp_time_seconds: 66,
    yellow_temp_c: 151.8, yellow_time_seconds: 249,
    first_crack_temp_c: 186.6, first_crack_time_seconds: 388, ror_first_crack: 14,
    eject_temp_c: 204.0, total_time_seconds: 460, ror_eject: '15 — FLICK',
    development_time_seconds: 72, dtr: 15.7,
    roasted_weight_out_g: 344,
    status: 'completed',
    decision_notes: 'ADJUST — 2nd crack hit at 196.6°C / 7:04. ROR flick at eject. Fast aggressive roast 7:37 total. Over-developed despite low DTR. Do not cup for release. Lower charge to 182–185°C on DEV-NA-03.',
  },
  {
    batch_code: 'DEV-W-01',
    date: '2026-05-19',
    estate: 'Uganda — Chanzo Farms',
    process_description: 'Washed (Internal Ref Only)',
    green_weight_in_g: 300,
    moisture_pct: null,
    charge_temp_c: 191.0,
    tp_temp_c: 118.9,  tp_time_seconds: 80,
    yellow_temp_c: 144.4, yellow_time_seconds: 292,
    first_crack_temp_c: 175.0, first_crack_time_seconds: 575, ror_first_crack: 6,
    eject_temp_c: 185.3, total_time_seconds: 712, ror_eject: '4 — OK',
    development_time_seconds: 137, dtr: 19.2,
    roasted_weight_out_g: 261,
    status: 'completed',
    decision_notes: 'ADJUST — NON-ESTATE — internal ref only. No allocation. Best ROR to date: 7→6→4 declining. No 2nd crack. Color variation — dark outliers. 1C at 175°C low. Intervention H50/F70 at 172°C worked.',
  },
  {
    batch_code: 'DEV-W-02-R01',
    date: '2026-05-22',
    estate: 'Suan Saket',
    process_description: 'Washed — Field Blend',
    green_weight_in_g: 400,
    moisture_pct: null,
    charge_temp_c: 190.0,
    tp_temp_c: 104.4,  tp_time_seconds: 170,
    yellow_temp_c: 144.1, yellow_time_seconds: 354,
    first_crack_temp_c: 181.7, first_crack_time_seconds: 701, ror_first_crack: null,
    eject_temp_c: 190.2, total_time_seconds: 848, ror_eject: '4 — OK',
    development_time_seconds: 147, dtr: 17.3,
    roasted_weight_out_g: 344,
    status: 'rejected',
    decision_notes: 'REJECT — REJECTED — water contamination during storage. Cupping invalid. Do not reference as profile data. Record retained for completeness.',
  },
  {
    batch_code: 'DEV-W-02-R02',
    date: '2026-05-25',
    estate: 'Suan Saket',
    process_description: 'Washed — Field Blend',
    green_weight_in_g: 400,
    moisture_pct: null,
    charge_temp_c: 194.0,
    tp_temp_c: 102.8,  tp_time_seconds: 77,
    yellow_temp_c: 146.9, yellow_time_seconds: 395,
    first_crack_temp_c: 184.9, first_crack_time_seconds: 777, ror_first_crack: 4,
    eject_temp_c: 193.7, total_time_seconds: 918, ror_eject: '3 — OK',
    development_time_seconds: 141, dtr: 15.4,
    roasted_weight_out_g: null,
    status: 'completed',
    decision_notes: 'ADJUST — Cupped early — under-rested. Result: 5/10. Dried apricot, prune, brown sugar, bold body, lingering finish. Indicative only — not confirmed profile evaluation. DTR below target. Charge 4°C above target.',
  },
  {
    batch_code: 'DEV-W-02-R03',
    date: '2026-05-25',
    estate: 'Suan Saket',
    process_description: 'Washed — Field Blend',
    green_weight_in_g: 400,
    moisture_pct: null,
    charge_temp_c: 192.3,
    tp_temp_c: 104.9,  tp_time_seconds: 98,
    yellow_temp_c: 151.3, yellow_time_seconds: 407,
    first_crack_temp_c: 182.1, first_crack_time_seconds: 702, ror_first_crack: 5,
    eject_temp_c: 195.3, total_time_seconds: 898, ror_eject: '3 — OK',
    development_time_seconds: 196, dtr: 21.8,
    roasted_weight_out_g: 341,
    status: 'completed',
    decision_notes: 'ADJUST — DTR TARGET HIT 21.8%. Best dev time 3:16. Yellowing 6:47. Eject 195.3°C on target. ROR 5→3 declining. No 2nd crack. Mixed into blend R03–R07 — individual cup eval lost.',
  },
  {
    batch_code: 'DEV-W-02-R04',
    date: '2026-05-25',
    estate: 'Suan Saket',
    process_description: 'Washed — Field Blend',
    green_weight_in_g: 400,
    moisture_pct: null,
    charge_temp_c: 194.5,
    tp_temp_c: 115.3,  tp_time_seconds: 90,
    yellow_temp_c: 151.7, yellow_time_seconds: 398,
    first_crack_temp_c: 181.1, first_crack_time_seconds: 740, ror_first_crack: 3,
    eject_temp_c: 190.5, total_time_seconds: 900, ror_eject: '3 — OK',
    development_time_seconds: 160, dtr: 17.8,
    roasted_weight_out_g: 341,
    status: 'completed',
    decision_notes: 'ADJUST — Charge 194.5°C — above target. TP high at 115.3°C. Eject 190.5°C — below 195°C target. DTR 17.8% below target. Pulled too early. Mixed into blend R03–R07.',
  },
  {
    batch_code: 'DEV-W-02-R05',
    date: '2026-05-26',
    estate: 'Suan Saket',
    process_description: 'Washed — Field Blend',
    green_weight_in_g: 400,
    moisture_pct: null,
    charge_temp_c: 192.0,
    tp_temp_c: 118.6,  tp_time_seconds: 100,
    yellow_temp_c: 150.1, yellow_time_seconds: 340,
    first_crack_temp_c: 182.1, first_crack_time_seconds: 723, ror_first_crack: 4,
    eject_temp_c: 191.9, total_time_seconds: 930, ror_eject: '3 — OK',
    development_time_seconds: 207, dtr: 22.3,
    roasted_weight_out_g: 341,
    status: 'completed',
    decision_notes: 'ADJUST — DTR TARGET HIT 22.3% — highest in series. Dev time 3:27 — longest. BUT yellowing early at 5:40 — shortened drying phase. TP high at 118.6°C — possible residual drum heat from R04. Heater 55% at 1C introduced. Mixed into blend R03–R07.',
  },
  {
    batch_code: 'DEV-W-02-R06',
    date: '2026-05-26',
    estate: 'Suan Saket',
    process_description: 'Washed — Field Blend',
    green_weight_in_g: 400,
    moisture_pct: null,
    charge_temp_c: 192.1,
    tp_temp_c: 108.9,  tp_time_seconds: 136,
    yellow_temp_c: 151.1, yellow_time_seconds: 429,
    first_crack_temp_c: 183.0, first_crack_time_seconds: 755, ror_first_crack: 5,
    eject_temp_c: 193.1, total_time_seconds: 935, ror_eject: '3 — OK',
    development_time_seconds: 180, dtr: 19.3,
    roasted_weight_out_g: 341,
    status: 'completed',
    decision_notes: 'ADJUST — BEST DRYING PHASE — yellowing 7:09. TP controlled at 2:16. ROR 5→3 declining. DTR 19.3% just below target — eject 193.1°C pulled too early. Hold to 195°C+ next time. Mixed into blend R03–R07.',
  },
  {
    batch_code: 'DEV-W-02-R07',
    date: '2026-05-26',
    estate: 'Suan Saket',
    process_description: 'Washed — Field Blend',
    green_weight_in_g: 400,
    moisture_pct: null,
    charge_temp_c: 196.0,
    tp_temp_c: 102.1,  tp_time_seconds: 98,
    yellow_temp_c: 146.8, yellow_time_seconds: 424,
    first_crack_temp_c: 183.5, first_crack_time_seconds: 805, ror_first_crack: 6,
    eject_temp_c: 195.4, total_time_seconds: 985, ror_eject: '3 — OK',
    development_time_seconds: 180, dtr: 18.3,
    roasted_weight_out_g: 340,
    status: 'completed',
    decision_notes: 'ADJUST — Charge 196°C — highest in series. Eject 195.4°C — target achieved. Yellowing 7:04 — strong drying phase. BUT 1C late at 13:25 due to high charge — extended total time without extending dev proportionally. DTR 18.3% below target. Mixed into blend R03–R07.',
  },
  {
    batch_code: 'DEV-W-02-R08',
    date: '2026-06-03',
    estate: 'Suan Saket',
    process_description: 'Washed — Field Blend',
    green_weight_in_g: 400,
    moisture_pct: null,
    charge_temp_c: 192.5,
    tp_temp_c: 103.3,  tp_time_seconds: 90,
    yellow_temp_c: 152.7, yellow_time_seconds: 521,
    first_crack_temp_c: 186.6, first_crack_time_seconds: 788, ror_first_crack: 9,
    eject_temp_c: 198.0, total_time_seconds: 908, ror_eject: '3 — OK',
    development_time_seconds: 120, dtr: 13.2,
    roasted_weight_out_g: 341,
    status: 'completed',
    decision_notes: 'ADJUST — INTERNAL REFERENCE ONLY — Mixed lot roast. OE-SS-26-W-02 (200g) + OE-SS-26-W-03 (200g). Not a qualifying roast for either lot. Anomalous curve (yellowing 8:41, ROR spike 9°C/min at 1C) likely caused by mixed lot moisture differential. Do not use for production profile decisions.',
  },
  {
    batch_code: 'DEV-W-02-R09',
    date: '2026-06-03',
    estate: 'Suan Saket',
    process_description: 'Washed — Field Blend',
    green_weight_in_g: 400,
    moisture_pct: null,
    charge_temp_c: 194.5,
    tp_temp_c: 105.9,  tp_time_seconds: 79,
    yellow_temp_c: 149.0, yellow_time_seconds: 397,
    first_crack_temp_c: 182.5, first_crack_time_seconds: 680, ror_first_crack: 7,
    eject_temp_c: 199.0, total_time_seconds: 861, ror_eject: '3 — OK',
    development_time_seconds: 181, dtr: 21.0,
    roasted_weight_out_g: 345,
    status: 'completed',
    decision_notes: 'ADJUST — Pending cupping. DTR TARGET HIT 21.0% — third roast to achieve target. First DTR-target roast on OE-SS-26-W-03 lot. Dev time 3:01 on target. Yellowing 6:37 solid. Charge 194.5°C above target. Eject 199°C above 195–197 target. No 2nd crack. Cup from 11 June 2026. If cup confirms — replicate with charge 190–192°C as R10.',
  },
];

async function run() {
  const client = await pool.connect();
  try {
    // ── 1. Apply migration 019 ──────────────────────────────────────────────
    console.log('Applying migration 019_dev_roast_fields…');
    await client.query(`
      ALTER TABLE ops.oec_roast_sessions
        ALTER COLUMN charge_temp_c TYPE DECIMAL(5,1) USING charge_temp_c::DECIMAL(5,1),
        ALTER COLUMN eject_temp_c  TYPE DECIMAL(5,1) USING eject_temp_c::DECIMAL(5,1);
    `).catch(err => {
      if (err.message.includes('cannot be cast')) throw err;
      console.log('  charge/eject columns already DECIMAL — skipping type change.');
    });

    await client.query(`
      ALTER TABLE ops.oec_roast_sessions
        ADD COLUMN IF NOT EXISTS estate                   VARCHAR(255),
        ADD COLUMN IF NOT EXISTS process_description      VARCHAR(255),
        ADD COLUMN IF NOT EXISTS moisture_pct             DECIMAL(4,1),
        ADD COLUMN IF NOT EXISTS tp_temp_c                DECIMAL(5,1),
        ADD COLUMN IF NOT EXISTS tp_time_seconds          INTEGER,
        ADD COLUMN IF NOT EXISTS yellow_temp_c            DECIMAL(5,1),
        ADD COLUMN IF NOT EXISTS yellow_time_seconds      INTEGER,
        ADD COLUMN IF NOT EXISTS first_crack_temp_c       DECIMAL(5,1),
        ADD COLUMN IF NOT EXISTS first_crack_time_seconds INTEGER,
        ADD COLUMN IF NOT EXISTS ror_first_crack          INTEGER,
        ADD COLUMN IF NOT EXISTS ror_eject                VARCHAR(50),
        ADD COLUMN IF NOT EXISTS decision_notes           TEXT;
    `);
    console.log('  Migration 019 applied.\n');

    // ── 2. Look up tenant + admin user ─────────────────────────────────────
    const { rows: [tenant] } = await client.query(
      `SELECT id FROM ops.oec_tenants ORDER BY created_at LIMIT 1`
    );
    if (!tenant) throw new Error('No tenant found in DB.');

    const { rows: [admin] } = await client.query(
      `SELECT id FROM ops.oec_users WHERE tenant_id = $1 AND role = 'admin' ORDER BY created_at LIMIT 1`,
      [tenant.id]
    );
    if (!admin) throw new Error('No admin user found for tenant.');

    console.log(`Tenant: ${tenant.id}`);
    console.log(`Admin:  ${admin.id}\n`);

    // ── 3. Insert sessions ─────────────────────────────────────────────────
    let inserted = 0;
    let skipped  = 0;

    for (const s of SESSIONS) {
      const startedAt = new Date(`${s.date}T05:00:00.000Z`); // noon Vientiane (UTC+7)
      const endedAt   = new Date(startedAt.getTime() + s.total_time_seconds * 1000);

      const { rowCount } = await client.query(
        `INSERT INTO ops.oec_roast_sessions (
          tenant_id, is_development, batch_code,
          green_weight_in_g, roasted_weight_out_g,
          charge_temp_c, eject_temp_c,
          total_time_seconds, development_time_seconds, dtr,
          status, started_at, ended_at,
          estate, process_description, moisture_pct,
          tp_temp_c, tp_time_seconds,
          yellow_temp_c, yellow_time_seconds,
          first_crack_temp_c, first_crack_time_seconds, ror_first_crack,
          ror_eject, decision_notes,
          created_by, updated_by
        ) VALUES (
          $1,  $2,  $3,
          $4,  $5,
          $6,  $7,
          $8,  $9,  $10,
          $11, $12, $13,
          $14, $15, $16,
          $17, $18,
          $19, $20,
          $21, $22, $23,
          $24, $25,
          $26, $26
        ) ON CONFLICT (batch_code) DO NOTHING`,
        [
          tenant.id, true, s.batch_code,
          s.green_weight_in_g, s.roasted_weight_out_g,
          s.charge_temp_c, s.eject_temp_c,
          s.total_time_seconds, s.development_time_seconds, s.dtr,
          s.status, startedAt, endedAt,
          s.estate, s.process_description, s.moisture_pct,
          s.tp_temp_c, s.tp_time_seconds,
          s.yellow_temp_c, s.yellow_time_seconds,
          s.first_crack_temp_c, s.first_crack_time_seconds, s.ror_first_crack,
          s.ror_eject, s.decision_notes,
          admin.id,
        ]
      );

      if (rowCount > 0) {
        console.log(`  ✓ Inserted ${s.batch_code}`);
        inserted++;
      } else {
        console.log(`  - Skipped ${s.batch_code} (already exists)`);
        skipped++;
      }
    }

    console.log(`\nDone: ${inserted} inserted, ${skipped} skipped.`);
  } catch (err) {
    console.error('\nError:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

run();
