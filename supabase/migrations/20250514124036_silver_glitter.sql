/*
  # Add cartoon_images table for tracking processed images

  1. New Tables
    - `cartoon_images`: Stores original and cartoonized image pairs
  
  2. Security
    - Enable RLS
    - Add policies for authenticated users
*/

-- Create cartoon_images table
CREATE TABLE IF NOT EXISTS cartoon_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  original_url TEXT NOT NULL,
  generated_url TEXT NOT NULL,
  original_hash TEXT NOT NULL,
  style TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Create index on original_hash for faster lookups
CREATE INDEX IF NOT EXISTS idx_cartoon_images_hash ON cartoon_images(original_hash);

-- Enable Row Level Security
ALTER TABLE cartoon_images ENABLE ROW LEVEL SECURITY;

-- Create security policies
CREATE POLICY "Users can view own cartoon images" 
  ON cartoon_images FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own cartoon images" 
  ON cartoon_images FOR INSERT 
  WITH CHECK (auth.uid() = user_id);

-- Allow public read access for sharing
CREATE POLICY "Anyone can view cartoon images"
  ON cartoon_images FOR SELECT
  USING (true);