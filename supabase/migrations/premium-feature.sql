-- NSSO Database Schema Update for Premium Feature
-- Run this in Supabase SQL Editor to add subscription columns

-- Add new columns to subscriptions table
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS cancel_at_period_end BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS current_period_end TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS original_username TEXT;

-- Allow service role to update users (for webhook)
-- Allow service role to update users (for webhook)
DROP POLICY IF EXISTS "service_role_users_update" ON public.users;
CREATE POLICY "service_role_users_update" ON public.users
  FOR UPDATE USING (true);

-- Add unique constraint to user_id to allow upserting subscriptions
ALTER TABLE public.subscriptions 
ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);
