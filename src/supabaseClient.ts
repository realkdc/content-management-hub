import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.REACT_APP_SUPABASE_URL!;
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Database types
export interface DatabaseProject {
  id: number;
  client: string;
  title: string;
  type: 'video' | 'image' | 'text';
  subtype?: string;
  status: 'approved' | 'pending_review' | 'in_progress' | 'needs_revision';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  version: number;
  due_date: string;
  estimated_hours?: number;
  budget?: number;
  description: string;
  objectives?: string;
  target_audience?: string;
  platforms?: string[];
  deliverables?: string;
  feedback?: string;
  last_activity: string;
  tags?: string[];
  created_at: string;
  updated_at: string;
}

export interface DatabaseClient {
  id: number;
  name: string;
  email: string;
  company: string;
  phone?: string;
  created_date: string;
  created_at: string;
  updated_at: string;
}

export interface DatabaseProjectFile {
  id: string;
  project_id: number;
  name: string;
  size: number;
  type: string;
  upload_date: string;
  url?: string;
  s3_key?: string;
  created_at: string;
}
