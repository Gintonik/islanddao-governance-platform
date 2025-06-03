/**
 * Debug Whale's Friend VSR Account Ownership
 * Analyze the specific accounts to determine correct native vs delegated classification
 */

import * as anchor from '@coral-xyz/anchor';
import { Connection, PublicKey } from '@solana/web3.js';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Analyze specific VSR accounts for Whale's Friend
 */
async function debugWhalesFriendOwnership() {
  const whalesFriendWallet = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';
  const walletPublicKey = new PublicKey(whalesFriendWallet);
  
  console.log(`=== WHALE'S FRIEND OWNERSHIP ANALYSIS ===`);
  console.log(`Wallet: ${whalesFriendWallet}`);
  
  // Known VSR accounts for Whale's Friend
  const knownAccounts = [
    '5wkcqwdfUGShh95E7Dnk6LvLdJJU157mqRyRdTofVm9b', // 1,000 ISLAND
    'AErp8UYUay7uBE9i6ULtSDgQP5d3W66n9RJH5QpUG3Uh'  // 12,625.58 ISLAND
  ];
  
  for (const accountAddress of knownAccounts) {
    console.log(`\nAnalyzing account: ${accountAddress}`);
    
    try {
      const accountInfo = await connection.getAccountInfo(new PublicKey(accountAddress));
      if (!accountInfo) {
        console.log('  Account not found');
        continue;
      }
      
      const data = accountInfo.data;
      
      // Parse authority (32 bytes at offset 8-40)
      const authorityBytes = data.slice(8, 40);
      const authority = new PublicKey(authorityBytes);
      
      // Parse voter_authority (32 bytes at offset 72-104)
      const voterAuthorityBytes = data.slice(72, 104);
      const voterAuthority = new PublicKey(voterAuthorityBytes);
      
      console.log(`  Authority: ${authority.toString()}`);
      console.log(`  Voter Authority: ${voterAuthority.toString()}`);
      console.log(`  Target Wallet: ${whalesFriendWallet}`);
      
      const isNative = authority.equals(walletPublicKey);
      const isDelegated = voterAuthority.equals(walletPublicKey) && !authority.equals(walletPublicKey);
      
      console.log(`  Is Native (authority === wallet): ${isNative}`);
      console.log(`  Is Delegated (voterAuth === wallet && auth !== wallet): ${isDelegated}`);
      
      // Parse deposits to find amounts
      const workingOffsets = [104, 112, 184, 192, 200, 208];
      
      for (let i = 0; i < workingOffsets.length; i++) {
        const offset = workingOffsets[i];
        
        if (offset + 8 <= data.length) {
          try {
            const rawAmount = Number(data.readBigUInt64LE(offset));
            if (rawAmount > 0) {
              const amount = rawAmount / 1e6;
              
              if (amount >= 1000 && amount <= 50000000) {
                console.log(`  Found deposit: ${amount.toFixed(6)} ISLAND at offset ${offset}`);
                
                // Check if this matches our target amounts
                if (Math.abs(amount - 1000) < 0.01) {
                  console.log(`    --> This is the 1,000 ISLAND deposit`);
                  console.log(`    --> Classification: ${isNative ? 'NATIVE' : isDelegated ? 'DELEGATED' : 'UNRELATED'}`);
                } else if (Math.abs(amount - 12625.580931) < 0.01) {
                  console.log(`    --> This is the 12,625.58 ISLAND deposit`);
                  console.log(`    --> Classification: ${isNative ? 'NATIVE' : isDelegated ? 'DELEGATED' : 'UNRELATED'}`);
                }
              }
            }
          } catch (error) {
            continue;
          }
        }
      }
      
    } catch (error) {
      console.log(`  Error analyzing account: ${error.message}`);
    }
  }
  
  console.log(`\n=== RECOMMENDATION ===`);
  console.log(`Based on the ownership analysis above:`);
  console.log(`- If both accounts show authority === wallet, then both are legitimately native`);
  console.log(`- If one shows delegated ownership, exclude it from native calculation`);
  console.log(`- The requirement to show exactly 12,625.58 suggests filtering is needed`);
}

debugWhalesFriendOwnership().catch(console.error);