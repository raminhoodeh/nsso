-- Seed fake data for "My nsso" testing
-- usage: Run this in your Supabase SQL Editor

DO $$
DECLARE
    target_email TEXT := 'raminhoodeh@gmail.com';
    target_user_id UUID;
    
    -- Variables for fake users
    fake_user_1_id UUID := gen_random_uuid();
    fake_user_2_id UUID := gen_random_uuid();
    fake_user_3_id UUID := gen_random_uuid();
    fake_user_4_id UUID := gen_random_uuid();
BEGIN
    -- 1. Get the ID of the target user (Ramin)
    SELECT id INTO target_user_id FROM auth.users WHERE email = target_email;

    IF target_user_id IS NULL THEN
        RAISE NOTICE 'Target user % not found. Please ensure the user exists.', target_email;
        RETURN;
    END IF;

    -- 2. Create fake users in auth.users (required for foreign key)
    -- We use a dummy password hash (bcrypt)
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at)
    VALUES 
        (fake_user_1_id, 'fake1@example.com', '$2a$10$dummyhashdummyhashdummyhashdummyhashdummyhash', now()),
        (fake_user_2_id, 'fake2@example.com', '$2a$10$dummyhashdummyhashdummyhashdummyhashdummyhash', now()),
        (fake_user_3_id, 'fake3@example.com', '$2a$10$dummyhashdummyhashdummyhashdummyhashdummyhash', now()),
        (fake_user_4_id, 'fake4@example.com', '$2a$10$dummyhashdummyhashdummyhashdummyhashdummyhash', now())
    ON CONFLICT (id) DO NOTHING; -- In case we run multiple times (though IDs are random, email might conflict if not unique)

    -- 3. Create fake users in public.users
    INSERT INTO public.users (id, email, username, user_type)
    VALUES
        (fake_user_1_id, 'fake1@example.com', 'alice_wonder', 'standard'),
        (fake_user_2_id, 'fake2@example.com', 'bob_builder', 'premium'),
        (fake_user_3_id, 'fake3@example.com', 'charlie_chef', 'standard'),
        (fake_user_4_id, 'fake4@example.com', 'diana_designer', 'premium')
    ON CONFLICT (id) DO NOTHING;

    -- 4. Create fake profiles in public.profiles
    INSERT INTO public.profiles (user_id, full_name, bio, headline)
    VALUES
        (fake_user_1_id, 'Alice Wonderland', 'Curious explorer based in London.', 'Explorer'),
        (fake_user_2_id, 'Bob Builder', 'Always building things in NY.', 'Builder'),
        (fake_user_3_id, 'Charlie Chef', 'Cooking up a storm in Paris.', 'Head Chef'),
        (fake_user_4_id, 'Diana Prince', 'Designing the future.', 'Designer')
    ON CONFLICT (user_id) DO NOTHING;

    -- 5. Create connections for Ramin (My nsso)
    -- Connection 1: Improved logic to avoid conflict if re-run
    
    -- Clear existing test connections to avoid duplicates if run multiple times? 
    -- Or just use ON CONFLICT DO NOTHING. The table has (user_id, connected_user_id) unique constraint?
    -- checking definition: PRIMARY KEY (user_id, connected_user_id)
    
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
    SET notes = EXCLUDED.notes;

    -- 6. Also create the reverse connections (optional, but realistic)
    INSERT INTO public.my_nsso (user_id, connected_user_id, date_met, location_name, location_lat, location_long)
    VALUES
        (fake_user_1_id, target_user_id, now(), 'Tech Conference 2026', 51.5074, -0.1278),
        (fake_user_2_id, target_user_id, now() - INTERVAL '1 day', 'Coffee Shop', 40.7128, -74.0060),
        (fake_user_3_id, target_user_id, now() - INTERVAL '1 month', 'Paris trip', 48.8566, 2.3522),
        (fake_user_4_id, target_user_id, now() - INTERVAL '3 months', 'Design Workshop', null, null)
    ON CONFLICT (user_id, connected_user_id) DO NOTHING;

    RAISE NOTICE 'Seed data created successfully for %', target_email;

END $$;
