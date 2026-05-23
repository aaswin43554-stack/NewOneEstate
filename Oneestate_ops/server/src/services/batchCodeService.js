const pool = require('../config/db');

const PROCESS_CODE = { Washed: 'W', Honey: 'H', Natural: 'N', Anaerobic: 'AN' };

async function generateBatchCode({ is_development, tenant_id, allocation_id, allocation_code, process }) {
  if (is_development) {
    const pc = PROCESS_CODE[process];
    const { rows } = await pool.query(
      `SELECT COUNT(*) FROM oec_roast_sessions
       WHERE tenant_id = $1 AND is_development = true AND batch_code LIKE $2`,
      [tenant_id, `DEV-${pc}-%`]
    );
    const seq = parseInt(rows[0].count) + 1;
    return `DEV-${pc}-R${String(seq).padStart(2, '0')}`;
  }
  const pc = PROCESS_CODE[process];
  const numStr = allocation_code.split('-').pop();
  const allocNumStr = String(parseInt(numStr)).padStart(3, '0');
  const { rows } = await pool.query(
    `SELECT COUNT(*) FROM oec_roast_sessions
     WHERE allocation_id = $1 AND is_development = false`,
    [allocation_id]
  );
  const seq = parseInt(rows[0].count) + 1;
  return `ALLOC-${allocNumStr}-${pc}-B${String(seq).padStart(2, '0')}`;
}

module.exports = { generateBatchCode, PROCESS_CODE };
