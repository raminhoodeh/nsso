-- Change price column type to TEXT to allow free text input (e.g. "Free", "£50")
ALTER TABLE public.products ALTER COLUMN price TYPE TEXT;
