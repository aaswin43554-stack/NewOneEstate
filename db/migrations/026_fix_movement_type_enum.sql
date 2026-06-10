-- Add missing movement types that the application actually uses
ALTER TYPE ops.movement_type ADD VALUE IF NOT EXISTS 'sales';
ALTER TYPE ops.movement_type ADD VALUE IF NOT EXISTS 'profile_development';
ALTER TYPE ops.movement_type ADD VALUE IF NOT EXISTS 'personal_use';
