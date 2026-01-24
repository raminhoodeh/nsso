-- Migration: News Feed V2 (Aggregation & UI Support)

-- 1. Create feed_pending_updates table
CREATE TABLE IF NOT EXISTS public.feed_pending_updates (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('qualification_added', 'project_added', 'product_added')),
    reference_id UUID NOT NULL, -- The ID of the item (qualification/project/product)
    metadata JSONB DEFAULT '{}'::jsonb, -- Store snapshot of data
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Modify Triggers to use queue instead of direct post

-- Trigger for Qualification
CREATE OR REPLACE FUNCTION public.handle_new_qualification() 
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.feed_pending_updates (user_id, type, reference_id, metadata)
    VALUES (
        NEW.user_id,
        'qualification_added',
        NEW.id,
        jsonb_build_object(
            'institution', NEW.institution,
            'qualification_name', NEW.qualification_name
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for Project
CREATE OR REPLACE FUNCTION public.handle_new_project() 
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.feed_pending_updates (user_id, type, reference_id, metadata)
    VALUES (
        NEW.user_id,
        'project_added',
        NEW.id,
        jsonb_build_object(
            'project_name', NEW.project_name,
            'description', NEW.description,
            'project_photo_url', NEW.project_photo_url
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger for Product
CREATE OR REPLACE FUNCTION public.handle_new_product() 
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.feed_pending_updates (user_id, type, reference_id, metadata)
    VALUES (
        NEW.user_id,
        'product_added',
        NEW.id,
        jsonb_build_object(
            'name', NEW.name,
            'price', NEW.price,
            'image_url', NEW.image_url
        )
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Aggregation Function (to be called by Cron/API)
-- This function processes pending updates for a specific user and creates a summary post
CREATE OR REPLACE FUNCTION public.process_daily_feed_aggregation(target_user_id UUID)
RETURNS VOID AS $$
DECLARE
    pending_count INT;
    summary_json JSONB;
BEGIN
    -- Check if there are updates
    SELECT count(*) INTO pending_count FROM public.feed_pending_updates WHERE user_id = target_user_id;

    IF pending_count > 0 THEN
        -- Build Summary JSON (Group by type)
        -- We construct a JSON object like { "qualifications": [...], "projects": [...] }
        SELECT jsonb_build_object(
            'qualifications', (
                SELECT jsonb_agg(metadata) 
                FROM public.feed_pending_updates 
                WHERE user_id = target_user_id AND type = 'qualification_added'
            ),
            'projects', (
                SELECT jsonb_agg(metadata) 
                FROM public.feed_pending_updates 
                WHERE user_id = target_user_id AND type = 'project_added'
            ),
            'products', (
                SELECT jsonb_agg(metadata) 
                FROM public.feed_pending_updates 
                WHERE user_id = target_user_id AND type = 'product_added'
            )
        ) INTO summary_json;

        -- Create Summary Post
        INSERT INTO public.feed_posts (user_id, type, content, metadata)
        VALUES (
            target_user_id,
            'daily_summary',
            'Daily Profile Updates', -- Fallback content
            summary_json
        );

        -- Delete processed pending updates
        DELETE FROM public.feed_pending_updates WHERE user_id = target_user_id;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Enable RLS on new table
ALTER TABLE public.feed_pending_updates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert pending updates" 
    ON public.feed_pending_updates FOR INSERT 
    WITH CHECK (auth.uid() = user_id);
    
-- Only system/admin typically reads/deletes, but for now allow user to see own
CREATE POLICY "Users can view own pending updates" 
    ON public.feed_pending_updates FOR SELECT 
    USING (auth.uid() = user_id);

-- Update feed_posts check constraint to include 'daily_summary'
ALTER TABLE public.feed_posts DROP CONSTRAINT IF EXISTS feed_posts_type_check;
ALTER TABLE public.feed_posts ADD CONSTRAINT feed_posts_type_check 
    CHECK (type IN ('manual', 'qualification_added', 'project_added', 'product_added', 'daily_summary'));
