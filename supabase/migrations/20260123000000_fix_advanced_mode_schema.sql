-- Migration: Fix Advanced Mode Table Schema Mismatches
-- This adds missing columns that the ProfileProvider expects

-- Add description column to experiences table
ALTER TABLE public.experiences 
ADD COLUMN IF NOT EXISTS description TEXT;

-- Add project_url column to projects table
ALTER TABLE public.projects 
ADD COLUMN IF NOT EXISTS project_url TEXT;

-- Change price column from NUMERIC to TEXT in products table
-- This allows flexible price formats like "$50", "Free", "€100", etc.
ALTER TABLE public.products 
ALTER COLUMN price TYPE TEXT USING price::TEXT;

-- Update sales_page_active if it doesn't exist
ALTER TABLE public.products 
ADD COLUMN IF NOT EXISTS sales_page_active BOOLEAN DEFAULT false;
