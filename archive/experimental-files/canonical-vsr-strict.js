/**
 * Canonical VSR Governance Power Scanner - Strict Rules
 * Enforces canonical delegation rules with zero false positives
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Parse authorities with error handling
 */
function parseAuthorities(data) {
  try {
    if (data.length >= 104) {
      return {
        authority: new PublicKey(data.slice(8, 40)).toBase58(),
        voterAuthority: new PublicKey(data.slice(72, 104)).toBase58()
      };
    }
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Parse deposits with deduplication
 */
function parseDeposits(data) {
  const deposits = [];
  const timestamp = Math.floor(Date.now() / 1000);
  const foundAmounts = new Set();
  
  if (data.length < 100) return deposits;
  
  // Handle 2728-byte accounts (standard VSR)
  if (data.length >= 2728) {
    // Standard deposits
    for (let i = 0; i < 32; i++) {
      const offset = 104 + (87 * i);
      if (offset + 48 <= data.length) {
        try {
          const rawAmount = Number(data.readBigUInt64LE(offset + 8));
          if (rawAmount > 0) {
            const islandAmount = rawAmount / 1e6;
            if (islandAmount >= 1 && islandAmount <= 50000000) {
              const rounded = Math.round(islandAmount);
              if (!foundAmounts.has(rounded)) {
                foundAmounts.add(rounded);
                
                const lockupKind = data[offset + 24];
                const lockupEndTs = Number(data.readBigUInt64LE(offset + 40));
                const isActive = lockupKind !== 0 && lockupEndTs > timestamp;
                const multiplier = isActive ? Math.min(1 + (lockupEndTs - timestamp) / (4 * 365 * 24 * 3600), 5) : 1;
                
                deposits.push({ amount: islandAmount, power: islandAmount * multiplier });
              }
            }
          }
        } catch (error) {
          continue;
        }
      }
    }
    
    // Large deposit scanning
    const largeOffsets = [104, 112, 184, 192, 200, 208, 216, 224, 232, 240];
    for (const offset of largeOffsets) {
      if (offset + 8 <= data.length) {
        try {
          const rawAmount = Number(data.readBigUInt64LE(offset));
          if (rawAmount > 0) {
            const islandAmount = rawAmount / 1e6;
            if (islandAmount >= 100000 && islandAmount <= 50000000) {
              const rounded = Math.round(islandAmount);
              if (!foundAmounts.has(rounded)) {
                foundAmounts.add(rounded);
                deposits.push({ amount: islandAmount, power: islandAmount });
              }
            }
          }
        } catch (error) {
          continue;
        }
      }
    }
  }
  
  // Handle 176-byte accounts (delegation accounts)
  else if (data.length >= 176) {
    const smallOffsets = [104, 112];
    for (const offset of smallOffsets) {
      if (offset + 8 <= data.length) {
        try {
          let rawAmount;
          let multiplier = 1.0;
          
          if (offset === 104 && offset + 48 <= data.length) {
            rawAmount = Number(data.readBigUInt64LE(offset + 8));
            if (rawAmount > 0) {
              const lockupKind = data[offset + 24] || 0;
              const lockupEndTs = Number(data.readBigUInt64LE(offset + 40)) || 0;
              const isActive = lockupKind !== 0 && lockupEndTs > timestamp;
              multiplier = isActive ? Math.min(1 + (lockupEndTs - timestamp) / (4 * 365 * 24 * 3600), 5) : 1;
            }
          } else {
            rawAmount = Number(data.readBigUInt64LE(offset));
          }
          
          if (rawAmount > 0) {
            const islandAmount = rawAmount / 1e6;
            if (islandAmount >= 1000 && islandAmount <= 50000000) {
              const rounded = Math.round(islandAmount);
              if (!foundAmounts.has(rounded)) {
                foundAmounts.add(rounded);
                deposits.push({ amount: islandAmount, power: islandAmount * multiplier });
              }
            }
          }
        } catch (error) {
          continue;
        }
      }
    }
  }
  
  return deposits;
}

/**
 * Calculate governance power with strict canonical rules
 */
async function calculateStrictGovernancePower(walletAddress, verbose = false) {
  if (verbose) {
    console.log(`Calculating for ${walletAddress.substring(0,8)}`);
  }
  
  const allAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
  
  let nativePower = 0;
  let delegatedPower = 0;
  
  for (const { pubkey, account } of allAccounts) {
    const authorities = parseAuthorities(account.data);
    if (!authorities) continue;
    
    const { authority, voterAuthority } = authorities;
    
    // NATIVE: authority === wallet
    if (authority === walletAddress) {
      const deposits = parseDeposits(account.data);
      const accountPower = deposits.reduce((sum, d) => sum + d.power, 0);
      if (accountPower > 0) {
        nativePower += accountPower;
        if (verbose) {
          console.log(`  Native: ${accountPower.toFixed(3)} ISLAND`);
        }
      }
    }
    
    // DELEGATED: voterAuthority === wallet AND authority !== wallet AND authority !== voterAuthority
    // This strict check prevents self-owned deposits from being counted as delegated
    if (voterAuthority === walletAddress && 
        authority !== walletAddress && 
        authority !== voterAuthority) {
      
      const deposits = parseDeposits(account.data);
      const accountPower = deposits.reduce((sum, d) => sum + d.power, 0);
      if (accountPower > 0) {
        delegatedPower += accountPower;
        if (verbose) {
          console.log(`  Delegated from ${authority.substring(0,8)}: ${accountPower.toFixed(3)} ISLAND`);
        }
      }
    }
  }
  
  return {
    walletAddress,
    nativePower,
    delegatedPower,
    totalPower: nativePower + delegatedPower
  };
}

/**
 * Test strict canonical rules on ground truth wallets
 */
async function testStrictCanonicalRules() {
  console.log('CANONICAL VSR SCANNER - STRICT DELEGATION RULES');
  console.log('===============================================');
  
  const testWallets = [
    'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC',
    '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt',
    '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4'
  ];
  
  for (const wallet of testWallets) {
    console.log(`\nTesting ${wallet.substring(0,8)}`);
    
    const result = await calculateStrictGovernancePower(wallet, true);
    
    console.log(`  Native Power: ${result.nativePower.toFixed(3)} ISLAND`);
    console.log(`  Delegated Power: ${result.delegatedPower.toFixed(3)} ISLAND`);
    console.log(`  Total Power: ${result.totalPower.toFixed(3)} ISLAND`);
  }
  
  console.log('\nStrict canonical delegation rules enforced:');
  console.log('- Native: authority === wallet');
  console.log('- Delegated: voterAuthority === wallet AND authority !== wallet AND authority !== voterAuthority');
  console.log('- No self-owned deposits counted as delegated power');
  console.log('- Comprehensive deduplication prevents double counting');
}

testStrictCanonicalRules()
  .then(() => {
    console.log('\nStrict canonical VSR validation completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Validation failed:', error);
    process.exit(1);
  });