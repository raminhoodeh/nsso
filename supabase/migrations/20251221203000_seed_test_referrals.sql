-- Seed Test Referrals for raminhoodeh@gmail.com
-- Run this in the Supabase SQL Editor

DO $$
DECLARE
    referrer_uuid UUID;
    new_user_uuid UUID;
    REFERRER_EMAIL TEXT := 'raminhoodeh@gmail.com';
    i INTEGER;
    
    -- Config for test users
    test_emails TEXT[] := ARRAY[
        'alice.wonderland@example.com', 
        'bob.builder@example.com', 
        'charlie.chocolate@example.com', 
        'david.bowie@example.com', 
        'eve.polastri@example.com'
    ];
    test_names TEXT[] := ARRAY[
        'Alice Wonderland', 
        'Bob Builder', 
        'Charlie Bucket', 
        'David Bowie', 
        'Eve Polastri'
    ];
BEGIN
    -- 1. Get the Referrer ID
    SELECT id INTO referrer_uuid FROM auth.users WHERE email = REFERRER_EMAIL;

    IF referrer_uuid IS NULL THEN
        RAISE EXCEPTION 'User % not found in auth.users', REFERRER_EMAIL;
    END IF;

    RAISE NOTICE 'Found Referrer: % (ID: %)', REFERRER_EMAIL, referrer_uuid;

    -- 2. Create 5 Test Users
    FOR i IN 1..5 LOOP
        -- Check if user exists, if so, skip or get ID
        SELECT id INTO new_user_uuid FROM auth.users WHERE email = test_emails[i];
        
        IF new_user_uuid IS NULL THEN
            new_user_uuid := gen_random_uuid();
            
            -- Insert into auth.users (This should trigger handle_new_user -> public.users)
            INSERT INTO auth.users (
                id,
                email,
                encrypted_password,
                email_confirmed_at,
                raw_app_meta_data,
                raw_user_meta_data,
                created_at,
                updated_at,
                instance_id,
                aud,
                role
            ) VALUES (
                new_user_uuid,
                test_emails[i],
                extensions.crypt('password123', extensions.gen_salt('bf')), -- Fake password
                NOW(),
                '{"provider": "email", "providers": ["email"]}'::jsonb,
                '{}'::jsonb,
                NOW() - (i * INTERVAL '20 days'), -- Staggered sign-up dates
                NOW(),
                '00000000-0000-0000-0000-000000000000',
                'authenticated',
                'authenticated'
            );
            
            RAISE NOTICE 'Created auth user: %', test_emails[i];
        ELSE
            RAISE NOTICE 'User % already exists, using existing ID', test_emails[i];
        END IF;

        -- 3. Ensure they have a profile Name (update it just in case)
        UPDATE public.profiles 
        SET full_name = test_names[i]
        WHERE user_id = new_user_uuid;

        -- 4. Set their "is_premium" status (Mix of Active/Inactive)
        -- Users 1, 2, 4 are PREMIUM. Users 3, 5 are FREE.
        UPDATE public.users
        SET is_premium = (CASE WHEN i IN (1, 2, 4) THEN true ELSE false END)
        WHERE id = new_user_uuid;
        
        -- 5. Create/Update Referral Record
        -- Check if referral exists
        IF NOT EXISTS (SELECT 1 FROM public.referrals WHERE referred_user_id = new_user_uuid) THEN
            INSERT INTO public.referrals (
                referrer_user_id,
                referred_user_id,
                referral_code,
                subscription_status,
                created_at,
                activated_at
            ) VALUES (
                referrer_uuid,
                new_user_uuid,
                'RAMINCODE', -- Fake code used
                (CASE WHEN i IN (1, 2, 4) THEN 'active' ELSE 'pending' END),
                NOW() - (i * INTERVAL '20 days'),
                (CASE WHEN i IN (1, 2, 4) THEN NOW() - (i * INTERVAL '20 days') ELSE NULL END)
            );
            RAISE NOTICE 'Created referral link for %', test_names[i];
        END IF;

    END LOOP;

END $$;
