/**
 * Service Container - Dependency injection container for services
 * Provides centralized service management and resolution
 */

import { createClient } from '@supabase/supabase-js';
import { SubscriptionService } from './subscription-service';

export type ServiceType = 'SUBSCRIPTION';

export interface ServiceContainer {
  resolve<T>(serviceType: ServiceType): Promise<T>;
  register<T>(serviceType: ServiceType, factory: () => Promise<T>): void;
}

class ServiceContainerImpl implements ServiceContainer {
  private services = new Map<ServiceType, any>();
  private factories = new Map<ServiceType, () => Promise<any>>();

  async resolve<T>(serviceType: ServiceType): Promise<T> {
    // Return cached service if available
    if (this.services.has(serviceType)) {
      return this.services.get(serviceType);
    }

    // Create service using factory
    const factory = this.factories.get(serviceType);
    if (!factory) {
      throw new Error(`Service ${serviceType} not registered`);
    }

    const service = await factory();
    this.services.set(serviceType, service);
    return service;
  }

  register<T>(serviceType: ServiceType, factory: () => Promise<T>): void {
    this.factories.set(serviceType, factory);
  }
}

// Global service container instance
const serviceContainer = new ServiceContainerImpl();

// Register services
serviceContainer.register('SUBSCRIPTION', async () => {
  // Validate environment variables
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseServiceKey) {
    throw new Error('Missing Supabase environment variables for service container');
  }

  // Create admin Supabase client for service operations
  const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);
  
  return new SubscriptionService(adminSupabase);
});

export { serviceContainer };
export type { ServiceType };