-- Migration: Add intros_bios column for INTROS feature
-- Feature: AI-generated audience-tailored bio variants (Recruiter, Collaborator, Client)
-- Run this in the Supabase SQL Editor

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS intros_bios JSONB DEFAULT NULL;

-- Expected shape of intros_bios:
-- {
--   "recruiter":    "Bio text tailored for recruiters...",
--   "collaborator": "Bio text tailored for collaborators...",
--   "client":       "Bio text tailored for clients..."
-- }

-- Optional: add a comment to document the column
COMMENT ON COLUMN profiles.intros_bios IS 'JSONB object storing AI-generated audience-tailored bio variants. Keys: recruiter, collaborator, client.';
