-- Create editors table for managing content editors
CREATE TABLE IF NOT EXISTS public.editors (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT,
    timezone TEXT,
    country TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Insert default editor
INSERT INTO public.editors (name, email, timezone, country) 
VALUES ('Srirezeky Adisunarno', NULL, 'GMT+7 (WIB)', 'Indonesia')
ON CONFLICT DO NOTHING;

-- Create posted_content table for Content Calendar feature
CREATE TABLE IF NOT EXISTS public.posted_content (
    id BIGSERIAL PRIMARY KEY,
    project_id BIGINT REFERENCES public.projects(id) ON DELETE CASCADE,
    project_title TEXT NOT NULL,
    client TEXT NOT NULL,
    content_form TEXT,
    content_bucket TEXT,
    number_of_content INTEGER DEFAULT 1,
    link TEXT,
    caption TEXT,
    feedback TEXT,
    comments TEXT,
    number_of_likes INTEGER DEFAULT 0,
    live_link TEXT,
    platform TEXT,
    scheduled_date DATE,
    posted_date DATE,
    status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'posted')),
    analytics JSONB DEFAULT '{}',
    editor_id BIGINT REFERENCES public.editors(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add indexes for better performance
CREATE INDEX IF NOT EXISTS idx_posted_content_project_id ON public.posted_content(project_id);
CREATE INDEX IF NOT EXISTS idx_posted_content_status ON public.posted_content(status);
CREATE INDEX IF NOT EXISTS idx_posted_content_scheduled_date ON public.posted_content(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_posted_content_posted_date ON public.posted_content(posted_date);
CREATE INDEX IF NOT EXISTS idx_posted_content_client ON public.posted_content(client);
CREATE INDEX IF NOT EXISTS idx_posted_content_editor_id ON public.posted_content(editor_id);
CREATE INDEX IF NOT EXISTS idx_editors_name ON public.editors(name);

-- Enable Row Level Security (RLS)
ALTER TABLE public.editors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posted_content ENABLE ROW LEVEL SECURITY;

-- Create policies to allow all operations (you can modify this based on your security needs)
CREATE POLICY "Allow all operations on editors" ON public.editors
    FOR ALL USING (true);

CREATE POLICY "Allow all operations on posted_content" ON public.posted_content
    FOR ALL USING (true);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_posted_content_updated_at 
    BEFORE UPDATE ON public.posted_content 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_editors_updated_at 
    BEFORE UPDATE ON public.editors 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Project enhancements: add Google Drive links storage
-- Safely add drive_links text[] column to projects if missing
ALTER TABLE public.projects
    ADD COLUMN IF NOT EXISTS drive_links TEXT[] DEFAULT '{}'::text[];
