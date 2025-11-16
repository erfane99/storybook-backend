import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { validateAuthToken, extractUserId, createAuthErrorResponse } from '@/lib/auth-utils';

export const dynamic = 'force-dynamic';

export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
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

    const storybookId = params.id;

    if (!storybookId) {
      return NextResponse.json(
        { error: 'Storybook ID is required' },
        { status: 400 }
      );
    }

    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidPattern.test(storybookId)) {
      return NextResponse.json(
        { error: 'Invalid storybook ID format' },
        { status: 400 }
      );
    }

    console.log(`📊 Quality metrics requested for storybook ${storybookId} by user ${userId}`);

    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: storybook, error: storybookError } = await adminSupabase
      .from('storybook_entries')
      .select('user_id')
      .eq('id', storybookId)
      .maybeSingle();

    if (storybookError) {
      console.error('❌ Supabase query error:', storybookError);
      return NextResponse.json(
        { error: 'Failed to verify storybook' },
        { status: 500 }
      );
    }

    if (!storybook) {
      return NextResponse.json(
        { error: 'Storybook not found' },
        { status: 404 }
      );
    }

    if (storybook.user_id !== userId) {
      console.warn(`⚠️ User ${userId} attempted to view quality metrics for storybook ${storybookId} owned by ${storybook.user_id}`);
      return NextResponse.json(
        { error: 'You can only view quality metrics for your own storybooks' },
        { status: 403 }
      );
    }

    console.log(`✅ Storybook ownership verified for user ${userId}`);

    const { data: qualityMetrics, error: metricsError } = await adminSupabase
      .from('comic_quality_metrics')
      .select('*')
      .eq('comic_id', storybookId)
      .maybeSingle();

    if (metricsError) {
      console.error('❌ Failed to retrieve quality metrics:', metricsError);
      return NextResponse.json(
        { error: 'Failed to retrieve quality metrics' },
        { status: 500 }
      );
    }

    if (!qualityMetrics) {
      console.log(`⚠️ Quality metrics not found for storybook ${storybookId}`);
      return NextResponse.json({
        success: true,
        data: null,
        message: 'Quality metrics not yet available'
      });
    }

    console.log(`✅ Quality metrics returned: Grade ${qualityMetrics.quality_grade}, Score ${qualityMetrics.overall_technical_quality}%`);

    return NextResponse.json({
      success: true,
      data: {
        quality_grade: qualityMetrics.quality_grade,
        overall_technical_quality: qualityMetrics.overall_technical_quality,
        automated_scores: qualityMetrics.automated_scores || {
          character: {
            visualDNAAdherence: 0,
            panelToPanelConsistency: 0,
            fingerprintMatchAccuracy: 0,
            validationPassRate: 0,
            averageConsistencyScore: 0
          },
          environmental: {
            locationConsistency: 0,
            lightingConsistency: 0,
            colorPaletteAdherence: 0,
            recurringElementsPresence: 0,
            worldBuildingCoherence: 0
          },
          narrative: {
            storyBeatCompletion: 0,
            emotionalProgressionQuality: 0,
            dialogueEffectiveness: 0,
            pacingQuality: 0,
            panelPurposeClarity: 0
          },
          visual: {
            imageResolution: 0,
            artisticExecution: 0,
            compositionQuality: 0,
            colorHarmony: 0,
            styleConsistency: 0
          },
          technical: {
            generationSuccessRate: 0,
            processingEfficiency: 0,
            apiReliability: 0,
            errorRecoveryEffectiveness: 0,
            resourceUtilization: 0
          },
          audience: {
            ageAppropriateness: 0,
            complexityAlignment: 0,
            themeAppropriateness: 0,
            contentSafety: 0,
            engagementPotential: 0
          }
        },
        generation_metrics: qualityMetrics.generation_metrics || {
          totalPanels: 0,
          generatedPanels: 0,
          regenerationCount: 0,
          totalProcessingTime: 0,
          averageTimePerPanel: 0,
          validationAttempts: 0,
          validationSuccesses: 0,
          patternsApplied: 0,
          dnaEnforced: false,
          environmentalDNAUsed: false
        },
        created_at: qualityMetrics.created_at
      }
    });

  } catch (error: any) {
    console.error('❌ Quality metrics request failed:', {
      message: error.message,
      stack: error.stack
    });

    return NextResponse.json(
      {
        error: error.message || 'Failed to retrieve quality metrics',
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
