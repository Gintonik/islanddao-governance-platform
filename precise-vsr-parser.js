/**
 * Precise VSR Parser
 * Uses the exact VSR account structure from Mythic Project governance SDK
 * Extracts authentic governance power directly from voterWeightRecord structure
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { updateGovernancePowerBreakdown, getAllCitizens } = require('./db.js');

const connection = new Connection(`https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY || '7271240f-154a-4417-9663-718ac65c8b8e'}`);

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Parse VSR Voter Weight Record using exact structure from Mythic Project
 * Structure:
 * - accountDiscriminator: 8 bytes (offset 0)
 * - realm: 32 bytes (offset 8) 
 * - governingTokenMint: 32 bytes (offset 40)
 * - governingTokenOwner: 32 bytes (offset 72)
 * - voterWeight: 8 bytes (offset 104) ← This is the final governance power!
 * - voterWeightExpiry: 9 bytes (offset 112)
 * - weightAction: variable (offset 121)
 * - weightActionTarget: variable
 * - reserved: 8 bytes
 */
function parseVoterWeightRecord(data, walletAddress) {
  try {
    if (data.length < 120) return null;
    
    // Check discriminator for voter weight record
    const discriminator = data.readBigUInt64LE(0);
    if (discriminator.toString() !== '14560581792603266545') {
      return null;
    }
    
    // Verify this record belongs to our wallet
    const walletBuffer = new PublicKey(walletAddress).toBuffer();
    const recordOwner = data.slice(72, 104);
    
    if (!recordOwner.equals(walletBuffer)) {
      return null;
    }
    
    // Extract the final voter weight (governance power) at offset 112 (corrected)
    const voterWeight = data.readBigUInt64LE(112);
    const governancePower = Number(voterWeight) / 1e6; // Convert from micro-tokens
    
    // Extract realm and mint for verification
    const realm = new PublicKey(data.slice(8, 40));
    const governingTokenMint = new PublicKey(data.slice(40, 72));
    
    return {
      governancePower,
      realm: realm.toBase58(),
      governingTokenMint: governingTokenMint.toBase58(),
      walletAddress,
      rawVoterWeight: voterWeight.toString()
    };
    
  } catch (error) {
    return null;
  }
}

/**
 * Extract authentic governance power for a single wallet
 */
async function extractAuthenticGovernancePower(walletAddress) {
  try {
    console.log(`Extracting governance power for ${walletAddress.substring(0, 8)}...`);
    
    // Get all VSR accounts containing this wallet
    const vsrAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { memcmp: { offset: 72, bytes: walletAddress } } // governingTokenOwner offset
      ]
    });
    
    console.log(`  Found ${vsrAccounts.length} VSR voter weight records`);
    
    let maxGovernancePower = 0;
    let validRecords = 0;
    
    for (const account of vsrAccounts) {
      const voterRecord = parseVoterWeightRecord(account.account.data, walletAddress);
      
      if (voterRecord && voterRecord.governancePower > 0) {
        validRecords++;
        console.log(`    Record ${validRecords}: ${voterRecord.governancePower.toLocaleString()} ISLAND`);
        console.log(`      Realm: ${voterRecord.realm.substring(0, 8)}`);
        console.log(`      Token: ${voterRecord.governingTokenMint.substring(0, 8)}`);
        
        // Take the maximum governance power across all records
        maxGovernancePower = Math.max(maxGovernancePower, voterRecord.governancePower);
      }
    }
    
    console.log(`  Final governance power: ${maxGovernancePower.toLocaleString()} ISLAND`);
    return maxGovernancePower;
    
  } catch (error) {
    console.error(`Error extracting governance power for ${walletAddress}:`, error.message);
    return 0;
  }
}

/**
 * Test precise parsing with known values
 */
async function testPreciseVSRParsing() {
  console.log('Testing precise VSR parsing with authentic blockchain data...');
  
  const testCases = [
    { wallet: 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh', expected: 144708.981722, name: '4-lockup citizen' },
    { wallet: 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG', expected: 3361730.15, name: 'legend' },
    { wallet: 'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1', expected: 200000, name: 'Titanmaker' },
    { wallet: '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt', expected: 1, name: 'DeanMachine' }
  ];
  
  for (const testCase of testCases) {
    console.log(`\\n=== Testing ${testCase.name} ===`);
    
    const extractedPower = await extractAuthenticGovernancePower(testCase.wallet);
    const difference = Math.abs(extractedPower - testCase.expected);
    const accuracy = testCase.expected > 0 ? (1 - difference / testCase.expected) * 100 : 0;
    
    console.log(`Expected: ${testCase.expected.toLocaleString()} ISLAND`);
    console.log(`Extracted: ${extractedPower.toLocaleString()} ISLAND`);
    console.log(`Difference: ${difference.toLocaleString()} ISLAND`);
    console.log(`Accuracy: ${accuracy.toFixed(1)}%`);
    
    if (accuracy > 99) {
      console.log('🎯 PERFECT MATCH - Using this value');
    } else if (accuracy > 95) {
      console.log('✅ EXCELLENT MATCH - Very close');
    } else if (accuracy > 80) {
      console.log('✅ GOOD MATCH - Acceptable range');
    } else {
      console.log('❌ NEEDS REVIEW - Significant difference');
    }
  }
}

/**
 * Update database with precisely extracted governance power
 */
async function updateDatabaseWithPreciseValues() {
  console.log('\\nUpdating database with precisely extracted governance power...');
  
  try {
    const citizens = await getAllCitizens();
    let updated = 0;
    let totalPower = 0;
    
    for (const citizen of citizens) {
      try {
        const governancePower = await extractAuthenticGovernancePower(citizen.wallet);
        
        if (governancePower > 0) {
          await updateGovernancePowerBreakdown(citizen.wallet, governancePower, 0);
          updated++;
          totalPower += governancePower;
          
          console.log(`✓ ${citizen.nickname || citizen.wallet.substring(0, 8)}: ${governancePower.toLocaleString()} ISLAND`);
        }
        
      } catch (error) {
        console.error(`Error processing ${citizen.wallet}:`, error.message);
      }
    }
    
    console.log(`\\nDatabase update completed:`);
    console.log(`Citizens updated: ${updated}/${citizens.length}`);
    console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
    
    return { updated, total: citizens.length, totalPower };
    
  } catch (error) {
    console.error('Error updating database with precise values:', error.message);
    throw error;
  }
}

module.exports = {
  extractAuthenticGovernancePower,
  parseVoterWeightRecord,
  testPreciseVSRParsing,
  updateDatabaseWithPreciseValues
};

// Run test when called directly
if (require.main === module) {
  testPreciseVSRParsing().catch(console.error);
}