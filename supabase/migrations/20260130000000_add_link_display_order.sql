-- Add display_order column to links table
ALTER TABLE links ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- Initialize order based on creation time for existing links within each user scope
WITH ordered_links AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at) - 1 as new_order
  FROM links
)
UPDATE links
SET display_order = ordered_links.new_order
FROM ordered_links
WHERE links.id = ordered_links.id;
