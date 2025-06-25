/*
  # Create user subscriptions table

  1. New Tables
    - `user_subscriptions`: Stores user subscription information
  
  2. Security
    - Enable RLS
    - Add policies for authenticated users and admins
*/

-- Create user_subscriptions table
CREATE TABLE IF NOT EXISTS user_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  tier TEXT NOT NULL DEFAULT 'free' CHECK (tier IN ('free', 'premium', 'unlimited')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'cancelled', 'expired', 'pending')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  
  -- Ensure only one active subscription per user
  UNIQUE(user_id, status) DEFERRABLE INITIALLY DEFERRED
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_tier ON user_subscriptions(tier);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_expires_at ON user_subscriptions(expires_at);

-- Enable Row Level Security
ALTER TABLE user_subscriptions ENABLE ROW LEVEL SECURITY;

-- Create security policies
CREATE POLICY "Users can view own subscription" 
  ON user_subscriptions FOR SELECT 
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own subscription" 
  ON user_subscriptions FOR UPDATE 
  USING (auth.uid() = user_id);

-- Admin policies
CREATE POLICY "Admins can view all subscriptions"
  ON user_subscriptions FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.user_type = 'admin'
    )
  );

CREATE POLICY "Admins can manage all subscriptions"
  ON user_subscriptions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = auth.uid()
      AND users.user_type = 'admin'
    )
  );

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_user_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER trigger_update_user_subscriptions_updated_at
  BEFORE UPDATE ON user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_user_subscriptions_updated_at();

-- Insert default free subscriptions for existing users
INSERT INTO user_subscriptions (user_id, tier, status)
SELECT id, 'free', 'active'
FROM auth.users
WHERE id NOT IN (SELECT user_id FROM user_subscriptions)
ON CONFLICT (user_id, status) DO NOTHING;