/**
 * Discord Bot Notification Service
 *
 * Sends high-value listing alerts (≥600 USDC) to Discord with clickable buttons.
 * Uses discord.js for full bot functionality including action buttons.
 */

import { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, TextChannel } from 'discord.js';

// --- Configuration ---
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_CHANNEL_ID = process.env.DISCORD_CHANNEL_ID;
const HIGH_VALUE_THRESHOLD_USDC = 600;

// SOL mint address for price lookup
const SOL_MINT = 'So11111111111111111111111111111111111111112';

// Cache for SOL price (refreshed every 5 minutes)
let cachedSolPrice: number | null = null;
let lastPriceFetch: number = 0;
const PRICE_CACHE_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Fetch current SOL price in USDC from Jupiter Price API
 */
async function fetchSolPrice(): Promise<number> {
  const now = Date.now();

  // Return cached price if still valid
  if (cachedSolPrice !== null && (now - lastPriceFetch) < PRICE_CACHE_MS) {
    return cachedSolPrice;
  }

  try {
    const response = await fetch(`https://api.jup.ag/price/v2?ids=${SOL_MINT}`);
    if (!response.ok) {
      throw new Error(`Jupiter API error: ${response.status}`);
    }

    const data = await response.json();
    const price = data?.data?.[SOL_MINT]?.price;

    if (typeof price === 'number' && price > 0) {
      cachedSolPrice = price;
      lastPriceFetch = now;
      console.log(`💰 Updated SOL price: $${price.toFixed(2)}`);
      return price;
    }

    throw new Error('Invalid price data from Jupiter');
  } catch (error) {
    console.error('⚠️ Failed to fetch SOL price:', error);
    // Fall back to cached price or default
    return cachedSolPrice ?? 150; // Conservative fallback
  }
}

// --- State ---
let client: Client | null = null;
let isInitialized = false;

/**
 * Initialize Discord bot
 */
export async function initializeDiscord(): Promise<void> {
  if (!DISCORD_BOT_TOKEN || !DISCORD_CHANNEL_ID) {
    console.log('⏭️  Discord bot not configured - high-value listing alerts will be disabled');
    console.log('   Required: DISCORD_BOT_TOKEN and DISCORD_CHANNEL_ID');
    return;
  }

  try {
    // Create Discord client with minimal intents
    client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
      ],
    });

    // Wait for bot to be ready
    await new Promise<void>((resolve, reject) => {
      if (!client) {
        reject(new Error('Client not initialized'));
        return;
      }

      client.once('clientReady', () => {
        console.log(`✅ Discord bot connected as ${client?.user?.tag}`);
        isInitialized = true;
        resolve();
      });

      client.once('error', (error) => {
        console.error('❌ Discord bot connection error:', error);
        reject(error);
      });

      // Login with bot token
      client.login(DISCORD_BOT_TOKEN).catch(reject);
    });

  } catch (error) {
    console.error('❌ Failed to initialize Discord bot:', error);
    client = null;
    isInitialized = false;
  }
}

/**
 * Shutdown Discord bot
 */
export async function shutdownDiscord(): Promise<void> {
  if (client && isInitialized) {
    console.log('👋 Shutting down Discord bot...');
    await client.destroy();
    client = null;
    isInitialized = false;
  }
}

/**
 * Convert SOL price to USDC equivalent
 */
async function convertSolToUsdc(solAmount: number): Promise<number> {
  const solPrice = await fetchSolPrice();
  return solAmount * solPrice;
}

/**
 * Truncate wallet address for display
 */
function truncateWallet(wallet: string): string {
  if (!wallet || wallet.length < 8) return wallet;
  return `${wallet.slice(0, 4)}...${wallet.slice(-4)}`;
}

/**
 * Listing alert data interface
 */
export interface HighValueListingData {
  nftName: string;
  price: number;
  currency: 'SOL' | 'USDC';
  collectionSlug: string;
  sellerWallet: string;
  imageUrl?: string | null;
  mintAddress: string;
}

/**
 * Send high-value listing alert to Discord with clickable button
 * Only sends if listing price >= 600 USDC equivalent
 */
export async function sendHighValueListingAlert(data: HighValueListingData): Promise<void> {
  // Skip if Discord not configured
  if (!isInitialized || !client || !DISCORD_CHANNEL_ID) {
    return;
  }

  try {
    // Calculate USDC equivalent value
    let usdcValue: number;
    if (data.currency === 'USDC') {
      usdcValue = data.price;
    } else {
      usdcValue = await convertSolToUsdc(data.price);
    }

    // Only send if meets threshold
    if (usdcValue < HIGH_VALUE_THRESHOLD_USDC) {
      console.log(`⏭️  Skipping Discord alert - below threshold: ${data.currency === 'USDC' ? `$${data.price.toFixed(2)}` : `◎${data.price.toFixed(4)}`} (~$${usdcValue.toFixed(2)})`);
      return;
    }

    // Get the channel
    const channel = await client.channels.fetch(DISCORD_CHANNEL_ID);
    if (!channel || !(channel instanceof TextChannel)) {
      console.error('❌ Discord channel not found or not a text channel');
      return;
    }

    // Build embed fields
    const fields: any[] = [
      {
        name: '💰 Price',
        value: data.currency === 'USDC'
          ? `$${data.price.toFixed(2)} USDC`
          : `◎${data.price.toFixed(4)} SOL`,
        inline: true,
      },
      {
        name: '💵 USDC Value',
        value: `~$${usdcValue.toFixed(2)}`,
        inline: true,
      },
    ];

    // Add collection field - always show "Graded"
    fields.push({
      name: '📦 Collection',
      value: 'Graded',
      inline: true,
    });

    fields.push(
      {
        name: '🏪 Marketplace',
        value: 'Tensor',
        inline: true,
      },
      {
        name: '👤 Seller',
        value: data.sellerWallet ? `\`${truncateWallet(data.sellerWallet)}\`` : 'Unknown',
        inline: true,
      },
      {
        name: '🔗 Mint Address',
        value: data.mintAddress ? `\`${truncateWallet(data.mintAddress)}\`` : 'Unknown',
        inline: true,
      }
    );

    // Build the NFT URL
    const nftUrl = data.collectionSlug && data.mintAddress
      ? `https://www.graded.world/${data.collectionSlug}/${data.mintAddress}`
      : null;

    // Build embed using EmbedBuilder
    const embed = new EmbedBuilder()
      .setTitle('🔥 High-Value Listing Alert')
      .setDescription(
        `**${data.nftName || 'Unknown NFT'}** has been listed on Tensor!` +
        (nftUrl ? `\n\n**[View on Graded](${nftUrl})**` : '')
      )
      .setColor(0xFFA500) // Orange color
      .addFields(fields)
      .setTimestamp()
      .setFooter({ text: 'Graded • Tensor Listener' });

    // Add large image if available
    if (data.imageUrl && data.imageUrl.trim() && data.imageUrl.startsWith('http')) {
      embed.setImage(data.imageUrl);
    }

    // Add URL to make title clickable
    if (nftUrl) {
      embed.setURL(nftUrl);
    }

    // Build action button (only if we have valid URL)
    const components = [];
    if (nftUrl) {
      const button = new ButtonBuilder()
        .setLabel('View on Graded')
        .setStyle(ButtonStyle.Link)
        .setURL(nftUrl);

      const row = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(button);

      components.push(row);
    } else {
      console.log(`⚠️  No URL for Discord button - collectionSlug: "${data.collectionSlug}", mintAddress: "${data.mintAddress}"`);
    }

    // Send message with embed and button
    await channel.send({
      embeds: [embed],
      components: components.length > 0 ? components : undefined,
    });

    console.log(`🤖 High-value listing alert sent: ${data.nftName} @ ${data.currency === 'USDC' ? `$${data.price.toFixed(2)}` : `◎${data.price.toFixed(4)}`} (~$${usdcValue.toFixed(2)} USDC)`);
    console.log(`   URL: ${nftUrl || 'none'} | Slug: "${data.collectionSlug}" | Mint: "${data.mintAddress}"`);
  } catch (err) {
    console.error('❌ Failed to send Discord alert:', err);
    // Don't throw - gracefully degrade and continue service
  }
}
