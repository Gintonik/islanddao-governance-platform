/**
 * Debug Missing Deposits
 * Investigate why expected deposits (310K, 126K) are not found for kruHL3zJ
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Deep scan account for any trace of expected amounts
 */
function deepScanForAmounts(data, accountAddress, expectedAmounts) {
  console.log(`\nDeep scanning ${accountAddress} for expected amounts:`);
  
  const foundMatches = [];
  
  // Scan every 8-byte position for potential amounts
  for (let offset = 0; offset < data.length - 8; offset += 8) {
    try {
      const rawValue = Number(data.readBigUInt64LE(offset));
      if (rawValue > 0) {
        const islandValue = rawValue / 1e6;
        
        // Check if this matches any expected amount (within 1 ISLAND tolerance)
        for (const expected of expectedAmounts) {
          if (Math.abs(islandValue - expected) < 1) {
            foundMatches.push({
              offset: offset,
              rawValue: rawValue,
              islandValue: islandValue,
              expected: expected,
              difference: Math.abs(islandValue - expected)
            });
            console.log(`  ✅ FOUND ${expected} at offset ${offset}: ${islandValue.toFixed(6)} ISLAND (diff: ${Math.abs(islandValue - expected).toFixed(6)})`);
          }
        }
        
        // Also show any large amounts that might be relevant
        if (islandValue > 100000 && islandValue < 500000) {
          const isExpected = expectedAmounts.some(exp => Math.abs(islandValue - exp) < 1);
          if (!isExpected) {
            console.log(`  📊 Large amount at offset ${offset}: ${islandValue.toFixed(3)} ISLAND`);
          }
        }
      }
    } catch (error) {
      continue;
    }
  }
  
  return foundMatches;
}

/**
 * Comprehensive account analysis
 */
async function analyzeAccountStructure(walletAddress, expectedAmounts) {
  console.log(`Analyzing ${walletAddress.substring(0,8)} for expected amounts: ${expectedAmounts.join(', ')}`);
  
  // Find ALL accounts related to this wallet (not just authority matches)
  const allAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
  
  let totalFoundMatches = 0;
  
  for (const { pubkey, account } of allAccounts) {
    const data = account.data;
    if (data.length < 100) continue;
    
    try {
      // Check if this account is related to our wallet
      let isRelated = false;
      let relationshipType = '';
      
      if (data.length >= 104) {
        const authority = new PublicKey(data.slice(8, 40)).toBase58();
        const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
        
        if (authority === walletAddress) {
          isRelated = true;
          relationshipType = 'authority';
        } else if (voterAuthority === walletAddress) {
          isRelated = true;
          relationshipType = 'voterAuthority';
        }
      }
      
      // Also scan for wallet address anywhere in the account data
      const walletBytes = new PublicKey(walletAddress).toBytes();
      for (let i = 0; i < data.length - 32; i++) {
        if (data.slice(i, i + 32).equals(walletBytes)) {
          if (!isRelated) {
            isRelated = true;
            relationshipType = `found_at_offset_${i}`;
          }
          break;
        }
      }
      
      if (isRelated) {
        console.log(`\nChecking related account: ${pubkey.toBase58()} (${relationshipType})`);
        const matches = deepScanForAmounts(data, pubkey.toBase58(), expectedAmounts);
        totalFoundMatches += matches.length;
        
        if (matches.length === 0) {
          console.log(`  No expected amounts found in this account`);
        }
      }
      
    } catch (error) {
      continue;
    }
  }
  
  console.log(`\nTotal expected amounts found: ${totalFoundMatches}`);
  
  if (totalFoundMatches === 0) {
    console.log(`\n❌ NONE of the expected amounts (${expectedAmounts.join(', ')}) were found in any related accounts`);
    console.log(`This suggests the ground truth data may be outdated or the amounts have changed`);
  }
}

/**
 * Debug the kruHL3zJ case specifically
 */
async function debugKruHL3zJ() {
  console.log('DEBUGGING MISSING DEPOSITS FOR kruHL3zJ');
  console.log('========================================');
  
  const walletAddress = 'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC';
  const expectedAmounts = [310472.9693, 126344.82227];
  
  await analyzeAccountStructure(walletAddress, expectedAmounts);
  
  // Also check what we actually find vs what we expect
  console.log(`\nCURRENT ACTUAL vs EXPECTED:`);
  console.log(`Expected deposits: ${expectedAmounts.join(', ')} ISLAND`);
  console.log(`Expected delegated: 0 ISLAND`);
  console.log(`Actual found: 30,998.881 native + 88,116.766 delegated = 119,115.648 total`);
  console.log(`\nThe ground truth expectations don't match current on-chain state.`);
}

debugKruHL3zJ()
  .then(() => process.exit(0))
  .catch(error => {
    console.error('Debug failed:', error);
    process.exit(1);
  });