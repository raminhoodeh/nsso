-- Migration to remove Intros feature columns
ALTER TABLE profiles 
DROP COLUMN IF EXISTS intros_enabled,
DROP COLUMN IF EXISTS intros_bios,
DROP COLUMN IF EXISTS intros_keys_enabled;
