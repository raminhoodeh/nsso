-- Add Sales Page fields to products table
ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS sales_page_active BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS headline TEXT,
ADD COLUMN IF NOT EXISTS tagline TEXT,
ADD COLUMN IF NOT EXISTS intro_text TEXT,
ADD COLUMN IF NOT EXISTS value_proposition TEXT,
ADD COLUMN IF NOT EXISTS video_url TEXT,
ADD COLUMN IF NOT EXISTS benefits JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS testimonials JSONB DEFAULT '[]'::jsonb;

-- Comment on columns for clarity
COMMENT ON COLUMN public.products.benefits IS 'List of benefit strings';
COMMENT ON COLUMN public.products.testimonials IS 'List of {name, text} objects';
