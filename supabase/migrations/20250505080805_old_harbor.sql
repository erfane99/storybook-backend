/*
  # Admin schema setup

  1. New Tables
    - `admin_users`: For tracking admin roles
    - `system_stats`: For tracking system usage
  
  2. Security
    - Enable RLS on all tables
    - Add policies for admin access
*/

-- Admin users table
CREATE TABLE IF NOT EXISTS admin_users (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'super_admin')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- System statistics
CREATE TABLE IF NOT EXISTS system_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  stat_date DATE NOT NULL DEFAULT CURRENT_DATE,
  stories_created INTEGER DEFAULT 0,
  images_generated INTEGER DEFAULT 0,
  new_users INTEGER DEFAULT 0,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable Row Level Security
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_stats ENABLE ROW LEVEL SECURITY;

-- Admin users policies
CREATE POLICY "Admin users can view admin list" 
  ON admin_users FOR SELECT USING (
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

-- Only super admins can modify admin users
CREATE POLICY "Super admins can manage admin users" 
  ON admin_users FOR ALL USING (
    auth.uid() IN (SELECT user_id FROM admin_users WHERE role = 'super_admin')
  );

-- System stats policies
CREATE POLICY "Admin users can view stats" 
  ON system_stats FOR SELECT USING (
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

CREATE POLICY "Admin users can update stats" 
  ON system_stats FOR UPDATE USING (
    auth.uid() IN (SELECT user_id FROM admin_users)
  );

-- Function to check if a user is an admin
CREATE OR REPLACE FUNCTION is_admin(uid UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admin_users WHERE user_id = uid
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;