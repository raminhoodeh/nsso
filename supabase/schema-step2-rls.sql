-- =============================================
-- NSSO DATABASE SCHEMA - STEP 2: RLS & TRIGGER
-- Run this AFTER Step 1 succeeds
-- =============================================

-- Drop existing policies first
DROP POLICY IF EXISTS "users_select" ON public.users;
DROP POLICY IF EXISTS "users_update" ON public.users;
DROP POLICY IF EXISTS "profiles_select" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;
DROP POLICY IF EXISTS "links_select" ON public.links;
DROP POLICY IF EXISTS "links_insert" ON public.links;
DROP POLICY IF EXISTS "links_update" ON public.links;
DROP POLICY IF EXISTS "links_delete" ON public.links;
DROP POLICY IF EXISTS "contacts_select" ON public.contacts;
DROP POLICY IF EXISTS "contacts_insert" ON public.contacts;
DROP POLICY IF EXISTS "contacts_update" ON public.contacts;
DROP POLICY IF EXISTS "contacts_delete" ON public.contacts;
DROP POLICY IF EXISTS "subs_select" ON public.subscriptions;
DROP POLICY IF EXISTS "subs_insert" ON public.subscriptions;

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

-- Users policies
CREATE POLICY "users_select" ON public.users FOR SELECT USING (true);
CREATE POLICY "users_update" ON public.users FOR UPDATE USING (auth.uid() = id);

-- Profiles policies
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "profiles_insert" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Links policies
CREATE POLICY "links_select" ON public.links FOR SELECT USING (true);
CREATE POLICY "links_insert" ON public.links FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "links_update" ON public.links FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "links_delete" ON public.links FOR DELETE USING (auth.uid() = user_id);

-- Contacts policies
CREATE POLICY "contacts_select" ON public.contacts FOR SELECT USING (true);
CREATE POLICY "contacts_insert" ON public.contacts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "contacts_update" ON public.contacts FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "contacts_delete" ON public.contacts FOR DELETE USING (auth.uid() = user_id);

-- Subscriptions policies
CREATE POLICY "subs_select" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "subs_insert" ON public.subscriptions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Create storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('avatars', 'avatars', true)
ON CONFLICT (id) DO NOTHING;
