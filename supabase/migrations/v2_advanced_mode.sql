-- Create Experiences Table
CREATE TABLE IF NOT EXISTS public.experiences (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    company_name TEXT NOT NULL,
    job_title TEXT NOT NULL,
    start_year INTEGER NOT NULL,
    end_year INTEGER, -- Null signifies "Present"
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Qualifications Table
CREATE TABLE IF NOT EXISTS public.qualifications (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    institution TEXT NOT NULL,
    qualification_name TEXT NOT NULL,
    start_year INTEGER NOT NULL,
    end_year INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Projects Table
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    project_name TEXT NOT NULL,
    contribution TEXT NOT NULL,
    description TEXT,
    project_photo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Create Products & Services Table
CREATE TABLE IF NOT EXISTS public.products (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    price NUMERIC(10, 2), -- Supports prices up to 99,999,999.99
    image_url TEXT,
    description TEXT,
    purchase_link TEXT,
    purchase_link_active BOOLEAN DEFAULT false,
    paypal_html TEXT,
    paypal_active BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable Row Level Security (RLS)
ALTER TABLE public.experiences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qualifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- Create Policies (Public Read, Owner Write)

-- Experiences
CREATE POLICY "Experiences are viewable by everyone" 
ON public.experiences FOR SELECT 
USING (true);

CREATE POLICY "Users can insert their own experiences" 
ON public.experiences FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own experiences" 
ON public.experiences FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own experiences" 
ON public.experiences FOR DELETE 
USING (auth.uid() = user_id);

-- Qualifications
CREATE POLICY "Qualifications are viewable by everyone" 
ON public.qualifications FOR SELECT 
USING (true);

CREATE POLICY "Users can insert their own qualifications" 
ON public.qualifications FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own qualifications" 
ON public.qualifications FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own qualifications" 
ON public.qualifications FOR DELETE 
USING (auth.uid() = user_id);

-- Projects
CREATE POLICY "Projects are viewable by everyone" 
ON public.projects FOR SELECT 
USING (true);

CREATE POLICY "Users can insert their own projects" 
ON public.projects FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own projects" 
ON public.projects FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own projects" 
ON public.projects FOR DELETE 
USING (auth.uid() = user_id);

-- Products
CREATE POLICY "Products are viewable by everyone" 
ON public.products FOR SELECT 
USING (true);

CREATE POLICY "Users can insert their own products" 
ON public.products FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own products" 
ON public.products FOR UPDATE 
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own products" 
ON public.products FOR DELETE 
USING (auth.uid() = user_id);

-- Storage Bucket Setup (Using direct insertion into storage.buckets if possible, or just defining policies assuming bucket exists)
-- Note: It is often safer to create buckets via the dashboard, but we can try to insert if not exists.
INSERT INTO storage.buckets (id, name, public) 
VALUES ('portfolio-assets', 'portfolio-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies for 'portfolio-assets'
CREATE POLICY "Portfolio Assets are publicly accessible"
ON storage.objects FOR SELECT
USING ( bucket_id = 'portfolio-assets' );

CREATE POLICY "Authenticated users can upload to portfolio-assets"
ON storage.objects FOR INSERT
WITH CHECK ( bucket_id = 'portfolio-assets' AND auth.role() = 'authenticated' );

CREATE POLICY "Users can update their own portfolio-assets"
ON storage.objects FOR UPDATE
USING ( bucket_id = 'portfolio-assets' AND auth.uid() = owner );

CREATE POLICY "Users can delete their own portfolio-assets"
ON storage.objects FOR DELETE
USING ( bucket_id = 'portfolio-assets' AND auth.uid() = owner );
