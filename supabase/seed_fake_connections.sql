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
    
    -- 0. CLEANUP: Remove generic/test connections for this user to avoid duplicates/messy data
    -- We delete connections where the connected user has a 'fake%' email to be safe, 
    -- OR just clear all 'my_nsso' for this user if it's a dev environment.
    -- For safety, let's just delete the ones we are about to create? 
    -- Actually, to fix the user's view, we should clear the table for this user.
    -- CAUTION: This wipes 'My nsso' for Ramin. Assuming this is desired for testing.
    DELETE FROM public.my_nsso WHERE user_id = target_user_id;

    -- 2. Create fake users in auth.users (required for foreign key)
    -- We use a dummy password hash (bcrypt)
    INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at)
    VALUES 
        (fake_user_1_id, 'fake1@example.com', '$2a$10$dummyhashdummyhashdummyhashdummyhashdummyhash', now()),
        (fake_user_2_id, 'fake2@example.com', '$2a$10$dummyhashdummyhashdummyhashdummyhashdummyhash', now()),
        (fake_user_3_id, 'fake3@example.com', '$2a$10$dummyhashdummyhashdummyhashdummyhashdummyhash', now()),
        (fake_user_4_id, 'fake4@example.com', '$2a$10$dummyhashdummyhashdummyhashdummyhashdummyhash', now())
    ON CONFLICT (id) DO NOTHING;

    -- 3. Create fake users in public.users
    INSERT INTO public.users (id, email, username, user_type)
    VALUES
        (fake_user_1_id, 'fake1@example.com', 'alice_wonder', 'standard'),
        (fake_user_2_id, 'fake2@example.com', 'bob_builder', 'premium'),
        (fake_user_3_id, 'fake3@example.com', 'charlie_chef', 'standard'),
        (fake_user_4_id, 'fake4@example.com', 'diana_designer', 'premium')
    ON CONFLICT (id) DO NOTHING;

    -- 4. Create fake profiles in public.profiles (Corrected Schema with Pics)
    INSERT INTO public.profiles (user_id, full_name, bio, headline, profile_pic_url)
    VALUES
        (fake_user_1_id, 'Alice Wonderland', 'Curious explorer based in London.', 'Explorer', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Alice'),
        (fake_user_2_id, 'Bob Builder', 'Always building things in NY.', 'Builder', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Bob'),
        (fake_user_3_id, 'Charlie Chef', 'Cooking up a storm in Paris.', 'Head Chef', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Charlie'),
        (fake_user_4_id, 'Diana Prince', 'Designing the future.', 'Designer', 'https://api.dicebear.com/7.x/avataaars/svg?seed=Diana')
    ON CONFLICT (user_id) DO UPDATE
    SET profile_pic_url = EXCLUDED.profile_pic_url, full_name = EXCLUDED.full_name;

    -- 5. Create connections for Ramin (My nsso)
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

    -- 6. Also create the reverse connections
    INSERT INTO public.my_nsso (user_id, connected_user_id, date_met, location_name, location_lat, location_long)
    VALUES
        (fake_user_1_id, target_user_id, now(), 'Tech Conference 2026', 51.5074, -0.1278),
        (fake_user_2_id, target_user_id, now() - INTERVAL '1 day', 'Coffee Shop', 40.7128, -74.0060),
        (fake_user_3_id, target_user_id, now() - INTERVAL '1 month', 'Paris trip', 48.8566, 2.3522),
        (fake_user_4_id, target_user_id, now() - INTERVAL '3 months', 'Design Workshop', null, null)
    ON CONFLICT (user_id, connected_user_id) DO NOTHING;

    RAISE NOTICE 'Seed data refreshed successfully for % (Old connections cleared)', target_email;

END $$;
