/*
  # Add print requests table

  1. New Tables
    - `print_requests`: Stores professional print requests
  
  2. Security
    - Enable RLS
    - Add policies for authenticated users and admins
*/

-- Create print_requests table
CREATE TABLE IF NOT EXISTS print_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  storybook_id UUID REFERENCES storybook_entries(id),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'shipped', 'rejected')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable Row Level Security
ALTER TABLE print_requests ENABLE ROW LEVEL SECURITY;

-- Create security policies
CREATE POLICY "Users can view own print requests" 
  ON print_requests FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create print requests" 
  ON print_requests FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Admin policies
CREATE POLICY "Admins can view all print requests"
  ON print_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'admin'
    )
  );

CREATE POLICY "Admins can update print requests"
  ON print_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
      AND profiles.user_type = 'admin'
    )
  );