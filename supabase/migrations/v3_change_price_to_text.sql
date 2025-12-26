-- Change price column from NUMERIC to TEXT to allow free text input
ALTER TABLE public.products 
ALTER COLUMN price TYPE TEXT USING price::TEXT;
