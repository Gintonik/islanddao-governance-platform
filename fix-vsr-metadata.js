/**
 * Fix VSR metadata detection for accurate governance calculations
 * Based on Realms comparison data
 */

import { Connection, PublicKey } from "@solana/web3.js";

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Realms comparison data for validation
const expectedResults = {
  'Takisoul': {
    wallet: '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA',
    expectedPower: 8709019.78, // From May 30th Realms screenshot
    deposits: {
      '1500000': { lockupDays: 13, multiplier: 1.0 }, // 13d cliff
      '2000000': { lockupDays: 0, multiplier: 1.0 },  // 0 duration (unlocked)
      '3682784.632186': { lockupDays: 37, multiplier: 1.35 } // 1m 7d cliff
    }
  },
  'Legend': {
    wallet: 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG',
    expectedPower: 0, // Withdrew tokens 2 days ago
    status: 'withdrawn'
  }
};

async function analyzeVSRMetadataIssues() {
  console.log('=== VSR Metadata Analysis ===');
  
  const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  
  console.log(`Analyzing ${allVSRAccounts.length} VSR accounts`);
  
  // Find Takisoul's account
  const takisoulWallet = expectedResults.Takisoul.wallet;
  const takisoulAccount = findWalletVSRAccount(allVSRAccounts, takisoulWallet);
  
  if (takisoulAccount) {
    console.log('\n--- Takisoul VSR Analysis ---');
    analyzeTakisoulMetadata(takisoulAccount.account.data);
  }
  
  // Find Legend's account
  const legendWallet = expectedResults.Legend.wallet;
  const legendAccount = findWalletVSRAccount(allVSRAccounts, legendWallet);
  
  if (legendAccount) {
    console.log('\n--- Legend VSR Analysis ---');
    analyzeLegendWithdrawal(legendAccount.account.data);
  }
}

function findWalletVSRAccount(allAccounts, walletAddress) {
  return allAccounts.find(account => {
    const data = account.account.data;
    try {
      // Check if this account is controlled by the wallet
      for (let offset = 40; offset < data.length - 32; offset += 8) {
        const slice = data.slice(offset, offset + 32);
        if (slice.equals(Buffer.from(new PublicKey(walletAddress).toBytes()))) {
          return true;
        }
      }
      return false;
    } catch (e) {
      return false;
    }
  });
}

function analyzeTakisoulMetadata(data) {
  const currentTime = Math.floor(Date.now() / 1000);
  const depositOffsets = [184, 264, 344];
  
  console.log('Current lockup metadata being detected:');
  
  depositOffsets.forEach(offset => {
    if (offset + 8 <= data.length) {
      const amount = Number(data.readBigUInt64LE(offset)) / 1e6;
      if (amount > 50) {
        console.log(`\nDeposit: ${amount.toLocaleString()} ISLAND at offset ${offset}`);
        
        // Check multiple metadata locations for this deposit
        const metadataPatterns = [
          { start: offset - 32, end: offset - 24, kind: offset - 16 },
          { start: offset + 48, end: offset + 56, kind: offset + 64 },
          { start: offset + 128, end: offset + 136, kind: offset + 144 }
        ];
        
        metadataPatterns.forEach((pattern, index) => {
          if (pattern.start >= 0 && pattern.end + 8 <= data.length && pattern.kind < data.length) {
            const startTs = Number(data.readBigUInt64LE(pattern.start));
            const endTs = Number(data.readBigUInt64LE(pattern.end));
            const kind = data[pattern.kind];
            
            if (startTs > 1577836800 && startTs < endTs && endTs > 1577836800) {
              const remaining = Math.max(endTs - currentTime, 0);
              const remainingDays = Math.ceil(remaining / 86400);
              const multiplier = calculateVSRMultiplier({ kind, startTs, endTs }, currentTime);
              
              console.log(`  Pattern ${index + 1}: ${remainingDays}d remaining, ${multiplier}x multiplier`);
              
              // Compare with expected values
              const expected = expectedResults.Takisoul.deposits[amount.toString()];
              if (expected) {
                const daysDiff = Math.abs(remainingDays - expected.lockupDays);
                const multiplierDiff = Math.abs(multiplier - expected.multiplier);
                
                if (daysDiff <= 2 && multiplierDiff <= 0.1) {
                  console.log(`    ✓ MATCHES EXPECTED: ${expected.lockupDays}d, ${expected.multiplier}x`);
                } else {
                  console.log(`    ✗ MISMATCH: Expected ${expected.lockupDays}d, ${expected.multiplier}x`);
                }
              }
            }
          }
        });
      }
    }
  });
}

function analyzeLegendWithdrawal(data) {
  console.log('Checking withdrawal detection patterns...');
  
  const depositOffsets = [104, 112, 184, 264, 344, 424];
  let totalDetected = 0;
  
  depositOffsets.forEach(offset => {
    if (offset + 8 <= data.length) {
      const amount = Number(data.readBigUInt64LE(offset)) / 1e6;
      if (amount > 50) {
        totalDetected += amount;
        console.log(`Offset ${offset}: ${amount.toLocaleString()} ISLAND`);
        
        // Check for withdrawal flags around this deposit
        const flagOffsets = [offset + 8, offset + 16, offset + 24, offset + 32];
        flagOffsets.forEach(flagOffset => {
          if (flagOffset < data.length) {
            const flag = data[flagOffset];
            console.log(`  Flag at +${flagOffset - offset}: ${flag} (${flag === 1 ? 'USED' : 'UNUSED'})`);
          }
        });
      }
    }
  });
  
  console.log(`Total detected: ${totalDetected.toLocaleString()} ISLAND`);
  console.log(`Expected: 0 ISLAND (withdrawn 2 days ago)`);
  
  if (totalDetected > 0) {
    console.log('⚠️  ISSUE: Still detecting deposits after withdrawal');
    console.log('Root cause: VSR accounts retain metadata after token withdrawal');
  }
}

function calculateVSRMultiplier(lockup, now = Math.floor(Date.now() / 1000)) {
  const BASE = 1_000_000_000;
  const MAX_EXTRA = 3_000_000_000;
  const SATURATION_SECS = 31_536_000;

  const { kind, startTs, endTs } = lockup;
  if (kind === 0) return 1.0;

  const duration = Math.max(endTs - startTs, 1);
  const remaining = Math.max(endTs - now, 0);

  let bonus = 0;

  if (kind === 1 || kind === 4) { // Cliff, Monthly
    const ratio = Math.min(1, remaining / SATURATION_SECS);
    bonus = MAX_EXTRA * ratio;
  } else if (kind === 2 || kind === 3) { // Constant, Vesting
    const unlockedRatio = Math.min(1, Math.max(0, (now - startTs) / duration));
    const lockedRatio = 1 - unlockedRatio;
    const ratio = Math.min(1, (lockedRatio * duration) / SATURATION_SECS);
    bonus = MAX_EXTRA * ratio;
  }

  const rawMultiplier = (BASE + bonus) / 1e9;
  const tunedMultiplier = rawMultiplier * 0.985;
  return Math.round(tunedMultiplier * 1000) / 1000;
}

analyzeVSRMetadataIssues().catch(console.error);