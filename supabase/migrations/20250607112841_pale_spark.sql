/*
  # Create phone_otp table for custom OTP authentication

  1. New Tables
    - `phone_otp`: Stores phone OTP verification codes
  
  2. Security
    - Enable RLS on phone_otp table
    - Add policies for OTP management
*/

-- Create phone_otp table
CREATE TABLE IF NOT EXISTS phone_otp (
  phone TEXT PRIMARY KEY,
  otp_code TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable Row Level Security
ALTER TABLE phone_otp ENABLE ROW LEVEL SECURITY;

-- Create security policies
-- Allow anyone to insert/update OTP records (needed for registration)
CREATE POLICY "Anyone can manage OTP records"
  ON phone_otp FOR ALL
  USING (true);

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_phone_otp_phone ON phone_otp(phone);
CREATE INDEX IF NOT EXISTS idx_phone_otp_expires_at ON phone_otp(expires_at);