/**
 * Tensor WebSocket Listener (Heroku Worker)
 * 
 * Connects to Tensor's WebSocket API and listens for real-time
 * transaction events (listings, sales, delistings) for your collections.
 * Updates the nfts table in Supabase automatically.
 * 
 * Features:
 * - Automatic reconnection with exponential backoff
 * - Graceful shutdown on SIGTERM/SIGINT
 * - Production-ready error handling
 */

import WebSocket from 'ws';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// --- Configuration ---
const TENSOR_API_KEY = process.env.TENSOR_API_KEY;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;

const TENSOR_WS_URL = 'wss://api.mainnet.tensordev.io/ws';

// Token addresses
const USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const SOL_MINT = 'So11111111111111111111111111111111111111112';

// Tensor collection IDs to subscribe to
const TENSOR_COLLECTION_IDS = {
  COLLECTOR_CRYPT: '3c8b5c19-68fc-4682-8f13-8abdf9225844',
  PHYGITALS: '6f582e94-e4ed-41ab-9285-4bf456b0768a',
};

// --- Validation ---
if (!TENSOR_API_KEY) {
  console.error('❌ TENSOR_API_KEY is required');
  process.exit(1);
}
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_URL and SUPABASE_SERVICE_KEY are required');
  process.exit(1);
}

// --- Initialize Supabase ---
const supabase: SupabaseClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// --- Reconnection State ---
let reconnectAttempts = 0;
const MAX_RECONNECT_DELAY = 30000; // 30 seconds max
let currentSocket: WebSocket | null = null;
let pingInterval: NodeJS.Timeout | null = null;
let isShuttingDown = false;

// --- Main Connection Logic ---
function connect(): void {
  if (isShuttingDown) return;

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║       🎧 TENSOR WEBSOCKET LISTENER                         ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('📋 Configuration:');
  console.log(`   Tensor API Key: ✅ Set`);
  console.log(`   Supabase URL: ✅ Set`);
  console.log(`   Reconnect Attempts: ${reconnectAttempts}`);
  console.log('');

  console.log('🔌 Connecting to Tensor WebSocket...');

  const socket = new WebSocket(TENSOR_WS_URL, {
    headers: {
      'x-tensor-api-key': TENSOR_API_KEY!,
    },
  });

  currentSocket = socket;

  // Connection opened
  socket.on('open', () => {
    console.log('✅ WebSocket connection opened');
    reconnectAttempts = 0; // Reset on successful connection

    // Subscribe to collections
    const subscriptions = [
      { event: 'newTransaction', payload: { collId: TENSOR_COLLECTION_IDS.COLLECTOR_CRYPT } },
      { event: 'newTransaction', payload: { collId: TENSOR_COLLECTION_IDS.PHYGITALS } },
      { event: 'newTransaction', payload: { slug: 'collector_crypt' } },
      { event: 'newTransaction', payload: { slug: 'phygitals' } },
    ];

    console.log('\n📡 Subscribing to collections...\n');

    for (const msg of subscriptions) {
      console.log(`   Sending: ${JSON.stringify(msg)}`);
      socket.send(JSON.stringify(msg));
    }

    console.log('\n⏳ Waiting for events...\n');

    // Start ping interval to keep connection alive
    if (pingInterval) clearInterval(pingInterval);
    pingInterval = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ event: 'ping', payload: {} }));
      }
    }, 30000);
  });

  // Listen for messages
  socket.on('message', async (data: WebSocket.Data) => {
    const rawData = data.toString();
    if (!rawData) return;

    try {
      const message = JSON.parse(rawData);

      // Log pong responses briefly
      if (message.type === 'pong') {
        console.log('🏓 pong received (connection alive)');
        return;
      }

      // Log every message
      console.log('\n' + '='.repeat(70));
      console.log('📨 INCOMING MESSAGE:');
      console.log(JSON.stringify(message, null, 2));
      console.log('='.repeat(70));

      // Check for errors
      if (message.status === 'error' || message.error) {
        console.error('❌ Tensor returned an error:', message.error || message.message);
        return;
      }

      // Handle newTransaction events
      if (message.type === 'newTransaction' && message.data?.tx) {
        await handleTransaction(message);
      }
    } catch (err) {
      console.error('⚠️ Failed to parse message:', rawData);
    }
  });

  // Connection closed
  socket.on('close', (code: number, reason: Buffer) => {
    console.log(`🔴 WebSocket closed: ${code} - ${reason.toString()}`);
    
    if (pingInterval) {
      clearInterval(pingInterval);
      pingInterval = null;
    }

    if (!isShuttingDown) {
      scheduleReconnect();
    }
  });

  // Connection error
  socket.on('error', (err: Error) => {
    console.error('❌ WebSocket error:', err.message);
  });
}

// --- Reconnection with Exponential Backoff ---
function scheduleReconnect(): void {
  reconnectAttempts++;
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), MAX_RECONNECT_DELAY);
  
  console.log(`\n🔄 Reconnecting in ${delay / 1000} seconds (attempt ${reconnectAttempts})...`);
  
  setTimeout(() => {
    connect();
  }, delay);
}

// --- Transaction Handler ---
async function handleTransaction(message: any): Promise<void> {
  try {
    const { tx: txWrapper } = message.data;
    const { tx, mint } = txWrapper;

    // Extract transaction details
    const txType = tx?.txType;
    const txId = tx?.txId;
    const mintAddress = mint?.onchainId;
    const seller = tx?.seller;
    const buyer = tx?.buyer;
    const grossAmount = tx?.grossAmount;
    const grossAmountUnit = tx?.grossAmountUnit;
    const collectionSlug = mint?.slug;
    const nftName = mint?.name;

    console.log('\n📋 PARSED TRANSACTION:');
    console.log(`   Type: ${txType}`);
    console.log(`   TX ID: ${txId}`);
    console.log(`   Mint: ${mintAddress}`);
    console.log(`   NFT Name: ${nftName}`);
    console.log(`   Collection: ${collectionSlug}`);
    console.log(`   Seller: ${seller}`);
    console.log(`   Buyer: ${buyer}`);
    console.log(`   Amount: ${grossAmount}`);
    console.log(`   Currency: ${grossAmountUnit === USDC_MINT ? 'USDC' : 'SOL'}`);

    if (!mintAddress) {
      console.log('⚠️ No mint address found, skipping');
      return;
    }

    // Calculate price
    const isUSDC = grossAmountUnit === USDC_MINT;
    const decimals = isUSDC ? 6 : 9;
    const price = grossAmount ? parseFloat(grossAmount) / Math.pow(10, decimals) : null;

    console.log(`   Price: ${price !== null ? (isUSDC ? `$${price.toFixed(2)} USDC` : `◎${price.toFixed(4)} SOL`) : 'N/A'}`);

    // Build update payload based on transaction type
    const now = new Date().toISOString();
    let updatePayload: Record<string, any> = {
      updated_at: now,
    };

    switch (txType) {
      case 'LIST':
      case 'EDIT_SINGLE_LISTING':
        updatePayload = {
          ...updatePayload,
          is_listed: true,
          owner: seller,
          price_lamports: isUSDC ? null : (grossAmount ? parseInt(grossAmount) : null),
          price_sol: isUSDC ? null : price,
          price_native: isUSDC ? price : null,
          currency_address: isUSDC ? USDC_MINT : SOL_MINT,
          marketplace: 'tensor',
          listed_at: now,
        };
        break;

      case 'DELIST':
        updatePayload = {
          ...updatePayload,
          is_listed: false,
          price_lamports: null,
          price_sol: null,
          price_native: null,
          currency_address: null,
          marketplace: null,
          listed_at: null,
        };
        break;

      case 'SALE':
      case 'ACCEPT_BID':
        updatePayload = {
          ...updatePayload,
          is_listed: false,
          owner: buyer,
          price_lamports: null,
          price_sol: null,
          price_native: null,
          currency_address: null,
          marketplace: null,
          listed_at: null,
        };
        break;

      default:
        console.log(`⏭️ Unhandled transaction type: ${txType}`);
        return;
    }

    console.log('\n📝 UPDATE PAYLOAD:');
    console.log(JSON.stringify(updatePayload, null, 2));

    // Check if NFT exists in database
    const { data: existing, error: selectError } = await supabase
      .from('nfts')
      .select('mint_address, collection_slug, name, is_listed, price_sol, price_native, owner')
      .eq('mint_address', mintAddress)
      .single();

    if (selectError && selectError.code !== 'PGRST116') {
      console.error('❌ Database error:', selectError.message);
      return;
    }

    if (existing) {
      console.log('\n📊 BEFORE UPDATE:');
      console.log(JSON.stringify(existing, null, 2));

      // Update the NFT
      const { data: updated, error: updateError } = await supabase
        .from('nfts')
        .update(updatePayload)
        .eq('mint_address', mintAddress)
        .select()
        .single();

      if (updateError) {
        console.error(`❌ Failed to update: ${updateError.message}`);
      } else {
        console.log('\n✅ AFTER UPDATE:');
        console.log(JSON.stringify(updated, null, 2));
        console.log(`\n🎉 Successfully updated ${mintAddress.slice(0, 8)}... (${txType})`);
      }
    } else {
      console.log(`\n📥 NFT ${mintAddress.slice(0, 8)}... not found in database, creating new entry...`);

      // Extract additional data from the message for the new NFT
      const mintData = txWrapper.mint;
      
      // Determine collection slug from collId
      let detectedCollectionSlug = 'unknown';
      const collId = txWrapper.collId || mintData?.collId;
      if (collId === TENSOR_COLLECTION_IDS.COLLECTOR_CRYPT) {
        detectedCollectionSlug = 'collector-crypt';
      } else if (collId === TENSOR_COLLECTION_IDS.PHYGITALS) {
        detectedCollectionSlug = 'phygitals';
      }

      // Build insert payload with all available data
      const insertPayload: Record<string, any> = {
        mint_address: mintAddress,
        name: nftName ? nftName.slice(0, 32) : null, // Truncate if needed
        full_name: nftName || null,
        collection_slug: detectedCollectionSlug,
        owner: mintData?.owner || seller || buyer || null,
        image: mintData?.imageUri || null,
        attributes: mintData?.attributes || null,
        is_listed: txType === 'LIST' || txType === 'EDIT_SINGLE_LISTING',
        price_lamports: (txType === 'LIST' || txType === 'EDIT_SINGLE_LISTING') && !isUSDC && grossAmount ? parseInt(grossAmount) : null,
        price_sol: (txType === 'LIST' || txType === 'EDIT_SINGLE_LISTING') && !isUSDC ? price : null,
        price_native: (txType === 'LIST' || txType === 'EDIT_SINGLE_LISTING') && isUSDC ? price : null,
        currency_address: (txType === 'LIST' || txType === 'EDIT_SINGLE_LISTING') ? (isUSDC ? USDC_MINT : SOL_MINT) : null,
        marketplace: (txType === 'LIST' || txType === 'EDIT_SINGLE_LISTING') ? 'tensor' : null,
        listed_at: (txType === 'LIST' || txType === 'EDIT_SINGLE_LISTING') ? now : null,
        updated_at: now,
      };

      console.log('\n📝 INSERT PAYLOAD:');
      console.log(JSON.stringify(insertPayload, null, 2));

      const { data: inserted, error: insertError } = await supabase
        .from('nfts')
        .insert(insertPayload)
        .select()
        .single();

      if (insertError) {
        console.error(`❌ Failed to insert: ${insertError.message}`);
      } else {
        console.log('\n✅ SUCCESSFULLY INSERTED:');
        console.log(JSON.stringify(inserted, null, 2));
        console.log(`\n🎉 Created new NFT entry for ${mintAddress.slice(0, 8)}... (${txType})`);
      }
    }
  } catch (err) {
    console.error('❌ Error handling transaction:', err);
  }
}

// --- Graceful Shutdown ---
function shutdown(signal: string): void {
  console.log(`\n🛑 ${signal} received, shutting down gracefully...`);
  isShuttingDown = true;

  if (pingInterval) {
    clearInterval(pingInterval);
  }

  if (currentSocket && currentSocket.readyState === WebSocket.OPEN) {
    currentSocket.close();
  }

  // Give time for cleanup
  setTimeout(() => {
    console.log('👋 Goodbye!');
    process.exit(0);
  }, 1000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// --- Start ---
connect();