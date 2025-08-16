-- Fix Supabase project_files table schema
-- Run this in your Supabase SQL Editor

-- Add missing columns to project_files table
ALTER TABLE project_files 
ADD COLUMN IF NOT EXISTS is_latest BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS version TEXT DEFAULT '1.0',
ADD COLUMN IF NOT EXISTS uploaded_by TEXT,
ADD COLUMN IF NOT EXISTS previous_version_id TEXT;

-- Update existing records to have is_latest = true
UPDATE project_files SET is_latest = true WHERE is_latest IS NULL;

-- Make sure the table has all required columns
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns 
WHERE table_name = 'project_files' 
ORDER BY ordinal_position;
