-- Create my_nsso table for managing connections
CREATE TABLE IF NOT EXISTS public.my_nsso (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    connected_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    
    -- Contextual Stamp
    date_met TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    location_name TEXT DEFAULT '',
    location_lat DOUBLE PRECISION,
    location_long DOUBLE PRECISION,
    
    notes TEXT DEFAULT '' CHECK (LENGTH(notes) <= 3333),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(user_id, connected_user_id),
    CHECK (user_id != connected_user_id)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_my_nsso_user_id ON public.my_nsso(user_id);
CREATE INDEX IF NOT EXISTS idx_my_nsso_connected_user_id ON public.my_nsso(connected_user_id);
CREATE INDEX IF NOT EXISTS idx_my_nsso_timeline ON public.my_nsso(user_id, date_met DESC);

-- Enable RLS
ALTER TABLE public.my_nsso ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own connections"
    ON public.my_nsso FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own connections"
    ON public.my_nsso FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own connections"
    ON public.my_nsso FOR UPDATE
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own connections"
    ON public.my_nsso FOR DELETE
    USING (auth.uid() = user_id);
