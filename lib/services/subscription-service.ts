/**
 * SubscriptionService - Handles user subscription limits and tier management
 * This service centralizes all subscription-related business logic
 */

export interface UserLimitCheck {
  allowed: boolean;
  currentUsage: number;
  limit: number;
  tier: string;
  upgradeMessage?: string;
  nextTier?: string;
}

export interface SubscriptionTier {
  name: string;
  storybookLimit: number;
  autoStoryLimit: number;
  features: string[];
}

export class SubscriptionService {
  private supabaseClient: any;

  constructor(supabaseClient: any) {
    this.supabaseClient = supabaseClient;
  }

  /**
   * Get subscription tiers configuration
   */
  private getSubscriptionTiers(): Record<string, SubscriptionTier> {
    return {
      free: {
        name: 'Free',
        storybookLimit: 1,
        autoStoryLimit: 1,
        features: ['1 Storybook', '1 Auto-Story', 'Basic Support']
      },
      premium: {
        name: 'Premium',
        storybookLimit: 10,
        autoStoryLimit: 10,
        features: ['10 Storybooks', '10 Auto-Stories', 'Priority Support', 'Advanced Styles']
      },
      unlimited: {
        name: 'Unlimited',
        storybookLimit: -1, // -1 means unlimited
        autoStoryLimit: -1,
        features: ['Unlimited Storybooks', 'Unlimited Auto-Stories', 'Premium Support', 'All Features']
      }
    };
  }

  /**
   * Get user's current subscription tier
   */
  private async getUserTier(userId: string): Promise<string> {
    try {
      // Check if user has a subscription record
      const { data: subscription, error } = await this.supabaseClient
        .from('user_subscriptions')
        .select('tier, status, expires_at')
        .eq('user_id', userId)
        .eq('status', 'active')
        .gt('expires_at', new Date().toISOString())
        .single();

      if (error && error.code !== 'PGRST116') {
        console.warn('Error fetching user subscription:', error);
        return 'free';
      }

      return subscription?.tier || 'free';
    } catch (error) {
      console.warn('Error in getUserTier:', error);
      return 'free';
    }
  }

  /**
   * Get user's current usage for a specific resource type
   */
  private async getUserUsage(userId: string, resourceType: 'storybook' | 'auto-story'): Promise<number> {
    try {
      let tableName: string;
      
      switch (resourceType) {
        case 'storybook':
          tableName = 'storybook_entries';
          break;
        case 'auto-story':
          // Auto-stories are also stored in storybook_entries, but we could add a type field
          tableName = 'storybook_entries';
          break;
        default:
          return 0;
      }

      const { count, error } = await this.supabaseClient
        .from(tableName)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId);

      if (error) {
        console.warn(`Error fetching ${resourceType} usage:`, error);
        return 0;
      }

      return count || 0;
    } catch (error) {
      console.warn(`Error in getUserUsage for ${resourceType}:`, error);
      return 0;
    }
  }

  /**
   * Check if user can perform an action based on their subscription limits
   */
  async checkUserLimits(userId: string, resourceType: 'storybook' | 'auto-story'): Promise<UserLimitCheck> {
    try {
      const [userTier, currentUsage] = await Promise.all([
        this.getUserTier(userId),
        this.getUserUsage(userId, resourceType)
      ]);

      const tiers = this.getSubscriptionTiers();
      const tier = tiers[userTier] || tiers.free;
      
      const limit = resourceType === 'storybook' ? tier.storybookLimit : tier.autoStoryLimit;
      
      // -1 means unlimited
      const allowed = limit === -1 || currentUsage < limit;

      let upgradeMessage: string | undefined;
      let nextTier: string | undefined;

      if (!allowed) {
        if (userTier === 'free') {
          nextTier = 'premium';
          upgradeMessage = `You've reached your ${tier.name} plan limit of ${limit} ${resourceType}${limit !== 1 ? 's' : ''}. Upgrade to Premium for ${tiers.premium.storybookLimit} ${resourceType}s and advanced features.`;
        } else if (userTier === 'premium') {
          nextTier = 'unlimited';
          upgradeMessage = `You've reached your ${tier.name} plan limit of ${limit} ${resourceType}${limit !== 1 ? 's' : ''}. Upgrade to Unlimited for unlimited ${resourceType}s and premium support.`;
        } else {
          upgradeMessage = `You've reached your plan limit. Please contact support for assistance.`;
        }
      }

      return {
        allowed,
        currentUsage,
        limit,
        tier: userTier,
        upgradeMessage,
        nextTier
      };
    } catch (error) {
      console.error('Error in checkUserLimits:', error);
      
      // Fail-safe: allow the action but log the error
      return {
        allowed: true,
        currentUsage: 0,
        limit: 1,
        tier: 'free',
        upgradeMessage: 'Unable to verify subscription limits. Please try again.'
      };
    }
  }

  /**
   * Get user's subscription information
   */
  async getUserSubscriptionInfo(userId: string) {
    try {
      const [userTier, storybookUsage, autoStoryUsage] = await Promise.all([
        this.getUserTier(userId),
        this.getUserUsage(userId, 'storybook'),
        this.getUserUsage(userId, 'auto-story')
      ]);

      const tiers = this.getSubscriptionTiers();
      const tier = tiers[userTier] || tiers.free;

      return {
        tier: userTier,
        tierInfo: tier,
        usage: {
          storybooks: {
            current: storybookUsage,
            limit: tier.storybookLimit
          },
          autoStories: {
            current: autoStoryUsage,
            limit: tier.autoStoryLimit
          }
        },
        features: tier.features
      };
    } catch (error) {
      console.error('Error in getUserSubscriptionInfo:', error);
      throw new Error('Failed to fetch subscription information');
    }
  }
}