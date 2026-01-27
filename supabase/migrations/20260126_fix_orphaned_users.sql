-- Migration: Fix Orphaned Users (Rescue Troy and others)
-- Description: Finds users in auth.users who are missing from public.users/profiles and restores them.

-- 1. Rescue Orphaned Users into public.users
INSERT INTO public.users (id, email, username, created_at)
SELECT 
    au.id,
    au.email,
    -- Generates a username from email (part before @) or random hash if conflict, to be safe we use a mix
    COALESCE(
        au.raw_user_meta_data->>'username', 
        substring(au.email from '(.*)@') || '_' || substring(md5(random()::text) from 1 for 4)
    ),
    au.created_at
FROM auth.users au
LEFT JOIN public.users pu ON au.id = pu.id
WHERE pu.id IS NULL;

-- 2. Rescue Orphaned Profiles (Ensure every public.user has a profile)
INSERT INTO public.profiles (user_id, full_name, profile_pic_url)
SELECT 
    u.id, 
    -- Try to get name from metadata, else username
    COALESCE(
        au.raw_user_meta_data->>'full_name', 
        au.raw_user_meta_data->>'name', 
        u.username
    ),
    au.raw_user_meta_data->>'avatar_url'
FROM public.users u
JOIN auth.users au ON u.id = au.id
LEFT JOIN public.profiles p ON u.id = p.user_id
WHERE p.user_id IS NULL;
