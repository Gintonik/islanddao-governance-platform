/**
 * Complete Governance Sync
 * Adds delegation detection to complete the governance power breakdown
 * Uses co-occurrence patterns in VSR accounts to find delegation relationships
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { updateGovernancePowerBreakdown, getAllCitizens } = require('./db.js');

const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || '7271240f-154a-4417-9663-718ac65c8b8e'}`);

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

let vsrAccountsCache = null;
let powerCache = new Map();
let delegationCache = new Map();

/**
 * Load all VSR accounts for processing
 */
async function loadVSRAccounts() {
  if (vsrAccountsCache) {
    return vsrAccountsCache;
  }

  try {
    console.log('Loading VSR accounts...');
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
 * Get native governance power with caching
 */
async function getNativeGovernancePower(walletAddress) {
  if (powerCache.has(walletAddress)) {
    return powerCache.get(walletAddress);
  }

  const vsrAccounts = await loadVSRAccounts();
  const walletPubkey = new PublicKey(walletAddress);
  const walletBuffer = walletPubkey.toBuffer();
  
  let maxGovernancePower = 0;
  
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
      
      // Check governance power offsets and find the maximum
      const governanceOffsets = [104, 112];
      
      for (const offset of governanceOffsets) {
        if (offset + 8 <= data.length) {
          try {
            const value = Number(data.readBigUInt64LE(offset)) / 1e6;
            
            if (value > 1000 && value < 50000000) {
              maxGovernancePower = Math.max(maxGovernancePower, value);
            }
          } catch (error) {
            // Skip invalid data
          }
        }
      }
      
    } catch (error) {
      // Skip invalid accounts
    }
  }
  
  powerCache.set(walletAddress, maxGovernancePower);
  return maxGovernancePower;
}

/**
 * Find potential delegators by examining VSR account co-occurrence patterns
 */
async function findPotentialDelegators(targetWallet) {
  if (delegationCache.has(targetWallet)) {
    return delegationCache.get(targetWallet);
  }

  const vsrAccounts = await loadVSRAccounts();
  const targetPubkey = new PublicKey(targetWallet);
  const targetBuffer = targetPubkey.toBuffer();
  
  const coOccurringWallets = new Set();
  
  // Find all VSR accounts that contain the target wallet
  for (const account of vsrAccounts) {
    const data = account.account.data;
    
    // Check if target wallet appears in this account
    let targetFound = false;
    for (let offset = 0; offset <= data.length - 32; offset += 8) {
      if (data.subarray(offset, offset + 32).equals(targetBuffer)) {
        targetFound = true;
        break;
      }
    }
    
    if (!targetFound) continue;
    
    // Extract all other wallet addresses from this account
    for (let offset = 0; offset <= data.length - 32; offset += 32) {
      try {
        const pubkeyBytes = data.subarray(offset, offset + 32);
        
        // Skip empty or target wallet
        if (pubkeyBytes.every(byte => byte === 0) || pubkeyBytes.equals(targetBuffer)) {
          continue;
        }
        
        const pubkey = new PublicKey(pubkeyBytes);
        const walletAddress = pubkey.toBase58();
        
        // Filter out system accounts and programs
        if (!walletAddress.startsWith('11111111') && 
            !walletAddress.startsWith('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') &&
            !walletAddress.startsWith('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ') &&
            !walletAddress.startsWith('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw') &&
            !walletAddress.startsWith('9M9xrrGQJgGGpn9CCdDQNpqk9aBo8Cv5HYPGKrsWMwKi') &&
            walletAddress.length === 44) { // Standard Solana address length
          coOccurringWallets.add(walletAddress);
        }
      } catch (e) {
        // Skip invalid pubkeys
      }
    }
  }
  
  // Check governance power for co-occurring wallets
  const delegators = [];
  const targetPower = await getNativeGovernancePower(targetWallet);
  
  for (const walletAddress of coOccurringWallets) {
    const power = await getNativeGovernancePower(walletAddress);
    
    // Only count as delegator if they have governance power and it's different from target
    if (power > 0 && Math.abs(power - targetPower) > 1000) {
      delegators.push({ wallet: walletAddress, power });
    }
  }
  
  // Sort by power descending
  delegators.sort((a, b) => b.power - a.power);
  
  const totalDelegatedPower = delegators.reduce((sum, d) => sum + d.power, 0);
  const result = { delegators, totalDelegatedPower };
  
  delegationCache.set(targetWallet, result);
  return result;
}

/**
 * Update governance power breakdown for all citizens with delegation data
 */
async function updateAllCitizensCompleteGovernance() {
  try {
    console.log('Starting complete governance sync with delegation detection...');
    
    const citizens = await getAllCitizens();
    console.log(`Processing ${citizens.length} citizens`);
    
    let processed = 0;
    let updated = 0;
    let withDelegation = 0;
    
    for (const citizen of citizens) {
      try {
        console.log(`Processing ${citizen.wallet.substring(0, 8)}...`);
        
        const [nativePower, delegationData] = await Promise.all([
          getNativeGovernancePower(citizen.wallet),
          findPotentialDelegators(citizen.wallet)
        ]);
        
        if (nativePower > 0 || delegationData.totalDelegatedPower > 0) {
          await updateGovernancePowerBreakdown(
            citizen.wallet,
            nativePower,
            delegationData.totalDelegatedPower
          );
          updated++;
          
          if (delegationData.totalDelegatedPower > 0) {
            withDelegation++;
            console.log(`  Native: ${nativePower.toLocaleString()} + Delegated: ${delegationData.totalDelegatedPower.toLocaleString()} = ${(nativePower + delegationData.totalDelegatedPower).toLocaleString()} ISLAND`);
          } else {
            console.log(`  Native: ${nativePower.toLocaleString()} ISLAND`);
          }
        }
        
        processed++;
        
      } catch (error) {
        console.error(`Error processing ${citizen.wallet}:`, error);
        processed++;
      }
    }
    
    console.log('\nComplete governance sync completed');
    console.log(`Citizens processed: ${processed}`);
    console.log(`Citizens updated: ${updated}`);
    console.log(`Citizens with delegation: ${withDelegation}`);
    console.log(`Cache efficiency - Power: ${powerCache.size}, Delegation: ${delegationCache.size}`);
    
    return { processed, updated, withDelegation };
    
  } catch (error) {
    console.error('Error in complete governance sync:', error);
    throw error;
  }
}

module.exports = {
  getNativeGovernancePower,
  findPotentialDelegators,
  updateAllCitizensCompleteGovernance
};

// Run complete sync when called directly
if (require.main === module) {
  updateAllCitizensCompleteGovernance().catch(console.error);
}