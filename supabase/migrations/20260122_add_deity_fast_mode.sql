-- Add deity_fast_mode column to users table
-- This column stores the user's preference for Deity auto-apply mode

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS deity_fast_mode BOOLEAN DEFAULT false;

-- Add comment for documentation
COMMENT ON COLUMN public.users.deity_fast_mode IS 'User preference for Deity to auto-apply profile suggestions without review';
