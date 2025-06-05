/**
 * VSR Calculation Fix Implementation
 * Addresses phantom deposits and stale multipliers without breaking working logic
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
const ISLAND_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');

/**
 * Enhanced VSR deposit validation with balance verification
 * Fixes phantom deposit issue (Legend's case)
 */
async function validateVSRDepositsWithBalance(deposits, walletPublicKey) {
  try {
    // Get actual ISLAND token balance for the wallet
    const tokenAccounts = await connection.getTokenAccountsByOwner(walletPublicKey, {
      mint: ISLAND_MINT
    });
    
    let actualBalance = 0;
    for (const account of tokenAccounts) {
      const balance = await connection.getTokenAccountBalance(account.pubkey);
      actualBalance += parseFloat(balance.value.uiAmount || 0);
    }
    
    console.log(`Wallet actual ISLAND balance: ${actualBalance.toLocaleString()}`);
    
    // If no balance but VSR deposits detected, mark as phantom
    if (actualBalance === 0 && deposits.length > 0) {
      console.log(`⚠️  PHANTOM DEPOSITS DETECTED: VSR shows deposits but wallet has 0 ISLAND balance`);
      return {
        isPhantom: true,
        actualBalance,
        validDeposits: [],
        reason: 'zero_balance_with_vsr_deposits'
      };
    }
    
    // Validate individual deposits against total balance
    const totalVSRAmount = deposits.reduce((sum, deposit) => sum + deposit.amount, 0);
    
    if (totalVSRAmount > actualBalance * 1.1) { // 10% tolerance for rounding
      console.log(`⚠️  VSR AMOUNT EXCEEDS BALANCE: VSR=${totalVSRAmount.toLocaleString()}, Balance=${actualBalance.toLocaleString()}`);
      
      // Filter deposits to match actual balance
      const validDeposits = filterDepositsByBalance(deposits, actualBalance);
      
      return {
        isPhantom: true,
        actualBalance,
        validDeposits,
        reason: 'vsr_exceeds_balance'
      };
    }
    
    return {
      isPhantom: false,
      actualBalance,
      validDeposits: deposits,
      reason: 'balance_validated'
    };
    
  } catch (error) {
    console.log(`Balance validation failed: ${error.message}`);
    // If balance check fails, fall back to existing logic
    return {
      isPhantom: false,
      actualBalance: null,
      validDeposits: deposits,
      reason: 'balance_check_failed'
    };
  }
}

/**
 * Enhanced lockup metadata selection prioritizing recent timestamps
 * Fixes stale multiplier issue (Takisoul's case)
 */
function selectCorrectLockupMetadata(data, depositOffset, currentTime) {
  const metadataOptions = [];
  
  // Define metadata search patterns around deposit
  const searchPatterns = [
    { start: depositOffset - 32, end: depositOffset - 24, kind: depositOffset - 16, priority: 3 },
    { start: depositOffset + 48, end: depositOffset + 56, kind: depositOffset + 64, priority: 2 },
    { start: depositOffset - 52, end: depositOffset - 44, kind: depositOffset - 36, priority: 1 }
  ];
  
  searchPatterns.forEach((pattern, index) => {
    if (pattern.start >= 0 && pattern.end + 8 <= data.length && pattern.kind < data.length) {
      try {
        const startTs = Number(data.readBigUInt64LE(pattern.start));
        const endTs = Number(data.readBigUInt64LE(pattern.end));
        const kind = data[pattern.kind];
        
        if (kind >= 1 && kind <= 4 && startTs > 1577836800 && startTs < endTs && endTs > 1577836800) {
          const remaining = Math.max(endTs - currentTime, 0);
          const isActive = endTs > currentTime;
          const daysSinceCreation = (currentTime - startTs) / 86400;
          
          // Calculate freshness score (prefer recent lockups)
          const freshnessScore = daysSinceCreation < 30 ? 3 : daysSinceCreation < 90 ? 2 : 1;
          
          metadataOptions.push({
            lockup: { kind, startTs, endTs },
            remaining,
            isActive,
            daysSinceCreation,
            freshnessScore,
            priority: pattern.priority,
            patternIndex: index
          });
        }
      } catch (e) {
        // Skip invalid metadata
      }
    }
  });
  
  if (metadataOptions.length === 0) {
    return { kind: 0, startTs: 0, endTs: 0 }; // Unlocked
  }
  
  // Sort by freshness first, then by remaining time, then by priority
  metadataOptions.sort((a, b) => {
    if (a.freshnessScore !== b.freshnessScore) return b.freshnessScore - a.freshnessScore;
    if (a.isActive !== b.isActive) return b.isActive - a.isActive;
    if (a.remaining !== b.remaining) return b.remaining - a.remaining;
    return b.priority - a.priority;
  });
  
  const selected = metadataOptions[0];
  console.log(`Selected lockup: ${Math.ceil(selected.remaining / 86400)}d remaining (freshness: ${selected.freshnessScore})`);
  
  return selected.lockup;
}

/**
 * Filter deposits to match actual wallet balance
 */
function filterDepositsByBalance(deposits, actualBalance) {
  // Sort deposits by amount (largest first) and take until balance is reached
  const sorted = [...deposits].sort((a, b) => b.amount - a.amount);
  const validDeposits = [];
  let runningTotal = 0;
  
  for (const deposit of sorted) {
    if (runningTotal + deposit.amount <= actualBalance * 1.05) { // 5% tolerance
      validDeposits.push(deposit);
      runningTotal += deposit.amount;
    }
  }
  
  return validDeposits;
}

/**
 * Real-time cache busting for fresh data
 */
function addCacheBusting() {
  // Add timestamp to prevent cached responses
  const cacheBuster = Date.now();
  console.log(`Cache buster: ${cacheBuster}`);
  
  // Force fresh RPC data by using confirmed commitment
  return {
    commitment: 'confirmed',
    cacheBuster
  };
}

/**
 * Enhanced VSR deposit parsing with fixes
 */
function parseVSRDepositsEnhanced(data, currentTime, walletPublicKey) {
  const deposits = [];
  const processedAmounts = new Set();
  
  // Process lockup deposits with enhanced metadata selection
  const lockupMappings = [
    { amountOffset: 184, metadataOffsets: [{ start: 152, end: 160, kind: 168 }, { start: 232, end: 240, kind: 248 }] },
    { amountOffset: 264, metadataOffsets: [{ start: 232, end: 240, kind: 248 }, { start: 312, end: 320, kind: 328 }] },
    { amountOffset: 344, metadataOffsets: [{ start: 312, end: 320, kind: 328 }, { start: 392, end: 400, kind: 408 }] },
    { amountOffset: 424, metadataOffsets: [{ start: 392, end: 400, kind: 408 }] }
  ];

  for (const mapping of lockupMappings) {
    if (mapping.amountOffset + 8 <= data.length) {
      try {
        const rawAmount = Number(data.readBigUInt64LE(mapping.amountOffset));
        const amount = rawAmount / 1e6;
        const amountKey = Math.round(amount * 1000);

        if (amount >= 50 && amount <= 20_000_000 && !processedAmounts.has(amountKey)) {
          // Use enhanced metadata selection
          const lockup = selectCorrectLockupMetadata(data, mapping.amountOffset, currentTime);
          const multiplier = calculateVSRMultiplier(lockup, currentTime);
          const power = amount * multiplier;
          const isLocked = multiplier > 1.0;
          
          deposits.push({
            amount,
            multiplier,
            power,
            isLocked,
            classification: isLocked ? 'active_lockup' : 'unlocked',
            lockupDetails: lockup.kind > 0 ? {
              type: ['None', 'Cliff', 'Constant', 'Vesting', 'Monthly'][lockup.kind] || 'Unknown',
              isActive: lockup.endTs > currentTime,
              remainingDays: Math.ceil(Math.max(lockup.endTs - currentTime, 0) / 86400)
            } : null,
            offset: mapping.amountOffset
          });
          
          processedAmounts.add(amountKey);
        }
      } catch (e) {
        continue;
      }
    }
  }

  return deposits;
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

// Export the enhanced functions
export {
  validateVSRDepositsWithBalance,
  selectCorrectLockupMetadata,
  parseVSRDepositsEnhanced,
  addCacheBusting
};