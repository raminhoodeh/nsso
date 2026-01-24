-- Migration: Create News Feed Tables and Triggers
-- Modified to be idempotent (safe to re-run)

-- 1. Create feed_posts table
CREATE TABLE IF NOT EXISTS public.feed_posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('manual', 'qualification_added', 'project_added', 'product_added')),
    content TEXT, -- Manual post content or auto-generated summary
    reference_id UUID, -- ID of the related record (project_id, etc.)
    metadata JSONB DEFAULT '{}'::jsonb, -- Store snapshot of data (title, image_url)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create feed_likes table
CREATE TABLE IF NOT EXISTS public.feed_likes (
    post_id UUID NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (post_id, user_id)
);

-- 3. Create feed_comments table
CREATE TABLE IF NOT EXISTS public.feed_comments (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    post_id UUID NOT NULL REFERENCES public.feed_posts(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    content TEXT NOT NULL CHECK (length(content) > 0 AND length(content) <= 1000),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Enable RLS
ALTER TABLE public.feed_posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_likes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feed_comments ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
-- We drop existing policies first to facilitate re-running the script without errors.

-- Feed Posts
DROP POLICY IF EXISTS "Feed posts are viewable by everyone" ON public.feed_posts;
CREATE POLICY "Feed posts are viewable by everyone" 
ON public.feed_posts FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can create their own posts" ON public.feed_posts;
CREATE POLICY "Users can create their own posts" 
ON public.feed_posts FOR INSERT 
WITH CHECK (auth.uid() = user_id);

-- Likes
DROP POLICY IF EXISTS "Likes are viewable by everyone" ON public.feed_likes;
CREATE POLICY "Likes are viewable by everyone" 
ON public.feed_likes FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can like posts" ON public.feed_likes;
CREATE POLICY "Users can like posts" 
ON public.feed_likes FOR INSERT 
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can unlike posts" ON public.feed_likes;
CREATE POLICY "Users can unlike posts" 
ON public.feed_likes FOR DELETE 
USING (auth.uid() = user_id);

-- Comments
DROP POLICY IF EXISTS "Comments are viewable by everyone" ON public.feed_comments;
CREATE POLICY "Comments are viewable by everyone" 
ON public.feed_comments FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users can comment on posts" ON public.feed_comments;
CREATE POLICY "Users can comment on posts" 
ON public.feed_comments FOR INSERT 
WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete their own comments" ON public.feed_comments;
CREATE POLICY "Users can delete their own comments" 
ON public.feed_comments FOR DELETE 
USING (auth.uid() = user_id);


-- 6. Indexes
CREATE INDEX IF NOT EXISTS idx_feed_posts_user_id ON public.feed_posts(user_id);
CREATE INDEX IF NOT EXISTS idx_feed_posts_created_at ON public.feed_posts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_likes_post_id ON public.feed_likes(post_id);
CREATE INDEX IF NOT EXISTS idx_feed_comments_post_id ON public.feed_comments(post_id);


-- 7. Database Functions & Triggers for Auto-Posting

-- Function: Auto Post from Qualification
CREATE OR REPLACE FUNCTION public.handle_new_qualification() 
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.feed_posts (user_id, type, reference_id, metadata, content)
    VALUES (
        NEW.user_id,
        'qualification_added',
        NEW.id,
        jsonb_build_object(
            'institution', NEW.institution,
            'qualification_name', NEW.qualification_name
        ),
        'Added a new qualification'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_qualification_added ON public.qualifications;
CREATE TRIGGER on_qualification_added
    AFTER INSERT ON public.qualifications
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_qualification();

-- Function: Auto Post from Project
CREATE OR REPLACE FUNCTION public.handle_new_project() 
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.feed_posts (user_id, type, reference_id, metadata, content)
    VALUES (
        NEW.user_id,
        'project_added',
        NEW.id,
        jsonb_build_object(
            'project_name', NEW.project_name,
            'description', NEW.description,
            'project_photo_url', NEW.project_photo_url
        ),
        'Launched a new project'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_project_added ON public.projects;
CREATE TRIGGER on_project_added
    AFTER INSERT ON public.projects
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_project();

-- Function: Auto Post from Product
CREATE OR REPLACE FUNCTION public.handle_new_product() 
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.feed_posts (user_id, type, reference_id, metadata, content)
    VALUES (
        NEW.user_id,
        'product_added',
        NEW.id,
        jsonb_build_object(
            'name', NEW.name,
            'price', NEW.price,
            'image_url', NEW.image_url
        ),
        'Added a new service/product'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_product_added ON public.products;
CREATE TRIGGER on_product_added
    AFTER INSERT ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_product();
