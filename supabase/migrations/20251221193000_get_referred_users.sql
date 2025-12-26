-- Migration: Add function to get details of referred users
-- Created: 2025-12-21
-- Description: Returns a list of users referred by the current user, with profile and status info

CREATE OR REPLACE FUNCTION get_referred_users_details()
RETURNS TABLE (
  full_name TEXT,
  username TEXT,
  status TEXT,
  activated_at TIMESTAMPTZ,
  is_premium BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.full_name,
    u.username,
    r.subscription_status AS status,
    r.created_at AS activated_at,
    u.is_premium
  FROM public.referrals r
  JOIN public.users u ON r.referred_user_id = u.id
  LEFT JOIN public.profiles p ON r.referred_user_id = p.user_id
  WHERE r.referrer_user_id = auth.uid()
  ORDER BY r.created_at DESC;
END;
$$;
