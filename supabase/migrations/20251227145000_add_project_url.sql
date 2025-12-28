-- Add project_url column to projects table
ALTER TABLE projects ADD COLUMN project_url TEXT DEFAULT NULL;

-- Comment on column
COMMENT ON COLUMN projects.project_url IS 'Optional URL for the project that users can click on';
