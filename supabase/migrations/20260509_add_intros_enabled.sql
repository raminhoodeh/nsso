-- Migration: Add intros_enabled boolean flag to profiles
-- Controls whether the Intros chip switcher appears on the public profile

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS intros_enabled BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN profiles.intros_enabled IS 'When true, shows the Intros bio chip switcher on the public profile. When false, only the default bio is shown.';
