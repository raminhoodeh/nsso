-- =============================================
-- NSSO DATABASE SCHEMA - STEP 3: TRIGGER
-- Run this AFTER Step 2 succeeds
-- =============================================

-- Create trigger function for new user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  new_username TEXT;
BEGIN
  -- Generate random 8-char username
  new_username := substring(md5(random()::text) from 1 for 8);
  
  -- Insert into users table
  INSERT INTO public.users (id, email, auth_provider, username)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_app_meta_data->>'provider', 'email'),
    new_username
  );
  
  -- Create empty profile
  INSERT INTO public.profiles (user_id) VALUES (NEW.id);
  
  RETURN NEW;
END;
$$;

-- Drop existing trigger if any
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Create trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
