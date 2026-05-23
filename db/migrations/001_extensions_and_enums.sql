CREATE SCHEMA IF NOT EXISTS ops;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE ops.user_role       AS ENUM ('admin', 'roaster', 'viewer');
CREATE TYPE ops.lot_process     AS ENUM ('Washed', 'Honey', 'Natural', 'Anaerobic');
CREATE TYPE ops.movement_type   AS ENUM ('reservation', 'roast_consumption', 'write_off');
CREATE TYPE ops.allocation_state AS ENUM (
  'upcoming', 'open_for_requests', 'closed',
  'roasting_in_progress', 'resting', 'dispatched', 'archived'
);
CREATE TYPE ops.roast_status AS ENUM (
  'in_progress', 'completed', 'approved_for_bagging', 'rejected'
);
