export interface JobConfig {
  // Processing intervals (milliseconds)
  processingInterval: number;
  healthCheckInterval: number;
  metricsUpdateInterval: number;
  
  // Timeout settings (milliseconds)
  jobTimeout: number;
  stepTimeout: number;
  apiTimeout: number;
  
  // Concurrency limits
  maxConcurrentJobs: number;
  maxJobsPerUser: number;
  maxJobsPerType: number;
  
  // Retry configuration
  maxRetries: number;
  retryBackoffBase: number;
  retryBackoffMax: number;
  
  // Queue management
  maxQueueDepth: number;
  priorityLevels: string[];
  jobRetentionDays: number;
  
  // Feature flags
  enableAutoProcessing: boolean;
  enablePriorityProcessing: boolean;
  enableJobCancellation: boolean;
  enableMetricsCollection: boolean;
  enableHealthChecks: boolean;
  
  // Performance tuning
  batchSize: number;
  resourceThresholds: {
    cpu: number;
    memory: number;
    queue: number;
  };
  
  // Monitoring and alerting
  alertThresholds: {
    queueDepth: number;
    errorRate: number;
    processingTime: number;
    waitTime: number;
  };
}

export interface JobTypeConfig {
  [jobType: string]: {
    timeout: number;
    maxRetries: number;
    priority: number;
    concurrencyLimit: number;
    estimatedDuration: number;
    resourceRequirements: {
      cpu: 'low' | 'medium' | 'high';
      memory: 'low' | 'medium' | 'high';
      network: 'low' | 'medium' | 'high';
    };
  };
}

export interface EnvironmentConfig {
  development: Partial<JobConfig>;
  production: Partial<JobConfig>;
  test: Partial<JobConfig>;
}

// Default configuration
const defaultConfig: JobConfig = {
  // Processing intervals
  processingInterval: 30000, // 30 seconds
  healthCheckInterval: 60000, // 1 minute
  metricsUpdateInterval: 300000, // 5 minutes
  
  // Timeouts
  jobTimeout: 15 * 60 * 1000, // 15 minutes
  stepTimeout: 25 * 1000, // 25 seconds
  apiTimeout: 30 * 1000, // 30 seconds
  
  // Concurrency
  maxConcurrentJobs: 3,
  maxJobsPerUser: 5,
  maxJobsPerType: 10,
  
  // Retry settings
  maxRetries: 3,
  retryBackoffBase: 1000, // 1 second
  retryBackoffMax: 60000, // 1 minute
  
  // Queue management
  maxQueueDepth: 100,
  priorityLevels: ['low', 'normal', 'high', 'urgent'],
  jobRetentionDays: 7,
  
  // Feature flags
  enableAutoProcessing: true,
  enablePriorityProcessing: true,
  enableJobCancellation: true,
  enableMetricsCollection: true,
  enableHealthChecks: true,
  
  // Performance
  batchSize: 5,
  resourceThresholds: {
    cpu: 80, // percentage
    memory: 85, // percentage
    queue: 50, // number of jobs
  },
  
  // Monitoring
  alertThresholds: {
    queueDepth: 20,
    errorRate: 10, // percentage
    processingTime: 10 * 60 * 1000, // 10 minutes
    waitTime: 5 * 60 * 1000, // 5 minutes
  },
};

// Job type specific configurations
const jobTypeConfigs: JobTypeConfig = {
  'storybook': {
    timeout: 20 * 60 * 1000, // 20 minutes
    maxRetries: 2,
    priority: 2,
    concurrencyLimit: 2,
    estimatedDuration: 8 * 60 * 1000, // 8 minutes
    resourceRequirements: {
      cpu: 'high',
      memory: 'medium',
      network: 'high',
    },
  },
  'auto-story': {
    timeout: 15 * 60 * 1000, // 15 minutes
    maxRetries: 3,
    priority: 3,
    concurrencyLimit: 2,
    estimatedDuration: 6 * 60 * 1000, // 6 minutes
    resourceRequirements: {
      cpu: 'high',
      memory: 'medium',
      network: 'high',
    },
  },
  'scenes': {
    timeout: 10 * 60 * 1000, // 10 minutes
    maxRetries: 3,
    priority: 2,
    concurrencyLimit: 3,
    estimatedDuration: 4 * 60 * 1000, // 4 minutes
    resourceRequirements: {
      cpu: 'medium',
      memory: 'low',
      network: 'medium',
    },
  },
  'cartoonize': {
    timeout: 5 * 60 * 1000, // 5 minutes
    maxRetries: 3,
    priority: 1,
    concurrencyLimit: 5,
    estimatedDuration: 2 * 60 * 1000, // 2 minutes
    resourceRequirements: {
      cpu: 'medium',
      memory: 'low',
      network: 'high',
    },
  },
  'image-generation': {
    timeout: 5 * 60 * 1000, // 5 minutes
    maxRetries: 3,
    priority: 1,
    concurrencyLimit: 5,
    estimatedDuration: 90 * 1000, // 90 seconds
    resourceRequirements: {
      cpu: 'medium',
      memory: 'low',
      network: 'high',
    },
  },
};

// Environment-specific overrides
const environmentConfigs: EnvironmentConfig = {
  development: {
    processingInterval: 10000, // 10 seconds for faster development
    maxConcurrentJobs: 2,
    jobTimeout: 5 * 60 * 1000, // 5 minutes
    enableMetricsCollection: false,
    jobRetentionDays: 1,
  },
  production: {
    processingInterval: 30000, // 30 seconds
    maxConcurrentJobs: 5,
    jobTimeout: 20 * 60 * 1000, // 20 minutes
    enableMetricsCollection: true,
    jobRetentionDays: 30,
    alertThresholds: {
      queueDepth: 50,
      errorRate: 5,
      processingTime: 15 * 60 * 1000,
      waitTime: 10 * 60 * 1000,
    },
  },
  test: {
    processingInterval: 1000, // 1 second for fast tests
    maxConcurrentJobs: 1,
    jobTimeout: 30 * 1000, // 30 seconds
    enableAutoProcessing: false,
    enableMetricsCollection: false,
    jobRetentionDays: 0, // Clean up immediately
  },
};

class JobConfigManager {
  private config: JobConfig;
  private environment: string;

  constructor() {
    this.environment = process.env.NODE_ENV || 'development';
    this.config = this.buildConfig();
  }

  private buildConfig(): JobConfig {
    const envConfig = environmentConfigs[this.environment as keyof EnvironmentConfig] || {};
    
    // Merge default config with environment-specific overrides
    const config = { ...defaultConfig, ...envConfig };
    
    // Apply environment variable overrides
    return {
      ...config,
      enableAutoProcessing: this.getEnvBoolean('ENABLE_AUTO_PROCESSING', config.enableAutoProcessing),
      processingInterval: this.getEnvNumber('JOB_PROCESSING_INTERVAL', config.processingInterval),
      maxConcurrentJobs: this.getEnvNumber('MAX_CONCURRENT_JOBS', config.maxConcurrentJobs),
      maxJobsPerUser: this.getEnvNumber('MAX_JOBS_PER_USER', config.maxJobsPerUser),
      jobTimeout: this.getEnvNumber('JOB_TIMEOUT_MINUTES', config.jobTimeout / 60000) * 60000,
      enablePriorityProcessing: this.getEnvBoolean('ENABLE_PRIORITY_PROCESSING', config.enablePriorityProcessing),
      enableMetricsCollection: this.getEnvBoolean('MONITORING_ENABLED', config.enableMetricsCollection),
      jobRetentionDays: this.getEnvNumber('JOB_RETENTION_DAYS', config.jobRetentionDays),
    };
  }

  private getEnvBoolean(key: string, defaultValue: boolean): boolean {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    return value.toLowerCase() === 'true';
  }

  private getEnvNumber(key: string, defaultValue: number): number {
    const value = process.env[key];
    if (value === undefined) return defaultValue;
    const parsed = parseInt(value, 10);
    return isNaN(parsed) ? defaultValue : parsed;
  }

  // Public getters
  getConfig(): JobConfig {
    return { ...this.config };
  }

  getJobTypeConfig(jobType: string): JobTypeConfig[string] | null {
    return jobTypeConfigs[jobType] || null;
  }

  getProcessingInterval(): number {
    return this.config.processingInterval;
  }

  getMaxConcurrentJobs(): number {
    return this.config.maxConcurrentJobs;
  }

  getJobTimeout(jobType?: string): number {
    if (jobType && jobTypeConfigs[jobType]) {
      return jobTypeConfigs[jobType].timeout;
    }
    return this.config.jobTimeout;
  }

  getMaxRetries(jobType?: string): number {
    if (jobType && jobTypeConfigs[jobType]) {
      return jobTypeConfigs[jobType].maxRetries;
    }
    return this.config.maxRetries;
  }

  getRetryDelay(attempt: number): number {
    const delay = this.config.retryBackoffBase * Math.pow(2, attempt);
    return Math.min(delay, this.config.retryBackoffMax);
  }

  isFeatureEnabled(feature: keyof JobConfig): boolean {
    return Boolean(this.config[feature]);
  }

  shouldAlert(metric: string, value: number): boolean {
    const thresholds = this.config.alertThresholds as any;
    return thresholds[metric] !== undefined && value > thresholds[metric];
  }

  getEstimatedDuration(jobType: string): number {
    const typeConfig = jobTypeConfigs[jobType];
    return typeConfig?.estimatedDuration || 5 * 60 * 1000; // 5 minutes default
  }

  getConcurrencyLimit(jobType: string): number {
    const typeConfig = jobTypeConfigs[jobType];
    return typeConfig?.concurrencyLimit || 1;
  }

  getJobPriority(jobType: string): number {
    const typeConfig = jobTypeConfigs[jobType];
    return typeConfig?.priority || 1;
  }

  // Validation
  validateConfig(): string[] {
    const errors: string[] = [];

    if (this.config.maxConcurrentJobs < 1) {
      errors.push('maxConcurrentJobs must be at least 1');
    }

    if (this.config.processingInterval < 1000) {
      errors.push('processingInterval must be at least 1000ms');
    }

    if (this.config.jobTimeout < 30000) {
      errors.push('jobTimeout must be at least 30 seconds');
    }

    if (this.config.maxRetries < 0) {
      errors.push('maxRetries cannot be negative');
    }

    return errors;
  }

  // Dynamic configuration updates
  updateConfig(updates: Partial<JobConfig>): void {
    this.config = { ...this.config, ...updates };
    console.log('📝 Job configuration updated:', Object.keys(updates));
  }

  // Get configuration summary for debugging
  getConfigSummary(): object {
    return {
      environment: this.environment,
      autoProcessing: this.config.enableAutoProcessing,
      processingInterval: this.config.processingInterval,
      maxConcurrentJobs: this.config.maxConcurrentJobs,
      jobTimeout: this.config.jobTimeout,
      maxRetries: this.config.maxRetries,
      features: {
        priorityProcessing: this.config.enablePriorityProcessing,
        jobCancellation: this.config.enableJobCancellation,
        metricsCollection: this.config.enableMetricsCollection,
        healthChecks: this.config.enableHealthChecks,
      },
    };
  }
}

// Export singleton instance
export const jobConfig = new JobConfigManager();
export default jobConfig;