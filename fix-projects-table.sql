-- Fix Supabase projects table schema
-- Run this in your Supabase SQL Editor

-- Add missing columns to projects table if they don't exist
ALTER TABLE projects 
ADD COLUMN IF NOT EXISTS subtype TEXT,
ADD COLUMN IF NOT EXISTS objectives TEXT,
ADD COLUMN IF NOT EXISTS target_audience TEXT,
ADD COLUMN IF NOT EXISTS platforms TEXT[],
ADD COLUMN IF NOT EXISTS deliverables TEXT,
ADD COLUMN IF NOT EXISTS tags TEXT[],
ADD COLUMN IF NOT EXISTS estimated_hours INTEGER DEFAULT 0,
ADD COLUMN IF NOT EXISTS budget INTEGER DEFAULT 0;

-- Make sure the status column accepts the new workflow values
ALTER TABLE projects 
ALTER COLUMN status TYPE TEXT;

-- Update existing records to have proper default values
UPDATE projects 
SET 
  subtype = COALESCE(subtype, ''),
  objectives = COALESCE(objectives, ''),
  target_audience = COALESCE(target_audience, ''),
  platforms = COALESCE(platforms, ARRAY[]::TEXT[]),
  deliverables = COALESCE(deliverables, ''),
  tags = COALESCE(tags, ARRAY[]::TEXT[]),
  estimated_hours = COALESCE(estimated_hours, 0),
  budget = COALESCE(budget, 0)
WHERE 
  subtype IS NULL OR 
  objectives IS NULL OR 
  target_audience IS NULL OR 
  platforms IS NULL OR 
  deliverables IS NULL OR 
  tags IS NULL OR 
  estimated_hours IS NULL OR 
  budget IS NULL;

-- Show the current table structure
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'projects' 
ORDER BY ordinal_position;

-- Test inserting a sample project to make sure it works
-- (You can comment this out after testing)
/*
INSERT INTO projects (
  client, title, type, subtype, status, priority, version, 
  due_date, estimated_hours, budget, description, objectives, 
  target_audience, platforms, deliverables, feedback, last_activity, tags
) VALUES (
  'Test Client', 'Test Project', 'video', 'Test Subtype', 'draft', 'medium', 1,
  '2024-12-31', 10, 1000, 'Test description', 'Test objectives',
  'Test audience', ARRAY['Instagram', 'TikTok'], 'Test deliverables', 
  NULL, 'Project created', ARRAY['test', 'sample']
) RETURNING id;
*/
