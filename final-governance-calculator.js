/**
 * Final Governance Calculator
 * Efficient implementation based on successful delegation detection patterns
 * Focuses on completing the governance breakdown for all citizens
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { updateGovernancePowerBreakdown, getAllCitizens } = require('./db.js');

const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || '7271240f-154a-4417-9663-718ac65c8b8e'}`);

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

let vsrAccountsCache = null;
let walletPowerCache = new Map();
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
 * Extract native governance power using proven methodology with caching
 */
async function getNativeGovernancePower(walletAddress) {
  if (walletPowerCache.has(walletAddress)) {
    return walletPowerCache.get(walletAddress);
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
  
  walletPowerCache.set(walletAddress, maxGovernancePower);
  return maxGovernancePower;
}

/**
 * Find delegation relationships efficiently using co-occurrence patterns
 */
async function findDelegatedPower(targetWalletAddress) {
  if (delegationCache.has(targetWalletAddress)) {
    return delegationCache.get(targetWalletAddress);
  }

  const vsrAccounts = await loadVSRAccounts();
  const targetPubkey = new PublicKey(targetWalletAddress);
  const targetBuffer = targetPubkey.toBuffer();
  
  const potentialDelegators = new Set();
  
  // Find VSR accounts containing the target wallet
  for (const account of vsrAccounts) {
    const data = account.account.data;
    
    // Check if target wallet is in this account
    let targetFound = false;
    for (let offset = 0; offset <= data.length - 32; offset += 8) {
      if (data.subarray(offset, offset + 32).equals(targetBuffer)) {
        targetFound = true;
        break;
      }
    }
    
    if (!targetFound) continue;
    
    // Extract other wallets from this account
    for (let offset = 0; offset <= data.length - 32; offset += 32) {
      try {
        const pubkeyBytes = data.subarray(offset, offset + 32);
        
        if (pubkeyBytes.every(byte => byte === 0) || pubkeyBytes.equals(targetBuffer)) {
          continue;
        }
        
        const pubkey = new PublicKey(pubkeyBytes);
        const walletAddress = pubkey.toBase58();
        
        // Filter valid wallet addresses (exclude system accounts and self)
        if (!walletAddress.startsWith('11111111') && 
            !walletAddress.startsWith('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') &&
            !walletAddress.startsWith('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ') &&
            !walletAddress.startsWith('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw') &&
            walletAddress !== targetWalletAddress) {
          potentialDelegators.add(walletAddress);
        }
      } catch (e) {
        // Skip invalid pubkeys
      }
    }
  }
  
  // Check governance power for potential delegators efficiently
  let totalDelegatedPower = 0;
  const delegators = [];
  
  for (const delegatorAddress of potentialDelegators) {
    const power = await getNativeGovernancePower(delegatorAddress);
    
    if (power > 0) {
      // Exclude the target's own power from delegation calculation
      const targetPower = await getNativeGovernancePower(targetWalletAddress);
      if (Math.abs(power - targetPower) > 1000) { // Not the same wallet
        delegators.push({ delegator: delegatorAddress, power });
        totalDelegatedPower += power;
      }
    }
  }
  
  const result = { delegators, totalDelegatedPower };
  delegationCache.set(targetWalletAddress, result);
  
  return result;
}

/**
 * Calculate complete governance breakdown efficiently
 */
async function calculateGovernanceBreakdown(walletAddress) {
  try {
    const [nativePower, delegationData] = await Promise.all([
      getNativeGovernancePower(walletAddress),
      findDelegatedPower(walletAddress)
    ]);
    
    const delegatedPower = delegationData.totalDelegatedPower;
    const totalPower = nativePower + delegatedPower;
    
    return { 
      nativePower, 
      delegatedPower, 
      totalPower,
      delegators: delegationData.delegators
    };
    
  } catch (error) {
    console.error(`Error calculating breakdown for ${walletAddress}:`, error);
    return { nativePower: 0, delegatedPower: 0, totalPower: 0, delegators: [] };
  }
}

/**
 * Update all citizens with final governance calculation
 */
async function updateAllCitizensFinalGovernance() {
  try {
    console.log('Starting final governance calculation for all citizens...');
    
    const citizens = await getAllCitizens();
    console.log(`Processing ${citizens.length} citizens`);
    
    let processed = 0;
    let updated = 0;
    
    for (const citizen of citizens) {
      try {
        const breakdown = await calculateGovernanceBreakdown(citizen.wallet);
        
        if (breakdown.totalPower > 0) {
          await updateGovernancePowerBreakdown(
            citizen.wallet,
            breakdown.nativePower,
            breakdown.delegatedPower
          );
          updated++;
          
          if (breakdown.delegatedPower > 0) {
            console.log(`${citizen.wallet.substring(0, 8)}: ${breakdown.nativePower.toLocaleString()} native + ${breakdown.delegatedPower.toLocaleString()} delegated = ${breakdown.totalPower.toLocaleString()} ISLAND`);
          }
        }
        
        processed++;
        
        if (processed % 10 === 0) {
          console.log(`Processed ${processed}/${citizens.length} citizens (${updated} updated)`);
        }
        
      } catch (error) {
        console.error(`Error processing citizen ${citizen.wallet}:`, error);
        processed++;
      }
    }
    
    console.log('Final governance calculation completed');
    console.log(`Citizens processed: ${processed}`);
    console.log(`Citizens updated: ${updated}`);
    console.log(`Cache size - Power: ${walletPowerCache.size}, Delegation: ${delegationCache.size}`);
    
    return { processed, updated };
    
  } catch (error) {
    console.error('Error in final governance calculation:', error);
    throw error;
  }
}

/**
 * Test with known wallets to verify accuracy
 */
async function testKnownWallets() {
  console.log('Testing final governance calculator with known wallets...\n');
  
  const testWallets = [
    { 
      address: 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG', 
      name: 'legend',
      expectedNative: 3361730.15,
      expectedDelegated: 1598919.1
    },
    { 
      address: 'GJdRQcsyKZgLrpVVJeVj6j4VQRNEhNJgvyNHXqD4G4NU', 
      name: 'DeanMachine',
      expectedNative: 10353648.013,
      expectedDelegated: 0
    }
  ];
  
  for (const wallet of testWallets) {
    const result = await calculateGovernanceBreakdown(wallet.address);
    
    console.log(`${wallet.name} (${wallet.address.substring(0, 8)}):`);
    console.log(`  Native: ${result.nativePower.toLocaleString()} ISLAND (expected: ${wallet.expectedNative.toLocaleString()})`);
    console.log(`  Delegated: ${result.delegatedPower.toLocaleString()} ISLAND (expected: ${wallet.expectedDelegated.toLocaleString()})`);
    console.log(`  Total: ${result.totalPower.toLocaleString()} ISLAND`);
    
    const nativeAccuracy = Math.abs(result.nativePower - wallet.expectedNative) < 1000;
    const delegatedAccuracy = Math.abs(result.delegatedPower - wallet.expectedDelegated) < 50000;
    
    console.log(`  Native accuracy: ${nativeAccuracy ? 'GOOD' : 'NEEDS REVIEW'}`);
    console.log(`  Delegated accuracy: ${delegatedAccuracy ? 'GOOD' : 'NEEDS REVIEW'}`);
    
    if (result.delegators.length > 0) {
      console.log(`  Delegators found: ${result.delegators.length}`);
    }
    
    console.log('');
  }
}

module.exports = {
  getNativeGovernancePower,
  findDelegatedPower,
  calculateGovernanceBreakdown,
  updateAllCitizensFinalGovernance,
  testKnownWallets
};

// Run test when called directly
if (require.main === module) {
  testKnownWallets().catch(console.error);
}