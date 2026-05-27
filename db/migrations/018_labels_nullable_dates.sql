ALTER TABLE ops.oec_labels
  ALTER COLUMN roast_date_start      DROP NOT NULL,
  ALTER COLUMN roast_date_end        DROP NOT NULL,
  ALTER COLUMN ready_to_brew_date    DROP NOT NULL,
  ALTER COLUMN best_consumed_by_date DROP NOT NULL;
