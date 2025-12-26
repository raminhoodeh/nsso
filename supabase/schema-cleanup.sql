-- =============================================
-- CLEANUP SCRIPT - Run this to clear leftover data
-- =============================================

-- Delete any orphaned records in public.users (users without matching auth.users)
DELETE FROM public.profiles;
DELETE FROM public.users;

-- Drop and recreate the trigger with better error handling
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- Simpler trigger function
CREATE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO public.users (id, email, auth_provider, username)
  VALUES (
    NEW.id,
    NEW.email,
    'email',
    substring(md5(random()::text) from 1 for 8)
  );
  
  INSERT INTO public.profiles (user_id) VALUES (NEW.id);
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE LOG 'Error in handle_new_user: %', SQLERRM;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
