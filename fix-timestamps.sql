-- Fix existing timestamp data in Supabase
-- Run this in your Supabase SQL Editor to clean up old ISO timestamps

UPDATE projects 
SET last_activity = 'Recently updated'
WHERE last_activity LIKE '%T%' AND (last_activity LIKE '%Z' OR last_activity LIKE '%+%');

-- Optional: Update specific common patterns to more meaningful messages
UPDATE projects 
SET last_activity = 'Project created'
WHERE last_activity = 'Recently updated' AND created_at = updated_at;
