-- Seed fake data for "My nsso" testing (Fixed for Existing Users)
-- usage: Run this in your Supabase SQL Editor

DO $$
DECLARE
    target_email TEXT := 'raminhoodeh@gmail.com';
    target_user_id UUID;
    target_user_id_2 UUID;
    
    -- Fake User Emails
    email_1 TEXT := 'fake1@example.com';
    email_2 TEXT := 'fake2@example.com';
    email_3 TEXT := 'fake3@example.com';
    email_4 TEXT := 'fake4@example.com';

    -- Fake User IDs (to be resolved)
    fake_user_1_id UUID;
    fake_user_2_id UUID;
    fake_user_3_id UUID;
    fake_user_4_id UUID;
BEGIN
    -- 1. Get the ID of the target user (Ramin)
    SELECT id INTO target_user_id FROM auth.users WHERE email = target_email;

    IF target_user_id IS NULL THEN
        RAISE NOTICE 'Target user % not found. Please ensure the user exists.', target_email;
        RETURN;
    END IF;

    -----------------------------------------------------------------------
    -- Helper Logic to Search or Create Fake User 1
    -----------------------------------------------------------------------
    SELECT id INTO fake_user_1_id FROM auth.users WHERE email = email_1;
    IF fake_user_1_id IS NULL THEN
        fake_user_1_id := gen_random_uuid();
        INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at)
        VALUES (fake_user_1_id, email_1, '$2a$10$dummyhashdummyhashdummyhashdummyhashdummyhash', now());
    END IF;
    -- Ensure public.users entry
    INSERT INTO public.users (id, email, username, user_type)
    VALUES (fake_user_1_id, email_1, 'alice_wonder', 'standard')
    ON CONFLICT (id) DO NOTHING;


    -----------------------------------------------------------------------
    -- Helper Logic to Search or Create Fake User 2
    -----------------------------------------------------------------------
    SELECT id INTO fake_user_2_id FROM auth.users WHERE email = email_2;
    IF fake_user_2_id IS NULL THEN
        fake_user_2_id := gen_random_uuid();
        INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at)
        VALUES (fake_user_2_id, email_2, '$2a$10$dummyhashdummyhashdummyhashdummyhashdummyhash', now());
    END IF;
    INSERT INTO public.users (id, email, username, user_type)
    VALUES (fake_user_2_id, email_2, 'bob_builder', 'premium')
    ON CONFLICT (id) DO NOTHING;


    -----------------------------------------------------------------------
    -- Helper Logic to Search or Create Fake User 3
    -----------------------------------------------------------------------
    SELECT id INTO fake_user_3_id FROM auth.users WHERE email = email_3;
    IF fake_user_3_id IS NULL THEN
        fake_user_3_id := gen_random_uuid();
        INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at)
        VALUES (fake_user_3_id, email_3, '$2a$10$dummyhashdummyhashdummyhashdummyhashdummyhash', now());
    END IF;
    INSERT INTO public.users (id, email, username, user_type)
    VALUES (fake_user_3_id, email_3, 'charlie_chef', 'standard')
    ON CONFLICT (id) DO NOTHING;


    -----------------------------------------------------------------------
    -- Helper Logic to Search or Create Fake User 4
    -----------------------------------------------------------------------
    SELECT id INTO fake_user_4_id FROM auth.users WHERE email = email_4;
    IF fake_user_4_id IS NULL THEN
        fake_user_4_id := gen_random_uuid();
        INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at)
        VALUES (fake_user_4_id, email_4, '$2a$10$dummyhashdummyhashdummyhashdummyhashdummyhash', now());
    END IF;
    INSERT INTO public.users (id, email, username, user_type)
    VALUES (fake_user_4_id, email_4, 'diana_designer', 'premium')
    ON CONFLICT (id) DO NOTHING;

    -----------------------------------------------------------------------
    -- Update Profiles (Upsert using the IDs we now confirmed)
    -----------------------------------------------------------------------
    INSERT INTO public.profiles (user_id, full_name, bio, headline, profile_pic_url)
    VALUES
        (fake_user_1_id, 'Alice Wonderland', 'Curious explorer based in London.', 'Explorer', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice'),
        (fake_user_2_id, 'Bob Builder', 'Always building things in NY.', 'Builder', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bob'),
        (fake_user_3_id, 'Charlie Chef', 'Cooking up a storm in Paris.', 'Head Chef', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie'),
        (fake_user_4_id, 'Diana Prince', 'Designing the future.', 'Designer', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Diana')
    ON CONFLICT (user_id) DO UPDATE
    SET profile_pic_url = EXCLUDED.profile_pic_url, full_name = EXCLUDED.full_name;


    -----------------------------------------------------------------------
    -- Reset Connections for Target User
    -----------------------------------------------------------------------
    -- 1. Clear old generic connections for the target user to maintain clean state
    DELETE FROM public.my_nsso WHERE user_id = target_user_id;

    -- 2. Insert new connections
    INSERT INTO public.my_nsso (user_id, connected_user_id, date_met, location_name, location_lat, location_long, notes)
    VALUES
        -- Recent meet (today)
        (target_user_id, fake_user_1_id, now(), 'Tech Conference 2026', 51.5074, -0.1278, 'Met at the registration booth. Interested in AI.'),
        
        -- Yesterday
        (target_user_id, fake_user_2_id, now() - INTERVAL '1 day', 'Coffee Shop', 40.7128, -74.0060, 'Great chat about infrastructure.'),
        
        -- Last Month
        (target_user_id, fake_user_3_id, now() - INTERVAL '1 month', 'Paris trip', 48.8566, 2.3522, 'Delicious food tour guide.'),
        
        -- Last Year
        (target_user_id, fake_user_4_id, now() - INTERVAL '3 months', 'Design Workshop', null, null, 'Shared some portfolio tips.')
    ON CONFLICT (user_id, connected_user_id) DO UPDATE 
    SET notes = EXCLUDED.notes, location_name = EXCLUDED.location_name;

    -- 3. Also create/update the reverse connections (Optional, but good for completeness)
    INSERT INTO public.my_nsso (user_id, connected_user_id, date_met, location_name, location_lat, location_long)
    VALUES
        (fake_user_1_id, target_user_id, now(), 'Tech Conference 2026', 51.5074, -0.1278),
        (fake_user_2_id, target_user_id, now() - INTERVAL '1 day', 'Coffee Shop', 40.7128, -74.0060),
        (fake_user_3_id, target_user_id, now() - INTERVAL '1 month', 'Paris trip', 48.8566, 2.3522),
        (fake_user_4_id, target_user_id, now() - INTERVAL '3 months', 'Design Workshop', null, null)
    ON CONFLICT (user_id, connected_user_id) DO NOTHING;

    -----------------------------------------------------------------------
    -- TARGET USER 2: Troy (troy@nsso.me)
    -----------------------------------------------------------------------
    SELECT id INTO target_user_id_2 FROM auth.users WHERE email = 'troy@nsso.me';

    IF target_user_id_2 IS NOT NULL THEN
        -- 1. Clear old connections
        DELETE FROM public.my_nsso WHERE user_id = target_user_id_2;

        -- 2. Insert new connections (Same as Ramin's)
        INSERT INTO public.my_nsso (user_id, connected_user_id, date_met, location_name, location_lat, location_long, notes)
        VALUES
            (target_user_id_2, fake_user_1_id, now(), 'Tech Conference 2026', 51.5074, -0.1278, 'Met at the registration booth. Interested in AI.'),
            (target_user_id_2, fake_user_2_id, now() - INTERVAL '1 day', 'Coffee Shop', 40.7128, -74.0060, 'Great chat about infrastructure.'),
            (target_user_id_2, fake_user_3_id, now() - INTERVAL '1 month', 'Paris trip', 48.8566, 2.3522, 'Delicious food tour guide.'),
            (target_user_id_2, fake_user_4_id, now() - INTERVAL '3 months', 'Design Workshop', null, null, 'Shared some portfolio tips.')
        ON CONFLICT (user_id, connected_user_id) DO UPDATE 
        SET notes = EXCLUDED.notes, location_name = EXCLUDED.location_name;

        -- 3. Reverse connections (Optional, fake users -> Troy)
        INSERT INTO public.my_nsso (user_id, connected_user_id, date_met, location_name, location_lat, location_long)
        VALUES
            (fake_user_1_id, target_user_id_2, now(), 'Tech Conference 2026', 51.5074, -0.1278),
            (fake_user_2_id, target_user_id_2, now() - INTERVAL '1 day', 'Coffee Shop', 40.7128, -74.0060),
            (fake_user_3_id, target_user_id_2, now() - INTERVAL '1 month', 'Paris trip', 48.8566, 2.3522),
            (fake_user_4_id, target_user_id_2, now() - INTERVAL '3 months', 'Design Workshop', null, null)
        ON CONFLICT (user_id, connected_user_id) DO NOTHING;

        RAISE NOTICE 'Seed data also added for troy@nsso.me';
    ELSE
        RAISE NOTICE 'User troy@nsso.me not found, skipping.';
    END IF;

    RAISE NOTICE 'Seed data fixed and refreshed successfully for %', target_email;

END $$;
