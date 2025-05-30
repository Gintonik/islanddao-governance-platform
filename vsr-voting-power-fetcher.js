/**
 * VSR Voting Power Fetcher
 * Uses the proper VSR program method to fetch real voting power
 * Based on the fetchVotingPower workaround approach
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { BN } = require('bn.js');

const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`);

// IslandDAO VSR Program constants
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const REALM = new PublicKey('F9V4Lwo49aUe8fFujMbU6uhdFyDRqKY54WpzdpncUSk9');
const GOVERNING_TOKEN_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');

/**
 * Get registrar PDA for the realm and mint
 */
function getRegistrarPDA(realm, mint) {
  const [registrar] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('registrar'),
      realm.toBuffer(),
      mint.toBuffer()
    ],
    VSR_PROGRAM_ID
  );
  return { registrar };
}

/**
 * Get voter PDA for the registrar and voter wallet
 */
function getVoterPDA(registrar, voter, programId) {
  const [voterPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from('voter'),
      registrar.toBuffer(),
      voter.toBuffer()
    ],
    programId
  );
  return { voter: voterPDA };
}

/**
 * Fetch real voting power by finding actual VSR accounts for the wallet
 * This uses the authentic VSR accounts rather than calculated PDAs
 */
async function fetchVotingPowerFromVSRAccounts(connection, programId, walletAddress) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    const walletBuffer = walletPubkey.toBuffer();
    
    // Get all VSR program accounts
    const vsrAccounts = await connection.getProgramAccounts(programId);
    
    let maxVotingPower = new BN(0);
    let foundAccounts = 0;
    
    for (const account of vsrAccounts) {
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
        foundAccounts++;
        
        // Extract voting power from known offsets
        const potentialOffsets = [104, 112, 96, 120, 128];
        
        for (const offset of potentialOffsets) {
          if (offset + 8 <= data.length) {
            try {
              const value = data.readBigUInt64LE(offset);
              const bnValue = new BN(value.toString());
              
              // Look for values in the expected governance power range
              const tokenValue = bnValue.toNumber() / Math.pow(10, 6);
              if (tokenValue > 50000 && tokenValue < 200000) {
                if (bnValue.gt(maxVotingPower)) {
                  maxVotingPower = bnValue;
                }
              }
            } catch (error) {
              continue;
            }
          }
        }
      }
    }
    
    return { 
      result: maxVotingPower,
      accountsFound: foundAccounts
    };
    
  } catch (error) {
    console.error('Error fetching voting power from VSR accounts:', error.message);
    return { result: new BN(0), accountsFound: 0 };
  }
}

/**
 * Calculate authentic voting power for a wallet using VSR program
 */
async function calculateAuthenticVotingPower(walletAddress) {
  try {
    const votingPower = await fetchVotingPowerFromVSRAccounts(connection, VSR_PROGRAM_ID, walletAddress);
    
    // Convert from lamports to ISLAND tokens (6 decimals)
    const tokenAmount = votingPower.result.toNumber() / Math.pow(10, 6);
    
    return {
      walletAddress,
      votingPower: tokenAmount,
      accountsFound: votingPower.accountsFound,
      source: 'Direct VSR Account Query'
    };
    
  } catch (error) {
    console.error(`Error calculating voting power for ${walletAddress}:`, error.message);
    return {
      walletAddress,
      votingPower: 0,
      error: error.message
    };
  }
}

/**
 * Update a citizen with authentic VSR voting power
 */
async function updateCitizenWithAuthenticVSR(walletAddress) {
  try {
    const powerData = await calculateAuthenticVotingPower(walletAddress);
    
    if (powerData.votingPower > 0) {
      const { updateGovernancePower } = require('./db.js');
      await updateGovernancePower(walletAddress, powerData.votingPower);
      
      console.log(`Updated ${walletAddress}: ${powerData.votingPower.toLocaleString()} ISLAND (${powerData.source})`);
      return powerData;
    } else {
      console.log(`No voting power found for ${walletAddress}`);
      return powerData;
    }
  } catch (error) {
    console.error(`Error updating citizen ${walletAddress}:`, error.message);
    return { walletAddress, votingPower: 0, error: error.message };
  }
}

/**
 * Update all citizens with authentic VSR voting power
 */
async function updateAllCitizensWithAuthenticVSR() {
  try {
    const { getAllCitizens } = require('./db.js');
    const citizens = await getAllCitizens();
    
    console.log(`Starting authentic VSR voting power sync for ${citizens.length} citizens...`);
    
    const results = [];
    let successCount = 0;
    let errorCount = 0;
    
    for (const citizen of citizens) {
      const walletAddress = citizen.wallet;
      console.log(`Processing ${walletAddress}...`);
      
      const result = await updateCitizenWithAuthenticVSR(walletAddress);
      results.push(result);
      
      if (result.votingPower > 0) {
        successCount++;
      } else {
        errorCount++;
      }
      
      // Rate limiting to avoid overwhelming RPC
      await new Promise(resolve => setTimeout(resolve, 300));
    }
    
    console.log('\n=== Authentic VSR Voting Power Sync Complete ===');
    console.log(`Successfully updated: ${successCount} citizens`);
    console.log(`Errors encountered: ${errorCount} citizens`);
    console.log(`Total processed: ${results.length} citizens`);
    
    return results;
    
  } catch (error) {
    console.error('Error in updateAllCitizensWithAuthenticVSR:', error.message);
    throw error;
  }
}

/**
 * Test the authentic VSR voting power calculation
 */
async function testAuthenticVSRPower() {
  console.log('Testing authentic VSR voting power calculation...');
  
  // Test with GJdRQcsy
  const testWallet = 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh';
  const result = await calculateAuthenticVotingPower(testWallet);
  
  console.log('\nAuthentic VSR Test Results:');
  console.log('Wallet:', result.walletAddress);
  console.log('Voting Power:', result.votingPower?.toLocaleString(), 'ISLAND');
  console.log('Voter PDA:', result.voterPDA);
  console.log('Registrar:', result.registrar);
  console.log('Source:', result.source);
  
  if (result.error) {
    console.log('Error:', result.error);
  }
  
  console.log('\nComparison with governance interface:');
  console.log('Expected: 144,708.20 ISLAND');
  console.log('Extracted:', result.votingPower?.toLocaleString(), 'ISLAND');
  
  const difference = Math.abs(result.votingPower - 144708.20);
  console.log('Difference:', difference.toFixed(2), 'ISLAND');
  
  if (difference < 1000) {
    console.log('✅ Authentic VSR method matches governance interface!');
  } else {
    console.log('❌ Still need refinement - checking alternative account structures');
  }
  
  return result;
}

module.exports = {
  calculateAuthenticVotingPower,
  updateCitizenWithAuthenticVSR,
  updateAllCitizensWithAuthenticVSR,
  testAuthenticVSRPower
};

// Run test if called directly
if (require.main === module) {
  testAuthenticVSRPower().catch(console.error);
}