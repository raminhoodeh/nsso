-- UPDATED SEED DATA FOR NEWS FEED (VERSION 5)
-- Fixes broken image URLs for Notion Template and Design System.

DO $$
DECLARE
    -- Variables to hold User IDs
    user1_id UUID;
    user2_id UUID;
    user3_id UUID;
    user4_id UUID;
    user5_id UUID;
BEGIN
    -- HELPER: Find or Create User 1 (Sarah)
    SELECT id INTO user1_id FROM auth.users WHERE email = 'sarah@example.com';
    IF user1_id IS NULL THEN
        user1_id := gen_random_uuid();
        INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, confirmation_token, email_change, email_change_token_new, recovery_token)
        VALUES (user1_id, 'authenticated', 'authenticated', 'sarah@example.com', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, now(), now(), NULL, NULL, '', '', '', '');
    END IF;

    -- HELPER: Find or Create User 2 (Marcus)
    SELECT id INTO user2_id FROM auth.users WHERE email = 'marcus@example.com';
    IF user2_id IS NULL THEN
        user2_id := gen_random_uuid();
        INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, confirmation_token, email_change, email_change_token_new, recovery_token)
        VALUES (user2_id, 'authenticated', 'authenticated', 'marcus@example.com', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, now(), now(), NULL, NULL, '', '', '', '');
    END IF;

    -- HELPER: Find or Create User 3 (Elena)
    SELECT id INTO user3_id FROM auth.users WHERE email = 'elena@example.com';
    IF user3_id IS NULL THEN
        user3_id := gen_random_uuid();
        INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, confirmation_token, email_change, email_change_token_new, recovery_token)
        VALUES (user3_id, 'authenticated', 'authenticated', 'elena@example.com', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, now(), now(), NULL, NULL, '', '', '', '');
    END IF;

    -- HELPER: Find or Create User 4 (Jack)
    SELECT id INTO user4_id FROM auth.users WHERE email = 'jack@example.com';
    IF user4_id IS NULL THEN
        user4_id := gen_random_uuid();
        INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, confirmation_token, email_change, email_change_token_new, recovery_token)
        VALUES (user4_id, 'authenticated', 'authenticated', 'jack@example.com', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, now(), now(), NULL, NULL, '', '', '', '');
    END IF;

    -- HELPER: Find or Create User 5 (Amara)
    SELECT id INTO user5_id FROM auth.users WHERE email = 'amara@example.com';
    IF user5_id IS NULL THEN
        user5_id := gen_random_uuid();
        INSERT INTO auth.users (id, aud, role, email, email_confirmed_at, recovery_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, confirmation_token, email_change, email_change_token_new, recovery_token)
        VALUES (user5_id, 'authenticated', 'authenticated', 'amara@example.com', now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', false, now(), now(), NULL, NULL, '', '', '', '');
    END IF;


    -- 2. Create/Update Public Users (Upsert)
    
    -- User 1: Sarah
    INSERT INTO public.users (id, email, username, user_type, is_premium, created_at)
    VALUES (user1_id, 'sarah@example.com', 'sarahdesign', 'standard', true, now())
    ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, user_type = EXCLUDED.user_type, is_premium = EXCLUDED.is_premium;
    
    INSERT INTO public.profiles (user_id, full_name, headline, bio, profile_pic_url)
    VALUES (
        user1_id, 
        'Sarah Chen', 
        'Product Design Lead at Stripe', 
        'Building interfaces that feel like magic. Previously at Airbnb.', 
        'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&q=80&w=200&h=200'
    ) ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name, headline = EXCLUDED.headline, bio = EXCLUDED.bio, profile_pic_url = EXCLUDED.profile_pic_url;

    -- User 2: Marcus
    INSERT INTO public.users (id, email, username, user_type, is_premium, created_at)
    VALUES (user2_id, 'marcus@example.com', 'marcus_builds', 'standard', true, now())
    ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, user_type = EXCLUDED.user_type, is_premium = EXCLUDED.is_premium;
    
    INSERT INTO public.profiles (user_id, full_name, headline, bio, profile_pic_url)
    VALUES (
        user2_id, 
        'Marcus Rodriguez', 
        'Indie Developer & Founder', 
        'Shipping 12 startups in 12 months. Currently working on AI tools for creators.', 
        'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200&h=200'
    ) ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name, headline = EXCLUDED.headline, bio = EXCLUDED.bio, profile_pic_url = EXCLUDED.profile_pic_url;

    -- User 3: Elena
    INSERT INTO public.users (id, email, username, user_type, is_premium, created_at)
    VALUES (user3_id, 'elena@example.com', 'elenaai', 'standard', false, now())
    ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, user_type = EXCLUDED.user_type, is_premium = EXCLUDED.is_premium;
    
    INSERT INTO public.profiles (user_id, full_name, headline, bio, profile_pic_url)
    VALUES (
        user3_id, 
        'Dr. Elena Volkov', 
        'AI Research Scientist', 
        'Focusing on Large Language Models and alignment.', 
        'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&q=80&w=200&h=200'
    ) ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name, headline = EXCLUDED.headline, bio = EXCLUDED.bio, profile_pic_url = EXCLUDED.profile_pic_url;

    -- User 4: Jack
    INSERT INTO public.users (id, email, username, user_type, is_premium, created_at)
    VALUES (user4_id, 'jack@example.com', 'jackcodes', 'standard', false, now())
    ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, user_type = EXCLUDED.user_type, is_premium = EXCLUDED.is_premium;
    
    INSERT INTO public.profiles (user_id, full_name, headline, bio, profile_pic_url)
    VALUES (
        user4_id, 
        'Jack Smith', 
        'Senior Frontend Engineer', 
        'React, Next.js, and everything accessible.', 
        'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=200&h=200'
    ) ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name, headline = EXCLUDED.headline, bio = EXCLUDED.bio, profile_pic_url = EXCLUDED.profile_pic_url;

    -- User 5: Amara
    INSERT INTO public.users (id, email, username, user_type, is_premium, created_at)
    VALUES (user5_id, 'amara@example.com', 'amaraproduct', 'standard', true, now())
    ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, user_type = EXCLUDED.user_type, is_premium = EXCLUDED.is_premium;
    
    INSERT INTO public.profiles (user_id, full_name, headline, bio, profile_pic_url)
    VALUES (
        user5_id, 
        'Amara Okafor', 
        'VP of Product', 
        'Scaling teams and products.', 
        'https://images.unsplash.com/photo-1531123897727-8f129e1688ce?auto=format&fit=crop&q=80&w=200&h=200'
    ) ON CONFLICT (user_id) DO UPDATE SET full_name = EXCLUDED.full_name, headline = EXCLUDED.headline, bio = EXCLUDED.bio, profile_pic_url = EXCLUDED.profile_pic_url;


    -- 3. Create Feed Posts (Delete old for these users first to clean up)
    
    DELETE FROM public.feed_posts WHERE user_id IN (user1_id, user2_id, user3_id, user4_id, user5_id);

    -- Post 1: Manual text post from Sarah (2 hours ago)
    INSERT INTO public.feed_posts (user_id, type, content, created_at)
    VALUES (
        user1_id,
        'manual',
        'Just shipped a major redesign of our onboarding flow! 🚀 It''s amazing how much a few subtle animations can improve the user perception of speed. Check it out and let me know what you think!',
        now() - interval '2 hours'
    );

    -- Post 2: Daily Summary for Marcus (Ship 3 items) (5 hours ago)
    INSERT INTO public.feed_posts (user_id, type, content, metadata, created_at)
    VALUES (
        user2_id,
        'daily_summary',
        'Daily Profile Updates',
        jsonb_build_object(
            'projects', jsonb_build_array(
                jsonb_build_object(
                    'project_name', 'SaaS Analytics Dashboard',
                    'project_photo_url', 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&q=80&w=1000'
                )
            ),
            'products', jsonb_build_array(
                jsonb_build_object(
                    'name', 'Notion Startup Template',
                    'price', '$19',
                    -- CHANGED URL TO WORKING ONE
                    'image_url', 'https://images.unsplash.com/photo-1507925921958-8a62f3d1a50d?auto=format&fit=crop&q=80&w=1000'
                )
            ),
             'qualifications', jsonb_build_array(
                jsonb_build_object(
                    'qualification_name', 'Y Combinator Startup School',
                    'institution', 'Y Combinator'
                )
            )
        ),
        now() - interval '5 hours'
    );

    -- Post 3: Elena adds a qualification (single update as daily summary) (1 day ago)
    INSERT INTO public.feed_posts (user_id, type, content, metadata, created_at)
    VALUES (
        user3_id,
        'daily_summary',
        'Daily Profile Updates',
        jsonb_build_object(
            'qualifications', jsonb_build_array(
                jsonb_build_object(
                    'qualification_name', 'PhD in Computer Science',
                    'institution', 'Stanford University'
                )
            )
        ),
        now() - interval '1 day'
    );

    -- Post 4: Jack Manual Post (1 day ago)
    INSERT INTO public.feed_posts (user_id, type, content, created_at)
    VALUES (
        user4_id,
        'manual',
        'Anyone experimenting with the new React Compiler? The automatic memoization seems too good to be true, but early benchmarks are wild.',
        now() - interval '1 day 2 hours'
    );
    
    -- Post 5: Amara launches a product (Daily Summary) (2 days ago)
    INSERT INTO public.feed_posts (user_id, type, content, metadata, created_at)
    VALUES (
        user5_id,
        'daily_summary',
        'Daily Profile Updates',
        jsonb_build_object(
            'products', jsonb_build_array(
                jsonb_build_object(
                    'name', 'Product Management 101 Course',
                    'price', '$199',
                    'image_url', 'https://images.unsplash.com/photo-1542626991-cbc4e32524cc?auto=format&fit=crop&q=80&w=100'
                ),
                jsonb_build_object(
                    'name', '1:1 Mentorship Session',
                    'price', '$150',
                    'image_url', 'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&q=80&w=100'
                )
            )
        ),
        now() - interval '2 days'
    );

    -- Post 6: Sarah adds a Project (Daily Summary) (3 days ago)
    INSERT INTO public.feed_posts (user_id, type, content, metadata, created_at)
    VALUES (
        user1_id,
        'daily_summary',
        'Daily Profile Updates',
        jsonb_build_object(
            'projects', jsonb_build_array(
                jsonb_build_object(
                    'project_name', 'Banking App Redesign',
                    'project_photo_url', 'https://images.unsplash.com/photo-1563986768609-322da13575f3?auto=format&fit=crop&q=80&w=1000'
                ),
                jsonb_build_object(
                    'project_name', 'Design System Documentation',
                    -- CHANGED URL TO WORKING ONE
                    'project_photo_url', 'https://images.unsplash.com/photo-1507238691740-187a5b1d37b8?auto=format&fit=crop&q=80&w=1000'
                )
            )
        ),
        now() - interval '3 days'
    );

END $$;
