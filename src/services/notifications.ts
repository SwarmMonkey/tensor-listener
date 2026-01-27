/**
 * Notification Service
 * 
 * Handles email notifications via Resend for NFT sales and offers.
 * Fetches user profiles from Supabase and sends formatted emails.
 */

import { Resend } from 'resend';
import type { SupabaseClient } from '@supabase/supabase-js';
import { generateSaleEmail, type SaleEmailData } from '../templates/sale-email.js';
import { generateOfferEmail, type OfferEmailData } from '../templates/offer-email.js';

// --- Configuration ---
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'notifications@graded.app';

if (!RESEND_API_KEY) {
  console.warn('⚠️ RESEND_API_KEY not set - email notifications will be disabled');
}

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null;

// --- Types ---
export interface UserProfile {
  email: string;
  display_name: string | null;
}

export interface SaleNotificationData {
  sellerWallet: string;
  nftName: string;
  price: number;
  currency: 'SOL' | 'USDC';
  buyerWallet: string;
}

export interface OfferNotificationData {
  ownerWallet: string;
  nftName: string;
  price: number;
  currency: 'SOL' | 'USDC';
  bidderWallet: string;
}

// --- Helper Functions ---
function truncateWallet(wallet: string): string {
  if (wallet.length <= 8) return wallet;
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

// --- User Profile Functions ---
/**
 * Fetches user profile from Supabase profiles table
 * @param supabase - Supabase client instance
 * @param walletAddress - User's wallet address
 * @returns User profile with email and display_name, or null if not found/no email
 */
export async function getUserProfile(
  supabase: SupabaseClient,
  walletAddress: string
): Promise<UserProfile | null> {
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('email, display_name')
      .eq('wallet_address', walletAddress)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // No profile found
        return null;
      }
      console.error(`❌ Error fetching profile for ${truncateWallet(walletAddress)}:`, error.message);
      return null;
    }

    if (!data || !data.email) {
      // User exists but has no email
      return null;
    }

    return {
      email: data.email,
      display_name: data.display_name,
    };
  } catch (err) {
    console.error(`❌ Unexpected error fetching profile for ${truncateWallet(walletAddress)}:`, err);
    return null;
  }
}

// --- Sale Notification ---
/**
 * Sends email notification when an NFT is sold
 * @param supabase - Supabase client instance
 * @param data - Sale notification data
 */
export async function sendSaleNotification(
  supabase: SupabaseClient,
  data: SaleNotificationData
): Promise<void> {
  if (!resend) {
    console.log('⏭️ Skipping sale notification - Resend not configured');
    return;
  }

  try {
    // Get user profile
    const profile = await getUserProfile(supabase, data.sellerWallet);
    
    if (!profile) {
      console.log(`⏭️ Skipping sale notification - no email found for seller ${truncateWallet(data.sellerWallet)}`);
      return;
    }

    // Generate email HTML
    const emailData: SaleEmailData = {
      nftName: data.nftName,
      price: data.price,
      currency: data.currency,
      walletAddress: data.buyerWallet,
      displayName: profile.display_name,
    };

    const html = generateSaleEmail(emailData);

    // Send email
    const { data: emailResult, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [profile.email],
      subject: `🎉 Your card "${data.nftName}" sold for ${data.currency === 'SOL' ? `◎${data.price.toFixed(4)} SOL` : `$${data.price.toFixed(2)} USDC`}!`,
      html,
    });

    if (error) {
      console.error(`❌ Failed to send sale notification to ${profile.email}:`, error);
      return;
    }

    console.log(`✅ Sale notification sent to ${profile.email} (${emailResult?.id || 'unknown'})`);
  } catch (err) {
    // Don't crash the service if email fails
    console.error(`❌ Error sending sale notification:`, err);
  }
}

// --- Offer Notification ---
/**
 * Sends email notification when an NFT receives an offer
 * @param supabase - Supabase client instance
 * @param data - Offer notification data
 */
export async function sendOfferNotification(
  supabase: SupabaseClient,
  data: OfferNotificationData
): Promise<void> {
  if (!resend) {
    console.log('⏭️ Skipping offer notification - Resend not configured');
    return;
  }

  try {
    // Get user profile
    const profile = await getUserProfile(supabase, data.ownerWallet);
    
    if (!profile) {
      console.log(`⏭️ Skipping offer notification - no email found for owner ${truncateWallet(data.ownerWallet)}`);
      return;
    }

    // Generate email HTML
    const emailData: OfferEmailData = {
      nftName: data.nftName,
      price: data.price,
      currency: data.currency,
      walletAddress: data.bidderWallet,
      displayName: profile.display_name,
    };

    const html = generateOfferEmail(emailData);

    // Send email
    const { data: emailResult, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [profile.email],
      subject: `💰 New offer received for "${data.nftName}": ${data.currency === 'SOL' ? `◎${data.price.toFixed(4)} SOL` : `$${data.price.toFixed(2)} USDC`}`,
      html,
    });

    if (error) {
      console.error(`❌ Failed to send offer notification to ${profile.email}:`, error);
      return;
    }

    console.log(`✅ Offer notification sent to ${profile.email} (${emailResult?.id || 'unknown'})`);
  } catch (err) {
    // Don't crash the service if email fails
    console.error(`❌ Error sending offer notification:`, err);
  }
}
