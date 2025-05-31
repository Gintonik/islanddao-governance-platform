/**
 * Debug Lockup Detection for GJdRQcsy
 * Analyzes why lockup detection is failing
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

const connection = new Connection(HELIUS_RPC, 'confirmed');

/**
 * Debug lockup detection for specific deposits
 */
async function debugLockupDetection() {
  const walletAddress = 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh';
  const walletPubkey = new PublicKey(walletAddress);
  
  console.log('=== Lockup Detection Debug ===');
  console.log(`Wallet: ${walletAddress}`);
  console.log(`Current time: ${Math.floor(Date.now() / 1000)} (${new Date().toISOString()})`);
  console.log('');
  
  // Find VSR accounts
  const vsrAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 8, bytes: walletPubkey.toBase58() } }
    ]
  });
  
  if (vsrAccounts.length === 0) {
    console.log('No VSR accounts found');
    return;
  }
  
  const account = vsrAccounts[0];
  const data = account.account.data;
  
  console.log(`Found VSR account: ${account.pubkey.toBase58()}`);
  console.log('');
  
  // Look for the specific deposits we know have future timestamps
  const knownDeposits = [
    { amount: 1738.742, expectedStart: 1738742046, expectedEnd: 1751882046 },
    { amount: 1742.213, expectedStart: 1742212684, expectedEnd: 1752580684 },
    { amount: 1744.004, expectedStart: 1744003596, expectedEnd: 1759555596 },
    { amount: 25738.999, expectedStart: 0, expectedEnd: 0 }, // Large deposit
    { amount: 37626.983, expectedStart: 0, expectedEnd: 0 }  // Large deposit
  ];
  
  for (const knownDeposit of knownDeposits) {
    console.log(`=== Searching for ${knownDeposit.amount.toLocaleString()} ISLAND deposit ===`);
    
    // Scan for this deposit amount
    for (let offset = 0; offset < data.length - 8; offset += 8) {
      try {
        const value = Number(data.readBigUInt64LE(offset));
        const asTokens = value / 1e6;
        
        if (Math.abs(asTokens - knownDeposit.amount) < 0.1) {
          console.log(`Found deposit at offset ${offset}: ${asTokens.toLocaleString()} ISLAND`);
          
          // Look for timestamps around this offset
          console.log('Scanning for timestamps around this deposit:');
          
          for (let tsOffset = Math.max(0, offset - 32); tsOffset <= offset + 64 && tsOffset + 8 <= data.length; tsOffset += 8) {
            try {
              const tsValue = Number(data.readBigUInt64LE(tsOffset));
              
              if (tsValue > 1700000000 && tsValue < 1800000000) {
                const date = new Date(tsValue * 1000);
                const isFuture = tsValue > Math.floor(Date.now() / 1000);
                console.log(`  Offset ${tsOffset}: ${tsValue} (${date.toISOString()}) ${isFuture ? '[FUTURE]' : '[PAST]'}`);
                
                if (knownDeposit.expectedStart && Math.abs(tsValue - knownDeposit.expectedStart) < 10) {
                  console.log(`    ^ MATCHES expected start timestamp`);
                }
                if (knownDeposit.expectedEnd && Math.abs(tsValue - knownDeposit.expectedEnd) < 10) {
                  console.log(`    ^ MATCHES expected end timestamp`);
                }
              }
            } catch (e) {
              // Skip invalid reads
            }
          }
          
          // Test my parsing logic on this specific deposit
          console.log('Testing deposit parsing logic:');
          const deposit = parseDepositFromRawData(data, offset);
          if (deposit) {
            console.log(`  Parsed: amount=${deposit.amountDeposited}, locked=${deposit.isLocked}, start=${deposit.startTs}, end=${deposit.endTs}`);
            if (deposit.isLocked) {
              const multiplier = calculateVSRMultiplier(deposit);
              console.log(`  Multiplier: ${multiplier.toFixed(3)}`);
            }
          } else {
            console.log(`  Failed to parse deposit`);
          }
          
          console.log('');
          break;
        }
      } catch (e) {
        // Skip invalid reads
      }
    }
  }
}

/**
 * Copy of the parsing function to test
 */
function parseDepositFromRawData(data, offset) {
  try {
    if (offset + 16 > data.length) return null;
    
    const value = Number(data.readBigUInt64LE(offset));
    const asTokens = value / 1e6;
    
    if (asTokens >= 1000 && asTokens <= 100000) {
      let startTs = 0;
      let endTs = 0;
      let isLocked = false;
      let lockupKind = 0;
      
      const currentTime = Math.floor(Date.now() / 1000);
      
      for (let tsOffset = offset + 8; tsOffset <= offset + 32 && tsOffset + 16 <= data.length; tsOffset += 8) {
        try {
          const ts1 = Number(data.readBigUInt64LE(tsOffset));
          const ts2 = Number(data.readBigUInt64LE(tsOffset + 8));
          
          if (ts1 > 1700000000 && ts1 < 1800000000 && 
              ts2 > 1700000000 && ts2 < 1800000000 && 
              ts2 > ts1) {
            
            startTs = ts1;
            endTs = ts2;
            
            if (endTs > currentTime) {
              isLocked = true;
              
              const lockupDuration = endTs - startTs;
              if (lockupDuration < 86400 * 7) {
                lockupKind = 3; // Daily
              } else if (lockupDuration < 86400 * 32) {
                lockupKind = 4; // Monthly  
              } else if (lockupDuration < 86400 * 365) {
                lockupKind = 2; // Constant
              } else {
                lockupKind = 1; // Cliff
              }
            }
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      return {
        isUsed: true,
        isLocked: isLocked,
        lockupKind: lockupKind,
        amountDeposited: asTokens,
        startTs: startTs,
        endTs: endTs
      };
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Copy of multiplier calculation to test
 */
function calculateVSRMultiplier(deposit) {
  const currentTime = Math.floor(Date.now() / 1000);
  const BASELINE_MULTIPLIER = 1.0;
  const BONUS_MULTIPLIER = 2.0;
  const SATURATION_SECONDS = 4 * 365.25 * 24 * 3600;
  
  if (!deposit.isLocked) {
    return BASELINE_MULTIPLIER;
  }
  
  let effectiveRemainingSeconds = 0;
  
  switch (deposit.lockupKind) {
    case 1: // Cliff
      if (currentTime < deposit.endTs) {
        effectiveRemainingSeconds = deposit.endTs - currentTime;
      } else {
        return BASELINE_MULTIPLIER;
      }
      break;
    case 2: // Constant
      if (currentTime >= deposit.endTs) {
        return BASELINE_MULTIPLIER;
      }
      effectiveRemainingSeconds = Math.max(0, deposit.endTs - currentTime);
      break;
    default:
      if (deposit.endTs > currentTime) {
        effectiveRemainingSeconds = deposit.endTs - currentTime;
      } else {
        return BASELINE_MULTIPLIER;
      }
  }
  
  if (effectiveRemainingSeconds <= 0) {
    return BASELINE_MULTIPLIER;
  }
  
  const lockupFactor = Math.min(effectiveRemainingSeconds / SATURATION_SECONDS, 1.0);
  const multiplier = BASELINE_MULTIPLIER + (lockupFactor * BONUS_MULTIPLIER);
  
  return multiplier;
}

// Run the debug
debugLockupDetection().catch(console.error);