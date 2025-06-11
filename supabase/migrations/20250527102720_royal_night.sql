/*
  # Add user_type column to users table

  1. Changes
    - Add `user_type` column to `users` table with default value 'user'
    - Add check constraint to ensure valid user types
  
  2. Security
    - No changes to existing RLS policies needed
*/

DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'user_type'
  ) THEN
    ALTER TABLE users 
    ADD COLUMN user_type TEXT NOT NULL DEFAULT 'user'
    CHECK (user_type IN ('user', 'admin'));
  END IF;
END $$;