import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    // Validate environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return NextResponse.json(
        { error: 'Database configuration error' },
        { status: 500 }
      );
    }

    const { phone } = await request.json();

    if (!phone) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }

    // Validate Saudi phone number format
    const phoneRegex = /^\+966[5][0-9]{8}$/;
    if (!phoneRegex.test(phone)) {
      return NextResponse.json(
        { error: 'Please enter a valid Saudi mobile number' },
        { status: 400 }
      );
    }

    // Use admin client for database operations (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check for recent OTP requests (throttling)
    const sixtySecondsAgo = new Date(Date.now() - 60 * 1000).toISOString();
    
    const { data: recentOtp, error: throttleCheckError } = await adminSupabase
      .from('phone_otp')
      .select('created_at')
      .eq('phone', phone)
      .gt('created_at', sixtySecondsAgo)
      .single();

    if (throttleCheckError && throttleCheckError.code !== 'PGRST116') {
      console.error('Error checking for recent OTP:', throttleCheckError);
      return NextResponse.json(
        { error: 'Failed to process request' },
        { status: 500 }
      );
    }

    // If a recent OTP exists, reject the request
    if (recentOtp) {
      console.log(`🚫 OTP request throttled for ${phone} - recent request found`);
      return NextResponse.json(
        { error: 'Please wait before requesting another code.' },
        { status: 429 }
      );
    }

    // Generate a random 6-digit OTP
    const otp_code = Math.floor(100000 + Math.random() * 900000).toString();

    // Set expiration time to 5 minutes from now
    const expires_at = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    // Insert or update the phone_otp table using admin client
    const { error } = await adminSupabase
      .from('phone_otp')
      .upsert({
        phone,
        otp_code,
        expires_at,
        verified: false,
        created_at: new Date().toISOString(),
      }, {
        onConflict: 'phone'
      });

    if (error) {
      console.error('Database error:', error);
      return NextResponse.json(
        { error: 'Failed to generate OTP' },
        { status: 500 }
      );
    }

    // Mock mode: Log OTP to console instead of sending SMS
    console.log(`🔐 OTP for ${phone}: ${otp_code} (expires in 5 minutes)`);

    return NextResponse.json({
      success: true,
      message: 'OTP sent successfully',
    });
  } catch (error: any) {
    console.error('Send OTP error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}