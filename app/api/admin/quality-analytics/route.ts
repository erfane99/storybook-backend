import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAuthToken, extractUserId, createAuthErrorResponse } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

interface CacheEntry {
  data: any;
  timestamp: number;
  ttl: number;
}

const analyticsCache = new Map<string, CacheEntry>();

const CACHE_TTL = {
  RECENT: 5 * 60 * 1000,
  HISTORICAL: 60 * 60 * 1000,
};

function getCacheKey(timeframe: string, startDate?: string, endDate?: string): string {
  return `quality-analytics:${timeframe}:${startDate || 'none'}:${endDate || 'none'}`;
}

function getCachedData(key: string): any | null {
  const entry = analyticsCache.get(key);
  if (!entry) return null;

  const now = Date.now();
  if (now - entry.timestamp > entry.ttl) {
    analyticsCache.delete(key);
    console.log('🔍 Cache miss - entry expired');
    return null;
  }

  console.log('⚡ Cache hit for analytics');
  return entry.data;
}

function setCachedData(key: string, data: any, isRecent: boolean): void {
  const ttl = isRecent ? CACHE_TTL.RECENT : CACHE_TTL.HISTORICAL;
  analyticsCache.set(key, {
    data,
    timestamp: Date.now(),
    ttl,
  });
}

function cleanExpiredCache(): void {
  const now = Date.now();
  for (const [key, entry] of analyticsCache.entries()) {
    if (now - entry.timestamp > entry.ttl) {
      analyticsCache.delete(key);
    }
  }
}

async function checkAdminAuthorization(userId: string, adminSupabase: any): Promise<boolean> {
  try {
    const { data, error } = await adminSupabase.rpc('is_admin', { uid: userId });

    if (error) {
      console.error('❌ Error checking admin status via RPC:', error);

      const { data: profileData, error: profileError } = await adminSupabase
        .from('profiles')
        .select('user_type')
        .eq('user_id', userId)
        .maybeSingle();

      if (profileError) {
        console.error('❌ Error checking admin status via profiles table:', profileError);
        return false;
      }

      return profileData?.user_type === 'admin';
    }

    return data === true;
  } catch (error) {
    console.error('❌ Error in checkAdminAuthorization:', error);
    return false;
  }
}

function getDateRangeFromTimeframe(timeframe: string, startDate?: string, endDate?: string): { start: Date; end: Date } {
  const now = new Date();
  let start: Date;
  let end: Date = endDate ? new Date(endDate) : now;

  if (startDate) {
    start = new Date(startDate);
  } else {
    switch (timeframe) {
      case 'day':
        start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case 'week':
        start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case 'month':
        start = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
      default:
        start = new Date('2000-01-01');
        break;
    }
  }

  return { start, end };
}

async function getSystemHealth(adminSupabase: any): Promise<any> {
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  const { count: totalComics } = await adminSupabase
    .from('storybook_entries')
    .select('*', { count: 'exact', head: true });

  const { count: totalComicsLast30Days } = await adminSupabase
    .from('storybook_entries')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', thirtyDaysAgo.toISOString());

  const { count: totalComicsLast7Days } = await adminSupabase
    .from('storybook_entries')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', sevenDaysAgo.toISOString());

  const { data: qualityData } = await adminSupabase
    .from('comic_quality_metrics')
    .select('overall_technical_quality, quality_grade');

  const averageQualityScore = qualityData && qualityData.length > 0
    ? qualityData.reduce((sum: number, item: any) => sum + (item.overall_technical_quality || 0), 0) / qualityData.length
    : 0;

  const gradeDistribution: Record<string, number> = {};
  if (qualityData && qualityData.length > 0) {
    for (const item of qualityData) {
      const grade = item.quality_grade || 'Unknown';
      gradeDistribution[grade] = (gradeDistribution[grade] || 0) + 1;
    }
  }

  const { count: completedJobs } = await adminSupabase
    .from('storybook_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'completed');

  const { count: failedJobs } = await adminSupabase
    .from('storybook_jobs')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'failed');

  const totalJobs = (completedJobs || 0) + (failedJobs || 0);
  const successRate = totalJobs > 0 ? ((completedJobs || 0) / totalJobs) * 100 : 0;
  const failureRate = totalJobs > 0 ? ((failedJobs || 0) / totalJobs) * 100 : 0;

  return {
    totalComics: totalComics || 0,
    totalComicsLast30Days: totalComicsLast30Days || 0,
    totalComicsLast7Days: totalComicsLast7Days || 0,
    averageQualityScore: parseFloat(averageQualityScore.toFixed(2)),
    currentGradeDistribution: gradeDistribution,
    successRate: parseFloat(successRate.toFixed(2)),
    failureRate: parseFloat(failureRate.toFixed(2)),
  };
}

async function getQualityTrends(adminSupabase: any, timeframe: string, start: Date, end: Date): Promise<any> {
  let dateGrouping: string;
  switch (timeframe) {
    case 'day':
      dateGrouping = 'hour';
      break;
    case 'week':
      dateGrouping = 'day';
      break;
    case 'month':
      dateGrouping = 'day';
      break;
    default:
      dateGrouping = 'month';
      break;
  }

  const { data: metricsData } = await adminSupabase
    .from('comic_quality_metrics')
    .select('overall_technical_quality, quality_grade, created_at')
    .gte('created_at', start.toISOString())
    .lte('created_at', end.toISOString())
    .order('created_at', { ascending: true });

  const dataPoints: any[] = [];
  const groupedData: Map<string, any[]> = new Map();

  if (metricsData && metricsData.length > 0) {
    for (const item of metricsData) {
      const date = new Date(item.created_at);
      let periodKey: string;

      switch (dateGrouping) {
        case 'hour':
          periodKey = date.toISOString().substring(0, 13);
          break;
        case 'day':
          periodKey = date.toISOString().substring(0, 10);
          break;
        case 'month':
          periodKey = date.toISOString().substring(0, 7);
          break;
        default:
          periodKey = date.toISOString().substring(0, 10);
      }

      if (!groupedData.has(periodKey)) {
        groupedData.set(periodKey, []);
      }
      groupedData.get(periodKey)!.push(item);
    }

    for (const [period, items] of groupedData.entries()) {
      const averageQuality = items.reduce((sum, item) => sum + (item.overall_technical_quality || 0), 0) / items.length;

      const gradeDistribution: Record<string, number> = {};
      for (const item of items) {
        const grade = item.quality_grade || 'Unknown';
        gradeDistribution[grade] = (gradeDistribution[grade] || 0) + 1;
      }

      dataPoints.push({
        period,
        averageQuality: parseFloat(averageQuality.toFixed(2)),
        comicCount: items.length,
        gradeDistribution,
      });
    }
  }

  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  let improvementRate = 0;

  if (dataPoints.length >= 2) {
    const midPoint = Math.floor(dataPoints.length / 2);
    const olderAvg = dataPoints.slice(0, midPoint).reduce((sum, dp) => sum + dp.averageQuality, 0) / midPoint;
    const recentAvg = dataPoints.slice(midPoint).reduce((sum, dp) => sum + dp.averageQuality, 0) / (dataPoints.length - midPoint);

    improvementRate = olderAvg > 0 ? ((recentAvg - olderAvg) / olderAvg) * 100 : 0;

    if (improvementRate > 2) {
      trend = 'improving';
    } else if (improvementRate < -2) {
      trend = 'declining';
    }
  }

  return {
    timeframe,
    dataPoints,
    improvementRate: parseFloat(improvementRate.toFixed(2)),
    trend,
  };
}

async function getPatternEffectiveness(adminSupabase: any): Promise<any> {
  const { data: patternsData, count: totalPatterns } = await adminSupabase
    .from('success_patterns')
    .select('*', { count: 'exact' });

  const { count: activePatterns } = await adminSupabase
    .from('success_patterns')
    .select('*', { count: 'exact', head: true })
    .eq('is_deprecated', false);

  const { data: effectivenessData } = await adminSupabase
    .from('pattern_effectiveness')
    .select('pattern_id, effectiveness_score, usage_count');

  let averageEffectiveness = 0;
  if (effectivenessData && effectivenessData.length > 0) {
    averageEffectiveness = effectivenessData.reduce((sum: number, item: any) => sum + (item.effectiveness_score || 0), 0) / effectivenessData.length;
  }

  const { data: metricsWithPatterns } = await adminSupabase
    .from('comic_quality_metrics')
    .select('overall_technical_quality, pattern_ids')
    .not('pattern_ids', 'is', null);

  const { data: metricsWithoutPatterns } = await adminSupabase
    .from('comic_quality_metrics')
    .select('overall_technical_quality')
    .is('pattern_ids', null);

  const qualityWithPatterns = metricsWithPatterns && metricsWithPatterns.length > 0
    ? metricsWithPatterns.reduce((sum: number, item: any) => sum + (item.overall_technical_quality || 0), 0) / metricsWithPatterns.length
    : 0;

  const qualityWithoutPatterns = metricsWithoutPatterns && metricsWithoutPatterns.length > 0
    ? metricsWithoutPatterns.reduce((sum: number, item: any) => sum + (item.overall_technical_quality || 0), 0) / metricsWithoutPatterns.length
    : 0;

  const improvementFromPatterns = qualityWithoutPatterns > 0
    ? ((qualityWithPatterns - qualityWithoutPatterns) / qualityWithoutPatterns) * 100
    : 0;

  const topPatterns: any[] = [];
  if (effectivenessData && effectivenessData.length > 0) {
    const sorted = [...effectivenessData]
      .sort((a, b) => (b.effectiveness_score || 0) - (a.effectiveness_score || 0))
      .slice(0, 10);

    for (const item of sorted) {
      const patternInfo = patternsData?.find((p: any) => p.id === item.pattern_id);
      topPatterns.push({
        id: item.pattern_id,
        type: patternInfo?.pattern_type || 'unknown',
        effectiveness: parseFloat((item.effectiveness_score || 0).toFixed(2)),
        usageCount: item.usage_count || 0,
      });
    }
  }

  return {
    totalPatterns: totalPatterns || 0,
    activePatterns: activePatterns || 0,
    averageEffectiveness: parseFloat(averageEffectiveness.toFixed(2)),
    qualityWithPatterns: parseFloat(qualityWithPatterns.toFixed(2)),
    qualityWithoutPatterns: parseFloat(qualityWithoutPatterns.toFixed(2)),
    improvementFromPatterns: parseFloat(improvementFromPatterns.toFixed(2)),
    topPatterns,
  };
}

async function getUserSatisfaction(adminSupabase: any): Promise<any> {
  const { data: ratingsData, count: totalRatings } = await adminSupabase
    .from('user_ratings')
    .select('*', { count: 'exact' });

  if (!ratingsData || ratingsData.length === 0) {
    return {
      totalRatings: 0,
      averageUserRating: 0,
      wouldRecommendPercentage: 0,
      correlationWithAutomatedQuality: 0,
      satisfactionTrend: 'stable' as const,
    };
  }

  const averageUserRating = ratingsData.reduce((sum: number, item: any) => sum + (item.average_rating || 0), 0) / ratingsData.length;

  const recommendCount = ratingsData.filter((item: any) => item.would_recommend === true).length;
  const wouldRecommendPercentage = (recommendCount / ratingsData.length) * 100;

  const { data: correlationData } = await adminSupabase
    .from('user_ratings')
    .select('average_rating, comic_id');

  let correlationWithAutomatedQuality = 0;
  if (correlationData && correlationData.length > 1) {
    const comicIds = correlationData.map((r: any) => r.comic_id);
    const { data: qualityData } = await adminSupabase
      .from('comic_quality_metrics')
      .select('comic_id, overall_technical_quality')
      .in('comic_id', comicIds);

    if (qualityData && qualityData.length > 1) {
      const merged: Array<{ userRating: number; autoQuality: number }> = [];
      for (const rating of correlationData) {
        const quality = qualityData.find((q: any) => q.comic_id === rating.comic_id);
        if (quality) {
          merged.push({
            userRating: rating.average_rating * 20,
            autoQuality: quality.overall_technical_quality,
          });
        }
      }

      if (merged.length > 1) {
        correlationWithAutomatedQuality = calculatePearsonCorrelation(
          merged.map(m => m.userRating),
          merged.map(m => m.autoQuality)
        );
      }
    }
  }

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentRatings = ratingsData.filter((r: any) => new Date(r.rating_date) >= thirtyDaysAgo);
  const olderRatings = ratingsData.filter((r: any) => new Date(r.rating_date) < thirtyDaysAgo);

  let satisfactionTrend: 'improving' | 'stable' | 'declining' = 'stable';
  if (recentRatings.length > 0 && olderRatings.length > 0) {
    const recentAvg = recentRatings.reduce((sum: number, r: any) => sum + (r.average_rating || 0), 0) / recentRatings.length;
    const olderAvg = olderRatings.reduce((sum: number, r: any) => sum + (r.average_rating || 0), 0) / olderRatings.length;
    const change = ((recentAvg - olderAvg) / olderAvg) * 100;

    if (change > 5) {
      satisfactionTrend = 'improving';
    } else if (change < -5) {
      satisfactionTrend = 'declining';
    }
  }

  return {
    totalRatings: totalRatings || 0,
    averageUserRating: parseFloat(averageUserRating.toFixed(2)),
    wouldRecommendPercentage: parseFloat(wouldRecommendPercentage.toFixed(2)),
    correlationWithAutomatedQuality: parseFloat(correlationWithAutomatedQuality.toFixed(2)),
    satisfactionTrend,
  };
}

function calculatePearsonCorrelation(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length === 0) return 0;

  const n = x.length;
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  return denominator === 0 ? 0 : numerator / denominator;
}

async function getFailureAnalysis(adminSupabase: any): Promise<any> {
  const { data: failedJobs, count: totalFailures } = await adminSupabase
    .from('storybook_jobs')
    .select('*', { count: 'exact' })
    .eq('status', 'failed');

  const { count: totalJobs } = await adminSupabase
    .from('storybook_jobs')
    .select('*', { count: 'exact', head: true });

  const failureRate = totalJobs && totalJobs > 0 ? ((totalFailures || 0) / totalJobs) * 100 : 0;

  const commonFailureReasons: Array<{ reason: string; count: number; percentage: number }> = [];
  if (failedJobs && failedJobs.length > 0) {
    const reasonCounts: Map<string, number> = new Map();

    for (const job of failedJobs) {
      const errorMessage = job.error_message || 'Unknown error';
      const reason = extractFailureReason(errorMessage);
      reasonCounts.set(reason, (reasonCounts.get(reason) || 0) + 1);
    }

    for (const [reason, count] of reasonCounts.entries()) {
      const percentage = (count / failedJobs.length) * 100;
      commonFailureReasons.push({
        reason,
        count,
        percentage: parseFloat(percentage.toFixed(2)),
      });
    }

    commonFailureReasons.sort((a, b) => b.count - a.count);
  }

  const { data: validationData } = await adminSupabase
    .from('panel_validation_results')
    .select('passes_threshold');

  const validationFailures = validationData?.filter((v: any) => v.passes_threshold === false).length || 0;
  const totalValidations = validationData?.length || 0;
  const validationFailureRate = totalValidations > 0 ? (validationFailures / totalValidations) * 100 : 0;

  const { data: attemptData } = await adminSupabase
    .from('panel_validation_results')
    .select('attempt_number');

  const averageRegenerationsPerComic = attemptData && attemptData.length > 0
    ? attemptData.reduce((sum: number, item: any) => sum + (item.attempt_number || 1), 0) / attemptData.length - 1
    : 0;

  return {
    totalFailures: totalFailures || 0,
    failureRate: parseFloat(failureRate.toFixed(2)),
    commonFailureReasons,
    validationFailureRate: parseFloat(validationFailureRate.toFixed(2)),
    averageRegenerationsPerComic: parseFloat((averageRegenerationsPerComic - 1).toFixed(2)),
  };
}

function extractFailureReason(errorMessage: string): string {
  const lowerMessage = errorMessage.toLowerCase();

  if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out')) {
    return 'Timeout error';
  }
  if (lowerMessage.includes('rate limit') || lowerMessage.includes('too many requests')) {
    return 'Rate limit exceeded';
  }
  if (lowerMessage.includes('api key') || lowerMessage.includes('authentication')) {
    return 'Authentication error';
  }
  if (lowerMessage.includes('network') || lowerMessage.includes('connection')) {
    return 'Network error';
  }
  if (lowerMessage.includes('validation') || lowerMessage.includes('invalid')) {
    return 'Validation error';
  }
  if (lowerMessage.includes('openai') || lowerMessage.includes('gpt')) {
    return 'OpenAI API error';
  }
  if (lowerMessage.includes('cloudinary')) {
    return 'Image storage error';
  }
  if (lowerMessage.includes('database') || lowerMessage.includes('supabase')) {
    return 'Database error';
  }

  return 'Unknown error';
}

export async function GET(request: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('❌ Missing Supabase environment variables');
      return NextResponse.json({
        error: 'Database configuration error. Please check Supabase environment variables.',
        configurationError: true
      }, { status: 500 });
    }

    const authResult = await validateAuthToken(request);
    const { userId, error: authError } = extractUserId(authResult);

    if (authError || !userId) {
      console.error('❌ JWT validation failed:', authError);
      return NextResponse.json(
        createAuthErrorResponse(authError || 'Authentication required'),
        { status: 401 }
      );
    }

    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    const isAdmin = await checkAdminAuthorization(userId, adminSupabase);

    if (!isAdmin) {
      console.warn(`⚠️ Non-admin user ${userId} attempted to access admin analytics`);
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }

    const url = new URL(request.url);
    const timeframe = url.searchParams.get('timeframe') || 'all';
    const startDate = url.searchParams.get('startDate') || undefined;
    const endDate = url.searchParams.get('endDate') || undefined;

    if (!['day', 'week', 'month', 'all'].includes(timeframe)) {
      return NextResponse.json(
        { error: 'Invalid timeframe parameter. Must be: day, week, month, or all' },
        { status: 400 }
      );
    }

    console.log(`📊 Admin quality analytics requested: ${timeframe} by user ${userId}`);

    cleanExpiredCache();

    const cacheKey = getCacheKey(timeframe, startDate, endDate);
    const cachedData = getCachedData(cacheKey);

    if (cachedData) {
      return NextResponse.json(cachedData);
    }

    console.log('🔍 Cache miss - querying database');

    const { start, end } = getDateRangeFromTimeframe(timeframe, startDate, endDate);
    const isRecent = (Date.now() - start.getTime()) < (7 * 24 * 60 * 60 * 1000);

    const [systemHealth, qualityTrends, patternEffectiveness, userSatisfaction, failureAnalysis] = await Promise.all([
      getSystemHealth(adminSupabase),
      getQualityTrends(adminSupabase, timeframe, start, end),
      getPatternEffectiveness(adminSupabase),
      getUserSatisfaction(adminSupabase),
      getFailureAnalysis(adminSupabase),
    ]);

    const response = {
      systemHealth,
      qualityTrends,
      patternEffectiveness,
      userSatisfaction,
      failureAnalysis,
    };

    setCachedData(cacheKey, response, isRecent);

    console.log(`✅ Analytics generated: ${systemHealth.totalComics} comics analyzed`);

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('❌ Admin quality analytics error:', {
      message: error.message,
      stack: error.stack
    });

    return NextResponse.json(
      {
        error: error.message || 'Failed to generate quality analytics',
        details: process.env.NODE_ENV === 'development' ? error.toString() : undefined
      },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 200,
  });
}
