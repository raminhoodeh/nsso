-- Add display_order column to experiences table
ALTER TABLE experiences 
ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- Add display_order column to qualifications table
ALTER TABLE qualifications 
ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- Add display_order column to projects table
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;
