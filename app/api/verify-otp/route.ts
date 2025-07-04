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

    const { phone, otp_code } = await request.json();

    if (!phone || !otp_code) {
      return NextResponse.json(
        { error: 'Phone number and OTP code are required' },
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

    // Validate OTP code format (6 digits)
    const otpRegex = /^\d{6}$/;
    if (!otpRegex.test(otp_code)) {
      return NextResponse.json(
        { error: 'Invalid OTP code format' },
        { status: 400 }
      );
    }

    // Use admin client for database operations (bypasses RLS)
    const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if a matching OTP entry exists
    const { data: otpRecord, error: otpError } = await adminSupabase
      .from('phone_otp')
      .select('*')
      .eq('phone', phone)
      .eq('otp_code', otp_code)
      .gt('expires_at', new Date().toISOString())
      .single();

    if (otpError || !otpRecord) {
      return NextResponse.json(
        { error: 'Invalid or expired verification code' },
        { status: 400 }
      );
    }

    // Mark OTP as verified using admin client
    const { error: updateError } = await adminSupabase
      .from('phone_otp')
      .update({ verified: true })
      .eq('phone', phone)
      .eq('otp_code', otp_code);

    if (updateError) {
      console.error('Error updating OTP record:', updateError);
      return NextResponse.json(
        { error: 'Failed to verify OTP' },
        { status: 500 }
      );
    }

    // Check if user already exists in users table
    const { data: existingProfile, error: profileCheckError } = await adminSupabase
      .from('users')
      .select('id')
      .eq('email', phone) // Using email field to store phone for now
      .single();

    let userId = existingProfile?.id;

    // If user doesn't exist, create a new Supabase user
    if (!existingProfile) {
      try {
        const { data: newUser, error: createUserError } = await adminSupabase.auth.admin.createUser({
          phone: phone,
          phone_confirm: true,
          user_metadata: {
            phone: phone,
          },
        });

        if (createUserError) {
          console.error('Error creating user:', createUserError);
          return NextResponse.json(
            { error: 'Failed to create user account' },
            { status: 500 }
          );
        }

        userId = newUser.user?.id;

        // Insert into users table using admin client
        if (userId) {
          const { error: profileError } = await adminSupabase
            .from('users')
            .insert({
              id: userId,
              email: phone, // Using email field to store phone
              created_at: new Date().toISOString(),
            });

          if (profileError) {
            console.error('Error creating profile:', profileError);
            // Don't fail the request if profile creation fails
          }
        }
      } catch (createError) {
        console.error('Error in user creation process:', createError);
        return NextResponse.json(
          { error: 'Failed to create user account' },
          { status: 500 }
        );
      }
    }

    // Create a session for the user
    if (userId) {
      try {
        const { data: sessionData, error: sessionError } = await adminSupabase.auth.admin.generateLink({
          type: 'magiclink',
          email: phone, // Using email field for phone
          options: {
            redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:3000'}/`,
          },
        });

        if (sessionError) {
          console.error('Error generating session:', sessionError);
        }
      } catch (sessionError) {
        console.error('Session creation error:', sessionError);
        // Continue without session creation
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Phone number verified successfully',
      user: {
        id: userId,
        phone: phone,
      },
    });
  } catch (error: any) {
    console.error('Verify OTP error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}