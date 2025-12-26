-- Migration: Add Earnings and Referral Tracking
-- Created: 2025-12-21
-- Description: Adds referral code system, earnings tracking, and PayPal payout fields

-- ============================================
-- 1. ADD COLUMNS TO USERS TABLE
-- ============================================

-- Add referral_code (unique identifier for each user's referral link)
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE;

-- Add paypal_me_slug (user's PayPal.me username for payouts)
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS paypal_me_slug TEXT;

-- Add referred_by_code (tracks which referral code this user used during signup)
ALTER TABLE public.users 
ADD COLUMN IF NOT EXISTS referred_by_code TEXT;

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON public.users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON public.users(referred_by_code);

-- ============================================
-- 2. CREATE REFERRALS TRACKING TABLE
-- ============================================

CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  referrer_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referred_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  referral_code TEXT NOT NULL,
  subscription_status TEXT DEFAULT 'pending', -- pending, active, cancelled
  created_at TIMESTAMPTZ DEFAULT NOW(),
  activated_at TIMESTAMPTZ,
  CONSTRAINT unique_referred_user UNIQUE(referred_user_id)
);

-- Create indexes for efficient queries
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON public.referrals(referrer_user_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status ON public.referrals(subscription_status);
CREATE INDEX IF NOT EXISTS idx_referrals_code ON public.referrals(referral_code);

-- ============================================
-- 3. ROW LEVEL SECURITY FOR REFERRALS
-- ============================================

ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;

-- Users can only see their own referrals (where they are the referrer)
CREATE POLICY "referrals_select_own" ON public.referrals 
  FOR SELECT USING (auth.uid() = referrer_user_id);

-- System can insert referrals (for signup flow)
CREATE POLICY "referrals_insert_system" ON public.referrals 
  FOR INSERT WITH CHECK (true);

-- ============================================
-- 4. REFERRAL CODE GENERATION FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION generate_referral_code()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_code TEXT;
  code_exists BOOLEAN;
  attempts INTEGER := 0;
  max_attempts INTEGER := 100;
BEGIN
  LOOP
    -- Generate code in format: NEWCV + 3 random digits (000-999)
    new_code := 'NEWCV' || LPAD(FLOOR(RANDOM() * 1000)::TEXT, 3, '0');
    
    -- Check if code already exists
    SELECT EXISTS(SELECT 1 FROM public.users WHERE referral_code = new_code) INTO code_exists;
    
    -- Exit loop if code is unique
    EXIT WHEN NOT code_exists;
    
    -- Prevent infinite loop
    attempts := attempts + 1;
    IF attempts >= max_attempts THEN
      RAISE EXCEPTION 'Failed to generate unique referral code after % attempts', max_attempts;
    END IF;
  END LOOP;
  
  RETURN new_code;
END;
$$;

-- ============================================
-- 5. UPDATE USER CREATION TRIGGER
-- ============================================

-- Drop existing trigger and function
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Recreate with referral code generation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_username TEXT;
  new_ref_code TEXT;
BEGIN
  -- Generate random username
  new_username := substring(md5(random()::text) from 1 for 8);
  
  -- Generate unique referral code
  new_ref_code := generate_referral_code();
  
  -- Insert into users table with referral code
  INSERT INTO public.users (id, email, auth_provider, username, referral_code)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_app_meta_data->>'provider', 'email'),
    new_username,
    new_ref_code
  );
  
  -- Create profile entry
  INSERT INTO public.profiles (user_id) VALUES (NEW.id);
  
  RETURN NEW;
END;
$$;

-- Recreate trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 6. HELPER FUNCTION: GET USER EARNINGS STATS
-- ============================================

CREATE OR REPLACE FUNCTION get_user_earnings_stats(user_uuid UUID)
RETURNS TABLE (
  referral_code TEXT,
  active_referrals BIGINT,
  expected_earnings NUMERIC,
  paypal_me_slug TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  premium_price NUMERIC := 8.00;
  commission_rate NUMERIC := 0.40;
BEGIN
  RETURN QUERY
  SELECT 
    u.referral_code,
    COUNT(r.id) FILTER (WHERE r.subscription_status = 'active') AS active_referrals,
    (COUNT(r.id) FILTER (WHERE r.subscription_status = 'active') * premium_price * commission_rate) AS expected_earnings,
    u.paypal_me_slug
  FROM public.users u
  LEFT JOIN public.referrals r ON r.referrer_user_id = u.id
  WHERE u.id = user_uuid
  GROUP BY u.id, u.referral_code, u.paypal_me_slug;
END;
$$;

-- ============================================
-- 7. BACKFILL REFERRAL CODES FOR EXISTING USERS
-- ============================================

-- Generate referral codes for any existing users who don't have one
DO $$
DECLARE
  user_record RECORD;
BEGIN
  FOR user_record IN 
    SELECT id FROM public.users WHERE referral_code IS NULL
  LOOP
    UPDATE public.users 
    SET referral_code = generate_referral_code()
    WHERE id = user_record.id;
  END LOOP;
END $$;
