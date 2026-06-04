-- Upgrade charge/eject temp precision from INTEGER to DECIMAL for roast accuracy
ALTER TABLE ops.oec_roast_sessions
  ALTER COLUMN charge_temp_c TYPE DECIMAL(5,1) USING charge_temp_c::DECIMAL(5,1),
  ALTER COLUMN eject_temp_c  TYPE DECIMAL(5,1) USING eject_temp_c::DECIMAL(5,1);

-- Development roast detail columns (all nullable — production sessions don't use them)
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
