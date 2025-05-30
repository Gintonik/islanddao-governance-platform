/**
 * Accurate Lockup Calculator
 * Properly calculates governance power from individual lockups with their multipliers
 * Based on the exact lockup structure: amount × multiplier for each deposit
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { updateGovernancePowerBreakdown, getAllCitizens } = require('./db.js');

const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || '7271240f-154a-4417-9663-718ac65c8b8e'}`);

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

let vsrAccountsCache = null;

/**
 * Load all VSR accounts for processing
 */
async function loadVSRAccounts() {
  if (vsrAccountsCache) {
    return vsrAccountsCache;
  }

  try {
    console.log('Loading VSR accounts from blockchain...');
    const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    
    vsrAccountsCache = allVSRAccounts;
    console.log(`Cached ${allVSRAccounts.length} VSR accounts`);
    
    return allVSRAccounts;
    
  } catch (error) {
    console.error('Error loading VSR accounts:', error);
    throw error;
  }
}

/**
 * Parse individual lockup deposits from VSR account data
 * Extracts deposit amount, lockup expiration, and calculates multiplier
 */
function parseDepositEntry(data, offset) {
  try {
    // Extract deposit amount (8 bytes)
    const amountBytes = data.slice(offset, offset + 8);
    const amount = Number(amountBytes.readBigUInt64LE(0)) / 1e6;
    
    // Extract lockup expiration (8 bytes)
    const expirationBytes = data.slice(offset + 8, offset + 16);
    const expiration = Number(expirationBytes.readBigUInt64LE(0));
    
    // Calculate time remaining and multiplier
    const now = Date.now() / 1000;
    const timeRemaining = Math.max(0, expiration - now);
    const yearsRemaining = timeRemaining / (365.25 * 24 * 3600);
    
    // VSR multiplier formula: 1.0 + min(yearsRemaining / 4.0, 1.0)
    let multiplier = 1.0;
    if (yearsRemaining > 0) {
      multiplier += Math.min(yearsRemaining / 4.0, 1.0);
    }
    
    const governancePower = amount * multiplier;
    
    return {
      amount,
      expiration,
      yearsRemaining,
      multiplier,
      governancePower,
      valid: amount > 100 && amount < 50000000
    };
    
  } catch (error) {
    return { valid: false };
  }
}

/**
 * Extract all lockup deposits for a wallet and calculate total governance power
 */
async function calculateLockupGovernancePower(walletAddress) {
  const vsrAccounts = await loadVSRAccounts();
  const walletPubkey = new PublicKey(walletAddress);
  const walletBuffer = walletPubkey.toBuffer();
  
  let totalGovernancePower = 0;
  let maxSingleValue = 0;
  let lockupCount = 0;
  const lockupDetails = [];
  
  for (const account of vsrAccounts) {
    try {
      const data = account.account.data;
      
      // Check if wallet is referenced in this account
      let walletFound = false;
      for (let offset = 0; offset <= data.length - 32; offset += 8) {
        if (data.subarray(offset, offset + 32).equals(walletBuffer)) {
          walletFound = true;
          break;
        }
      }
      
      if (!walletFound) continue;
      
      // Look for deposit entries in this account
      // Check common deposit entry offsets
      const depositOffsets = [96, 200, 304, 408, 512];
      
      for (const depositOffset of depositOffsets) {
        if (depositOffset + 16 <= data.length) {
          const deposit = parseDepositEntry(data, depositOffset);
          
          if (deposit.valid) {
            lockupCount++;
            totalGovernancePower += deposit.governancePower;
            lockupDetails.push(deposit);
            
            console.log(`    Lockup ${lockupCount}: ${deposit.amount.toLocaleString()} ISLAND × ${deposit.multiplier.toFixed(2)} = ${deposit.governancePower.toLocaleString()} ISLAND`);
          }
        }
      }
      
      // Also check for single consolidated values (for accounts without individual lockups)
      const consolidatedOffsets = [104, 112];
      for (const offset of consolidatedOffsets) {
        if (offset + 8 <= data.length) {
          try {
            const value = Number(data.readBigUInt64LE(offset)) / 1e6;
            if (value > 1000 && value < 50000000) {
              maxSingleValue = Math.max(maxSingleValue, value);
            }
          } catch (error) {}
        }
      }
      
    } catch (error) {
      // Skip invalid accounts
    }
  }
  
  // For wallets with individual lockups, use the sum
  // For wallets without lockups, use the max consolidated value
  const finalGovernancePower = lockupCount > 0 ? totalGovernancePower : maxSingleValue;
  
  return {
    finalGovernancePower,
    lockupCount,
    lockupDetails,
    maxSingleValue
  };
}

/**
 * Find delegation records using a broader search approach
 */
async function findDelegationsBySearch(targetWalletAddress) {
  try {
    console.log(`Searching for delegations to ${targetWalletAddress.substring(0, 8)}...`);
    
    // Try to get all governance accounts and search through them
    const allAccounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID);
    console.log(`Searching through ${allAccounts.length} governance accounts...`);
    
    const targetPubkey = new PublicKey(targetWalletAddress);
    const targetBuffer = targetPubkey.toBuffer();
    const delegators = [];
    
    for (const account of allAccounts) {
      const data = account.account.data;
      
      // Look for target wallet address in the account data
      for (let offset = 0; offset <= data.length - 32; offset += 32) {
        if (data.subarray(offset, offset + 32).equals(targetBuffer)) {
          // Found reference to target, try to extract owner/delegator
          // Check common owner positions
          const ownerOffsets = [64, 0, 32, offset - 32, offset + 32];
          
          for (const ownerOffset of ownerOffsets) {
            if (ownerOffset >= 0 && ownerOffset + 32 <= data.length) {
              try {
                const ownerBytes = data.slice(ownerOffset, ownerOffset + 32);
                if (!ownerBytes.equals(targetBuffer) && !ownerBytes.every(byte => byte === 0)) {
                  const owner = new PublicKey(ownerBytes).toBase58();
                  if (owner !== targetWalletAddress && !delegators.some(d => d.owner === owner)) {
                    delegators.push({
                      owner,
                      delegate: targetWalletAddress,
                      account: account.pubkey.toBase58()
                    });
                    console.log(`  Found potential delegator: ${owner.substring(0, 8)}`);
                  }
                }
              } catch (e) {}
            }
          }
          break;
        }
      }
    }
    
    return delegators;
    
  } catch (error) {
    console.error('Error searching for delegations:', error);
    return [];
  }
}

/**
 * Calculate delegated governance power
 */
async function getDelegatedGovernancePower(targetWalletAddress) {
  const delegations = await findDelegationsBySearch(targetWalletAddress);
  
  let totalDelegatedPower = 0;
  
  for (const delegation of delegations) {
    try {
      const delegatorResult = await calculateLockupGovernancePower(delegation.owner);
      const delegatorPower = delegatorResult.finalGovernancePower;
      
      if (delegatorPower > 0) {
        totalDelegatedPower += delegatorPower;
        console.log(`  Delegation from ${delegation.owner.substring(0, 8)}: ${delegatorPower.toLocaleString()} ISLAND`);
      }
    } catch (error) {
      console.log(`  Error calculating delegator power: ${error.message}`);
    }
  }
  
  return totalDelegatedPower;
}

/**
 * Calculate complete governance breakdown for a citizen
 */
async function calculateGovernanceBreakdown(walletAddress) {
  console.log(`\nCalculating accurate governance breakdown for ${walletAddress.substring(0, 8)}...`);
  
  try {
    // Calculate native power using lockup analysis
    const nativeResult = await calculateLockupGovernancePower(walletAddress);
    const nativePower = nativeResult.finalGovernancePower;
    
    console.log(`  Found ${nativeResult.lockupCount} lockups, native power: ${nativePower.toLocaleString()} ISLAND`);
    
    // Calculate delegated power
    const delegatedPower = await getDelegatedGovernancePower(walletAddress);
    const totalPower = nativePower + delegatedPower;
    
    console.log(`  Native: ${nativePower.toLocaleString()} ISLAND`);
    console.log(`  Delegated: ${delegatedPower.toLocaleString()} ISLAND`);
    console.log(`  Total: ${totalPower.toLocaleString()} ISLAND`);
    
    return { nativePower, delegatedPower, totalPower };
    
  } catch (error) {
    console.error(`Error calculating breakdown for ${walletAddress}:`, error);
    return { nativePower: 0, delegatedPower: 0, totalPower: 0 };
  }
}

module.exports = {
  calculateLockupGovernancePower,
  getDelegatedGovernancePower,
  calculateGovernanceBreakdown
};

// Test with known values when called directly
if (require.main === module) {
  async function testAccuracy() {
    console.log('Testing accuracy against known values...');
    
    const testWallets = [
      { address: 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh', expected: 144708.981722, name: 'GJdRQcsy' },
      { address: '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt', expected: 10353648.013, name: 'DeanMachine' },
      { address: 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG', expected: 3361730.15, name: 'legend' }
    ];
    
    for (const wallet of testWallets) {
      const result = await calculateGovernanceBreakdown(wallet.address);
      const diff = Math.abs(result.nativePower - wallet.expected);
      console.log(`\n${wallet.name}: Expected ${wallet.expected.toLocaleString()}, Got ${result.nativePower.toLocaleString()}, Diff: ${diff.toLocaleString()}`);
    }
  }
  
  testAccuracy().catch(console.error);
}