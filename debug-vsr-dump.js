/**
 * Debug VSR Dump - Find all Voter accounts using Anchor IDL
 * Specifically looking for wallet: 4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4
 */

import { Connection, PublicKey, Keypair } from "@solana/web3.js";
import { Program, AnchorProvider } from "@coral-xyz/anchor";
import fs from "fs";
import { config } from "dotenv";

config();

// Load VSR IDL
const vsrIdl = JSON.parse(fs.readFileSync("vsr_idl.json", "utf8"));

// VSR Program ID
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Target wallet to find
const TARGET_WALLET = "4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4";

/**
 * Create dummy wallet for read-only operations
 */
function createDummyWallet() {
  const keypair = Keypair.generate();
  return {
    publicKey: keypair.publicKey,
    signTransaction: async () => { throw new Error('Dummy wallet cannot sign'); },
    signAllTransactions: async () => { throw new Error('Dummy wallet cannot sign'); }
  };
}

/**
 * Debug VSR accounts
 */
async function debugVSRDump() {
  try {
    console.log(`🔍 DEBUG: VSR Account Dump`);
    console.log(`🔍 Program ID: ${VSR_PROGRAM_ID.toBase58()}`);
    console.log(`🔍 Target Wallet: ${TARGET_WALLET}`);
    console.log(`🔍 RPC URL: ${process.env.HELIUS_RPC_URL}`);
    
    // Set up Anchor
    const connection = new Connection(process.env.HELIUS_RPC_URL, 'confirmed');
    const dummyWallet = createDummyWallet();
    const provider = new AnchorProvider(connection, dummyWallet, { commitment: 'confirmed' });
    const program = new Program(vsrIdl, VSR_PROGRAM_ID, provider);
    
    console.log(`🔍 Anchor setup complete`);
    
    // Search for target wallet specifically using memcmp filter
    console.log(`🔍 Searching for target wallet using memcmp filter...`);
    const targetWalletPubkey = new PublicKey(TARGET_WALLET);
    
    const targetAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 8, // Authority field offset in Voter accounts
            bytes: targetWalletPubkey.toBase58()
          }
        }
      ]
    });
    
    console.log(`🔍 Found ${targetAccounts.length} accounts for target wallet`);
    
    if (targetAccounts.length > 0) {
      for (let i = 0; i < targetAccounts.length; i++) {
        const account = targetAccounts[i];
        const data = account.account.data;
        
        console.log(`\n🎯 TARGET WALLET ACCOUNT ${i + 1} ---`);
        console.log(`Address: ${account.pubkey.toBase58()}`);
        console.log(`Data Length: ${data.length} bytes`);
        console.log(`Discriminator: ${data.readBigUInt64LE(0).toString()}`);
        
        // Parse authority to confirm
        const authorityBytes = data.slice(8, 40);
        const authority = new PublicKey(authorityBytes).toBase58();
        console.log(`Authority: ${authority}`);
        
        // Parse registrar
        if (data.length >= 72) {
          const registrarBytes = data.slice(40, 72);
          const registrar = new PublicKey(registrarBytes).toBase58();
          console.log(`Registrar: ${registrar}`);
        }
        
        // Show raw data for analysis
        console.log(`Raw data (first 200 bytes):`, data.slice(0, 200).toString('hex'));
        
        // Scan for potential deposit amounts
        const depositAmounts = [];
        for (let offset = 72; offset < Math.min(data.length - 8, 2000); offset += 8) {
          const value = Number(data.readBigUInt64LE(offset));
          const asTokens = value / 1e6;
          
          // Look for reasonable token amounts
          if (value > 1000000 && value < 1000000000000) { // 1 to 1M tokens in micro-units
            if (asTokens >= 1 && asTokens <= 1000000) {
              depositAmounts.push({ offset, amount: asTokens, raw: value });
            }
          }
        }
        
        console.log(`Potential deposits found: ${depositAmounts.length}`);
        depositAmounts.slice(0, 10).forEach((dep, idx) => {
          console.log(`  Deposit ${idx}: ${dep.amount.toLocaleString()} ISLAND (${dep.raw}) at offset ${dep.offset}`);
        });
      }
    } else {
      console.log(`❌ No VSR accounts found for target wallet ${TARGET_WALLET}`);
      
      // Try a broader search for similar wallets
      console.log(`🔍 Searching for wallets starting with "4pT6E"...`);
      const allAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
      
      let foundSimilar = 0;
      for (const account of allAccounts) {
        const data = account.account.data;
        if (data.length >= 40) {
          const authorityBytes = data.slice(8, 40);
          const authority = new PublicKey(authorityBytes).toBase58();
          
          if (authority.startsWith('4pT6E') || authority.startsWith('7pPJt')) {
            foundSimilar++;
            if (foundSimilar <= 5) {
              console.log(`Similar wallet found: ${authority}`);
            }
          }
        }
      }
      
      console.log(`Found ${foundSimilar} similar wallets`);
    }
    
    if (!targetFound) {
      console.log(`\n❌ Target wallet ${TARGET_WALLET} not found in VSR accounts`);
      console.log(`🔍 This means the wallet does not have any VSR lockups in IslandDAO`);
    }
    
    console.log(`\n🔍 Debug complete. Total VSR accounts: ${voterAccounts.length}`);
    
  } catch (error) {
    console.error(`❌ Error in VSR dump: ${error.message}`);
    console.error(error.stack);
  }
}

// Run the debug
debugVSRDump();