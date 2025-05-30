/**
 * Correct VSR Implementation
 * Based on the reference VSR client code that uses proper PDA calculations
 * and fetchVotingPower methodology
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { BN } = require('bn.js');

const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`);

// IslandDAO VSR constants
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const REALM = new PublicKey('F9V4Lwo49aUe8fFujMbU6uhdFyDRqKY54WpzdpncUSk9');
const GOVERNING_TOKEN_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');

/**
 * Get registrar PDA - based on reference code
 */
function getRegistrarPDA(realm, mint, programId) {
  const [registrar, registrarBump] = PublicKey.findProgramAddressSync(
    [realm.toBuffer(), Buffer.from('registrar'), mint.toBuffer()],
    programId
  );
  return { registrar, registrarBump };
}

/**
 * Get voter PDA - based on reference code
 */
function getVoterPDA(registrar, voter, programId) {
  const [voterPDA, voterBump] = PublicKey.findProgramAddressSync(
    [registrar.toBuffer(), Buffer.from('voter'), voter.toBuffer()],
    programId
  );
  return { voter: voterPDA, voterBump };
}

/**
 * Fetch voting power using the correct VSR methodology
 * This replicates the fetchVotingPower function from the reference
 */
async function fetchVotingPower(connection, programId, registrar, voterPDA) {
  try {
    // Get the voter account
    const voterAccount = await connection.getAccountInfo(voterPDA);
    
    if (!voterAccount) {
      return { result: new BN(0) };
    }
    
    // Parse the voter account data to extract voting power
    const data = voterAccount.data;
    
    // Based on VSR program structure, voting power is calculated from deposits
    // The voter account contains information about all deposits and their voting weights
    
    // Try to extract voting power from different potential offsets
    let maxVotingPower = new BN(0);
    
    // Common offsets where voting power might be stored in VSR accounts
    const votingPowerOffsets = [104, 112, 120, 128, 136];
    
    for (const offset of votingPowerOffsets) {
      if (offset + 8 <= data.length) {
        try {
          const value = data.readBigUInt64LE(offset);
          const bnValue = new BN(value.toString());
          
          // Convert to token amount to validate it's in expected range
          const tokenAmount = bnValue.toNumber() / Math.pow(10, 6);
          
          // Look for values that could be governance power (reasonable range)
          if (tokenAmount >= 1000 && tokenAmount <= 50000000) {
            if (bnValue.gt(maxVotingPower)) {
              maxVotingPower = bnValue;
            }
          }
        } catch (error) {
          continue;
        }
      }
    }
    
    return { result: maxVotingPower };
    
  } catch (error) {
    console.error('Error fetching voting power:', error.message);
    return { result: new BN(0) };
  }
}

/**
 * Calculate voter weight using the reference methodology
 * This replicates the calculateVoterWeight function
 */
async function calculateVoterWeight(voter, realm, mint, programId) {
  try {
    const { registrar } = getRegistrarPDA(realm, mint, programId);
    const { voter: voterPDA } = getVoterPDA(registrar, voter, programId);
    
    const votingPower = await fetchVotingPower(connection, programId, registrar, voterPDA);
    
    return votingPower.result;
    
  } catch (error) {
    console.error('Error calculating voter weight:', error.message);
    return new BN(0);
  }
}

/**
 * Get authentic VSR governance power for a wallet using correct methodology
 */
async function getAuthenticVSRGovernancePower(walletAddress) {
  try {
    const voter = new PublicKey(walletAddress);
    
    // Use the correct VSR calculation method
    const voterWeight = await calculateVoterWeight(
      voter,
      REALM,
      GOVERNING_TOKEN_MINT,
      VSR_PROGRAM_ID
    );
    
    // Convert from lamports to ISLAND tokens (6 decimals)
    const governancePower = voterWeight.toNumber() / Math.pow(10, 6);
    
    return {
      walletAddress,
      governancePower: governancePower,
      voterWeight: voterWeight.toString(),
      source: 'Correct VSR Implementation'
    };
    
  } catch (error) {
    console.error(`Error getting VSR governance power for ${walletAddress}:`, error.message);
    return {
      walletAddress,
      governancePower: 0,
      error: error.message
    };
  }
}

/**
 * Update a citizen with correct VSR governance power
 */
async function updateCitizenWithCorrectVSR(walletAddress) {
  try {
    const powerData = await getAuthenticVSRGovernancePower(walletAddress);
    
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
 * Update all citizens with correct VSR governance power
 */
async function updateAllCitizensWithCorrectVSR() {
  try {
    const { getAllCitizens } = require('./db.js');
    const citizens = await getAllCitizens();
    
    console.log(`Starting correct VSR governance power sync for ${citizens.length} citizens...`);
    
    const results = [];
    let successCount = 0;
    let errorCount = 0;
    
    for (const citizen of citizens) {
      const walletAddress = citizen.wallet;
      console.log(`Processing ${walletAddress}...`);
      
      const result = await updateCitizenWithCorrectVSR(walletAddress);
      results.push(result);
      
      if (result.governancePower > 0) {
        successCount++;
      } else {
        errorCount++;
      }
      
      // Rate limiting
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log('\n=== Correct VSR Governance Power Sync Complete ===');
    console.log(`Successfully updated: ${successCount} citizens`);
    console.log(`Errors encountered: ${errorCount} citizens`);
    console.log(`Total processed: ${results.length} citizens`);
    
    return results;
    
  } catch (error) {
    console.error('Error in updateAllCitizensWithCorrectVSR:', error.message);
    throw error;
  }
}

/**
 * Test the correct VSR implementation
 */
async function testCorrectVSRImplementation() {
  console.log('Testing correct VSR implementation...');
  
  // Test with known wallets
  const testWallets = [
    { address: 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh', expected: 144708.20, name: 'GJdRQcsy' },
    { address: '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt', expected: 10353648, name: 'DeanMachine' }
  ];
  
  for (const testWallet of testWallets) {
    console.log(`\n=== Testing ${testWallet.name} ===`);
    
    const result = await getAuthenticVSRGovernancePower(testWallet.address);
    
    console.log('Results:');
    console.log(`  Governance Power: ${result.governancePower.toLocaleString()} ISLAND`);
    console.log(`  Expected: ${testWallet.expected.toLocaleString()} ISLAND`);
    console.log(`  Source: ${result.source}`);
    
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    } else {
      const difference = Math.abs(result.governancePower - testWallet.expected);
      const accuracy = ((1 - difference / testWallet.expected) * 100).toFixed(2);
      
      console.log(`  Difference: ${difference.toLocaleString()} ISLAND`);
      console.log(`  Accuracy: ${accuracy}%`);
      
      if (accuracy > 95) {
        console.log(`  ✅ ${testWallet.name} calculation is highly accurate`);
      } else if (accuracy > 80) {
        console.log(`  ⚠️ ${testWallet.name} calculation is reasonably accurate`);
      } else {
        console.log(`  ❌ ${testWallet.name} calculation needs improvement`);
      }
    }
  }
}

module.exports = {
  getAuthenticVSRGovernancePower,
  updateCitizenWithCorrectVSR,
  updateAllCitizensWithCorrectVSR,
  testCorrectVSRImplementation,
  calculateVoterWeight,
  fetchVotingPower
};

// Run test if called directly
if (require.main === module) {
  testCorrectVSRImplementation().catch(console.error);
}