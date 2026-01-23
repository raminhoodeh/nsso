-- Migration: Allow NULL years for experiences and qualifications
-- This allows Deity to add items without year information

-- Make experience years nullable
ALTER TABLE public.experiences 
ALTER COLUMN start_year DROP NOT NULL;

-- Make qualification years nullable
ALTER TABLE public.qualifications 
ALTER COLUMN start_year DROP NOT NULL,
ALTER COLUMN end_year DROP NOT NULL;
