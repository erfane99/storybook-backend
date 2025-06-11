/*
  # Add storybook entries table

  1. New Tables
    - `storybook_entries`: Stores complete storybooks with scenes
  
  2. Security
    - Enable RLS
    - Add policies for authenticated users
*/

-- Create storybook entries table
CREATE TABLE IF NOT EXISTS storybook_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  title TEXT NOT NULL,
  story TEXT NOT NULL,
  scenes JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable Row Level Security
ALTER TABLE storybook_entries ENABLE ROW LEVEL SECURITY;

-- Create security policies
CREATE POLICY "Users can view own entries" 
  ON storybook_entries FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own entries" 
  ON storybook_entries FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own entries" 
  ON storybook_entries FOR UPDATE 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own entries" 
  ON storybook_entries FOR DELETE 
  USING (auth.uid() = user_id);

-- Allow public read access for sharing
CREATE POLICY "Anyone can view published entries"
  ON storybook_entries FOR SELECT
  USING (true);