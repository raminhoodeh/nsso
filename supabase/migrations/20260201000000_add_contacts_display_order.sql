-- Add display_order column to contacts table
ALTER TABLE contacts 
ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;
