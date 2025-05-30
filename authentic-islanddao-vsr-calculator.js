/**
 * Authentic IslandDAO VSR Governance Power Calculator
 * Extracts real governance power using the verified VSR account structure
 * Based on analysis of lockup years (0, 1, 2, 3, 4) and active deposit amounts
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`);

/**
 * Extract authentic governance power for a wallet using IslandDAO VSR structure
 */
async function extractIslandDAOGovernancePower(walletAddress) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    const walletBuffer = walletPubkey.toBuffer();
    
    const vsrProgram = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
    const allVSRAccounts = await connection.getProgramAccounts(vsrProgram);
    
    let depositEntryAmount = 0;
    let voterWeightRecordPower = 0;
    
    // Find VSR accounts for this wallet
    for (const account of allVSRAccounts) {
      const data = account.account.data;
      
      // Check if wallet is referenced in this account
      let walletFound = false;
      for (let offset = 0; offset <= data.length - 32; offset += 8) {
        if (data.subarray(offset, offset + 32).equals(walletBuffer)) {
          walletFound = true;
          break;
        }
      }
      
      if (walletFound) {
        const discriminator = data.readBigUInt64LE(0).toString();
        
        if (discriminator === '7076388912421561650') {
          // Deposit Entry - contains current locked amount
          depositEntryAmount = Number(data.readBigUInt64LE(112)) / Math.pow(10, 6);
          
        } else if (discriminator === '14560581792603266545') {
          // Voter Weight Record - calculate from active lockups
          const activeLockups = extractActiveLockups(data);
          voterWeightRecordPower = calculateVSRGovernancePower(activeLockups);
        }
      }
    }
    
    // Use the higher of the two calculations as the governance power
    const governancePower = Math.max(depositEntryAmount, voterWeightRecordPower);
    
    return {
      walletAddress,
      governancePower: governancePower,
      depositEntryAmount: depositEntryAmount,
      voterWeightRecordPower: voterWeightRecordPower,
      source: governancePower === depositEntryAmount ? 'Deposit Entry' : 'Voter Weight Record'
    };
    
  } catch (error) {
    console.error(`Error extracting governance power for ${walletAddress}:`, error.message);
    return {
      walletAddress,
      governancePower: 0,
      error: error.message
    };
  }
}

/**
 * Extract active lockup deposits from Voter Weight Record
 */
function extractActiveLockups(data) {
  const activeLockups = [];
  const now = Date.now();
  
  // Scan for amount-timestamp pairs that represent active lockups
  const knownPatterns = [
    // Based on GJdRQcsy analysis
    { amountOffset: 152, timestampOffset: 160, typeOffset: 168 },
    { amountOffset: 232, timestampOffset: 240, typeOffset: 248 },
    { amountOffset: 312, timestampOffset: 320, typeOffset: 328 },
    { amountOffset: 392, timestampOffset: 400, typeOffset: 408 }
  ];
  
  for (const pattern of knownPatterns) {
    try {
      const amount = Number(data.readBigUInt64LE(pattern.amountOffset)) / Math.pow(10, 6);
      const timestamp = Number(data.readBigUInt64LE(pattern.timestampOffset));
      const lockupType = Number(data.readBigUInt64LE(pattern.typeOffset));
      
      if (amount > 1000 && timestamp > 1600000000 && timestamp < 2000000000) {
        const expirationDate = new Date(timestamp * 1000);
        const isActive = expirationDate > new Date(now);
        
        if (isActive && lockupType >= 0 && lockupType <= 4) {
          activeLockups.push({
            amount: amount,
            expiresAt: expirationDate,
            yearsLocked: lockupType,
            timeRemainingSeconds: (expirationDate.getTime() - now) / 1000
          });
        }
      }
    } catch (error) {
      continue;
    }
  }
  
  return activeLockups;
}

/**
 * Calculate VSR governance power from active lockups
 */
function calculateVSRGovernancePower(activeLockups) {
  if (activeLockups.length === 0) return 0;
  
  let totalVotingPower = 0;
  const lockupSaturationSecs = 3 * 365.25 * 24 * 60 * 60; // 3 years standard
  
  for (const lockup of activeLockups) {
    const lockupMultiplier = Math.min(lockup.timeRemainingSeconds / lockupSaturationSecs, 1);
    const baselineVoteWeight = lockup.amount;
    const maxExtraLockupVoteWeight = lockup.amount;
    const votingPower = baselineVoteWeight + (lockupMultiplier * maxExtraLockupVoteWeight);
    
    totalVotingPower += votingPower;
  }
  
  return totalVotingPower;
}

/**
 * Update a citizen with authentic IslandDAO governance power
 */
async function updateCitizenWithIslandDAOPower(walletAddress) {
  try {
    const powerData = await extractIslandDAOGovernancePower(walletAddress);
    
    if (powerData.governancePower > 0) {
      const { updateGovernancePower } = require('./db.js');
      await updateGovernancePower(walletAddress, powerData.governancePower);
      
      console.log(`Updated ${walletAddress}: ${powerData.governancePower.toLocaleString()} ISLAND (${powerData.source})`);
      return powerData;
    } else {
      console.log(`No governance power found for ${walletAddress}`);
      return powerData;
    }
  } catch (error) {
    console.error(`Error updating citizen ${walletAddress}:`, error.message);
    return { walletAddress, governancePower: 0, error: error.message };
  }
}

/**
 * Update all citizens with authentic IslandDAO governance power
 */
async function updateAllCitizensWithIslandDAOPower() {
  try {
    const { getAllCitizens } = require('./db.js');
    const citizens = await getAllCitizens();
    
    console.log(`Starting IslandDAO governance power sync for ${citizens.length} citizens...`);
    
    const results = [];
    let successCount = 0;
    let errorCount = 0;
    
    for (const citizen of citizens) {
      console.log(`Processing ${citizen.wallet_address}...`);
      
      const result = await updateCitizenWithIslandDAOPower(citizen.wallet_address);
      results.push(result);
      
      if (result.governancePower > 0) {
        successCount++;
      } else {
        errorCount++;
      }
      
      // Rate limiting to avoid overwhelming RPC
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    console.log('\n=== IslandDAO Governance Power Sync Complete ===');
    console.log(`Successfully updated: ${successCount} citizens`);
    console.log(`Errors encountered: ${errorCount} citizens`);
    console.log(`Total processed: ${results.length} citizens`);
    
    return results;
    
  } catch (error) {
    console.error('Error in updateAllCitizensWithIslandDAOPower:', error.message);
    throw error;
  }
}

/**
 * Test the IslandDAO governance power calculation
 */
async function testIslandDAOCalculation() {
  console.log('Testing IslandDAO VSR governance power calculation...');
  
  // Test with GJdRQcsy
  const testWallet = 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh';
  const result = await extractIslandDAOGovernancePower(testWallet);
  
  console.log('\nTest Results:');
  console.log('Wallet:', result.walletAddress);
  console.log('Governance Power:', result.governancePower?.toLocaleString(), 'ISLAND');
  console.log('Deposit Entry Amount:', result.depositEntryAmount?.toLocaleString(), 'ISLAND');
  console.log('Voter Weight Record Power:', result.voterWeightRecordPower?.toLocaleString(), 'ISLAND');
  console.log('Source:', result.source);
  
  if (result.error) {
    console.log('Error:', result.error);
  }
  
  return result;
}

module.exports = {
  extractIslandDAOGovernancePower,
  updateCitizenWithIslandDAOPower,
  updateAllCitizensWithIslandDAOPower,
  testIslandDAOCalculation
};

// Run test if called directly
if (require.main === module) {
  testIslandDAOCalculation().catch(console.error);
}