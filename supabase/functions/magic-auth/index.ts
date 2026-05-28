/**
 * Magic Auth Edge Function
 *
 * Verifies Magic DID tokens and creates/returns Supabase Auth sessions.
 * This bridges Magic Link authentication with Supabase RLS policies.
 *
 * Flow:
 * 1. Client sends Magic DID token after successful Magic login
 * 2. This function verifies the token with Magic's API
 * 3. Creates or finds existing Supabase Auth user with profile ID
 * 4. Signs them in using the admin API and returns session tokens
 *
 * The key insight is that we create Supabase Auth users with the same ID
 * as the profile ID, so auth.uid() in RLS matches profile.id.
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface MagicUserMetadata {
  issuer: string;
  publicAddress: string;
  email: string;
  phoneNumber: string | null;
  isMfaEnabled: boolean;
  recoveryFactors: unknown[];
}

interface VerifyResponse {
  success: boolean;
  accessToken?: string;
  refreshToken?: string;
  user?: {
    id: string;
    email: string;
  };
  error?: string;
}

// Generate a secure random password
function generateSecurePassword(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);
  return Array.from(array, byte => chars[byte % chars.length]).join('');
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { didToken, profileId } = await req.json();

    if (!didToken) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing DID token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!profileId) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing profile ID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get Magic secret key from environment
    const magicSecretKey = Deno.env.get("MAGIC_SECRET_KEY");
    if (!magicSecretKey) {
      console.error("MAGIC_SECRET_KEY not configured");
      return new Response(
        JSON.stringify({ success: false, error: "Server configuration error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify the DID token with Magic's API
    console.log("Verifying Magic DID token...");
    console.log("DID token length:", didToken.length);
    console.log("DID token preview:", didToken.substring(0, 50) + "...");

    // The DID token is a Base64-encoded JSON array: [proof, claim]
    // The claim object contains: iat, ext, iss, sub, aud, nbf, tid, add
    let issuer: string;
    try {
      // Handle URL-safe Base64 encoding (replace - with + and _ with /)
      let normalizedToken = didToken.replace(/-/g, '+').replace(/_/g, '/');

      // Add padding if needed
      const paddingNeeded = (4 - (normalizedToken.length % 4)) % 4;
      normalizedToken += '='.repeat(paddingNeeded);

      // DID token is Base64 encoded JSON array
      const decoded = atob(normalizedToken);
      console.log("Decoded token:", decoded.substring(0, 200));

      const parsed = JSON.parse(decoded);
      console.log("Parsed token type:", typeof parsed, Array.isArray(parsed));

      if (Array.isArray(parsed) && parsed.length >= 2) {
        // Format: [proof, claim] where claim is a JSON string
        let claim = parsed[1];
        // If claim is a string, parse it
        if (typeof claim === "string") {
          claim = JSON.parse(claim);
        }
        issuer = claim.iss;
        console.log("Extracted issuer from array format:", issuer);
      } else if (parsed.iss) {
        // Direct claim object
        issuer = parsed.iss;
        console.log("Extracted issuer from direct format:", issuer);
      } else if (parsed.claim && parsed.claim.iss) {
        // Nested claim object
        issuer = parsed.claim.iss;
        console.log("Extracted issuer from nested format:", issuer);
      } else {
        console.error("Could not find issuer in parsed token:", JSON.stringify(parsed).substring(0, 500));
        throw new Error("No issuer found in token");
      }
    } catch (decodeError) {
      console.error("Failed to decode DID token:", decodeError);
      console.error("Raw token (first 100 chars):", didToken.substring(0, 100));
      console.error("Token length:", didToken.length);
      const errorMessage = decodeError instanceof Error ? decodeError.message : "Unknown decode error";
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid DID token format",
          details: errorMessage,
          tokenLength: didToken.length,
          tokenPreview: didToken.substring(0, 30) + "..."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!issuer) {
      console.error("Issuer is undefined after parsing");
      return new Response(
        JSON.stringify({ success: false, error: "Could not extract issuer from token" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Call Magic API with issuer as query parameter
    console.log("Calling Magic API with issuer:", issuer);
    const magicResponse = await fetch(`https://api.magic.link/v1/admin/auth/user/get?issuer=${encodeURIComponent(issuer)}`, {
      method: "GET",
      headers: {
        "X-Magic-Secret-Key": magicSecretKey,
      },
    });

    if (!magicResponse.ok) {
      const errorText = await magicResponse.text();
      console.error("Magic verification failed:", magicResponse.status, errorText);
      console.error("Issuer used:", issuer);
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid or expired token",
          magicStatus: magicResponse.status,
          magicError: errorText,
          issuerUsed: issuer.substring(0, 30) + "..."
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const magicData = await magicResponse.json();
    const magicUser: MagicUserMetadata = magicData.data;

    if (!magicUser || !magicUser.email) {
      console.error("No email in Magic response:", magicData);
      return new Response(
        JSON.stringify({ success: false, error: "Could not retrieve user info from Magic" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Magic user verified:", magicUser.email, "issuer:", magicUser.issuer);

    // Create Supabase admin client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // Check if profile exists
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .eq("id", profileId)
      .single();

    if (profileError || !profile) {
      console.error("Profile not found:", profileId, profileError);
      return new Response(
        JSON.stringify({ success: false, error: "Profile not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Profile found:", profile.id, profile.email);

    // Generate a secure password for this session
    const sessionPassword = generateSecurePassword();

    // Use direct REST API calls for admin operations since SDK version may not have them
    const authApiUrl = `${supabaseUrl}/auth/v1/admin`;
    const authHeaders = {
      "Authorization": `Bearer ${supabaseServiceKey}`,
      "apikey": supabaseServiceKey,
      "Content-Type": "application/json",
    };

    // Try to find existing auth user by ID first
    let authUser: { id: string; email?: string } | null = null;
    console.log("Checking for existing auth user with ID:", profileId);

    const getUserResponse = await fetch(`${authApiUrl}/users/${profileId}`, {
      method: "GET",
      headers: authHeaders,
    });

    if (getUserResponse.ok) {
      const userData = await getUserResponse.json();
      authUser = userData;
      console.log("Found existing auth user by ID:", authUser?.id);

      // Update the user's password for this session
      console.log("Updating password for existing auth user...");
      const updateResponse = await fetch(`${authApiUrl}/users/${authUser!.id}`, {
        method: "PUT",
        headers: authHeaders,
        body: JSON.stringify({
          password: sessionPassword,
          user_metadata: {
            magic_issuer: magicUser.issuer,
            magic_public_address: magicUser.publicAddress,
            profile_id: profileId,
          },
        }),
      });

      if (!updateResponse.ok) {
        const updateError = await updateResponse.text();
        console.error("Failed to update user password:", updateResponse.status, updateError);
        return new Response(
          JSON.stringify({ success: false, error: "Failed to update auth user" }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      console.log("Password updated successfully");
    } else {
      // User doesn't exist, create new one
      console.log("Auth user not found, creating new user with profile ID:", profileId);

      const createResponse = await fetch(`${authApiUrl}/users`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          id: profileId,
          email: magicUser.email,
          password: sessionPassword,
          email_confirm: true,
          user_metadata: {
            magic_issuer: magicUser.issuer,
            magic_public_address: magicUser.publicAddress,
            profile_id: profileId,
          },
        }),
      });

      if (!createResponse.ok) {
        const createError = await createResponse.text();
        console.error("Failed to create auth user:", createResponse.status, createError);

        // If user already exists with different ID (by email), try to find them
        if (createError.includes("already") || createError.includes("exists")) {
          console.log("User may exist with different ID, listing users to find by email...");
          const listResponse = await fetch(`${authApiUrl}/users?filter=email:eq:${encodeURIComponent(magicUser.email)}`, {
            method: "GET",
            headers: authHeaders,
          });

          if (listResponse.ok) {
            const listData = await listResponse.json();
            const users = listData.users || listData;
            if (Array.isArray(users) && users.length > 0) {
              authUser = users[0];
              console.log("Found user by email with ID:", authUser?.id);

              // Update their password
              const updateResponse = await fetch(`${authApiUrl}/users/${authUser!.id}`, {
                method: "PUT",
                headers: authHeaders,
                body: JSON.stringify({ password: sessionPassword }),
              });

              if (!updateResponse.ok) {
                console.error("Failed to update found user's password");
              }
            }
          }
        }

        if (!authUser) {
          return new Response(
            JSON.stringify({ success: false, error: `Failed to create auth user: ${createError}` }),
            { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      } else {
        const newUser = await createResponse.json();
        authUser = newUser;
        console.log("Created new auth user:", authUser?.id);
      }
    }

    if (!authUser) {
      return new Response(
        JSON.stringify({ success: false, error: "Failed to get or create auth user" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sign in using password to get session tokens
    console.log("Signing in to get session tokens...");
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { data: signInData, error: signInError } = await supabaseClient.auth.signInWithPassword({
      email: magicUser.email,
      password: sessionPassword,
    });

    if (signInError || !signInData.session) {
      console.error("Failed to sign in:", signInError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to create session" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("Session created successfully for user:", authUser.id);

    const response: VerifyResponse = {
      success: true,
      accessToken: signInData.session.access_token,
      refreshToken: signInData.session.refresh_token,
      user: {
        id: authUser.id,
        email: magicUser.email,
      },
    };

    return new Response(
      JSON.stringify(response),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Magic auth error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
