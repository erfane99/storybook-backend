/*
  # Add onboarding step tracking

  1. Changes
    - Add onboarding_step column to users table
    - Set default value to 'not_started'
    - Add check constraint for valid values
*/

ALTER TABLE users 
ADD COLUMN IF NOT EXISTS onboarding_step TEXT 
DEFAULT 'not_started' 
CHECK (onboarding_step IN ('not_started', 'profile_completed', 'story_created', 'paid'));