/*
  # Initial database schema setup

  1. New Tables
    - `users`: Extended profile information for authenticated users
    - `user_images`: Stores references to user-uploaded images
    - `stories`: Stores created storybooks
    - `story_scenes`: Individual scenes within a storybook
  
  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users to manage their own data
*/

-- Create users table to extend auth.users with profile data
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Store user uploaded images
CREATE TABLE IF NOT EXISTS user_images (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Stories table to track storybook information
CREATE TABLE IF NOT EXISTS stories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  raw_text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'processing', 'completed', 'error')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Individual scenes within a story
CREATE TABLE IF NOT EXISTS story_scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  story_id UUID NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  scene_number INTEGER NOT NULL,
  scene_text TEXT NOT NULL,
  generated_image_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable Row Level Security
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE stories ENABLE ROW LEVEL SECURITY;
ALTER TABLE story_scenes ENABLE ROW LEVEL SECURITY;

-- Create security policies
-- Users can only see and modify their own profile
CREATE POLICY "Users can view own profile" 
  ON users FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users can update own profile" 
  ON users FOR UPDATE USING (auth.uid() = id);

-- User images policies
CREATE POLICY "Users can view own images" 
  ON user_images FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own images" 
  ON user_images FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own images" 
  ON user_images FOR DELETE USING (auth.uid() = user_id);

-- Stories policies
CREATE POLICY "Users can view own stories" 
  ON stories FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own stories" 
  ON stories FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own stories" 
  ON stories FOR UPDATE USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own stories" 
  ON stories FOR DELETE USING (auth.uid() = user_id);

-- Story scenes policies
CREATE POLICY "Users can view own story scenes" 
  ON story_scenes FOR SELECT USING (
    auth.uid() IN (
      SELECT user_id FROM stories 
      WHERE stories.id = story_scenes.story_id
    )
  );

CREATE POLICY "Users can insert own story scenes" 
  ON story_scenes FOR INSERT WITH CHECK (
    auth.uid() IN (
      SELECT user_id FROM stories 
      WHERE stories.id = story_scenes.story_id
    )
  );

CREATE POLICY "Users can update own story scenes" 
  ON story_scenes FOR UPDATE USING (
    auth.uid() IN (
      SELECT user_id FROM stories 
      WHERE stories.id = story_scenes.story_id
    )
  );

CREATE POLICY "Users can delete own story scenes" 
  ON story_scenes FOR DELETE USING (
    auth.uid() IN (
      SELECT user_id FROM stories 
      WHERE stories.id = story_scenes.story_id
    )
  );

-- Create storage bucket for user images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('story_images', 'story_images', false)
ON CONFLICT (id) DO NOTHING;

-- Policy for accessing images
CREATE POLICY "Users can access their own images"
  ON storage.objects FOR SELECT
  USING (auth.uid() = owner);

CREATE POLICY "Users can upload their own images"
  ON storage.objects FOR INSERT
  WITH CHECK (auth.uid() = owner);

CREATE POLICY "Users can update their own images"
  ON storage.objects FOR UPDATE
  USING (auth.uid() = owner);

CREATE POLICY "Users can delete their own images"
  ON storage.objects FOR DELETE
  USING (auth.uid() = owner);