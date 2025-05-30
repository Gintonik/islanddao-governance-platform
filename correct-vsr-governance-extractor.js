/**
 * Correct VSR Governance Power Extractor
 * Fixes the governance calculation to match known correct values
 * Must extract exact values like DeanMachine: 10,353,648.013 ISLAND
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { BN } = require('@coral-xyz/anchor');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const VSR_PROGRAM_ID = new PublicKey('VotEn9AWwTFtJPJSMV5F9jsMY6QwWM5qn3XP9PATGW7');

/**
 * Test known wallets to verify our extraction logic
 */
const KNOWN_TEST_VALUES = {
  '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt': { // DeanMachine
    native: '10353648013000', // 10,353,648.013 ISLAND
    delegated: '0'
  },
  'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh': {
    native: '144708981722', // 144,708.981722 ISLAND
    delegated: '0'
  },
  'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG': { // legend
    native: '3361730150000', // 3,361,730.15 ISLAND
    delegated: '1598919100000' // 1,598,919.1 ISLAND
  },
  'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1': { // Titanmaker
    native: '200000000000', // 200,000 ISLAND
    delegated: '0'
  }
};

/**
 * Derive voter account PDA for a wallet
 */
function getVoterPDA(walletAddress) {
  try {
    const REALM_ID = new PublicKey('4Z6bAwcBkDg8We6rRdnuCBNu2UUuSVnTekFWrtzckRA7');
    const COMMUNITY_MINT = new PublicKey('FKJvvVJ242tX7zFtzTmzqoA631LqHh4CdgcN8dcfFSju');
    
    // Derive registrar PDA
    const [registrar] = PublicKey.findProgramAddressSync(
      [Buffer.from('registrar'), REALM_ID.toBuffer(), COMMUNITY_MINT.toBuffer()],
      VSR_PROGRAM_ID
    );
    
    // Derive voter PDA
    const walletPubkey = new PublicKey(walletAddress);
    const [voter] = PublicKey.findProgramAddressSync(
      [Buffer.from('voter'), registrar.toBuffer(), walletPubkey.toBuffer()],
      VSR_PROGRAM_ID
    );
    
    return { voter, registrar };
  } catch (error) {
    return null;
  }
}

/**
 * Search all VSR accounts to find the one containing specific wallet's governance power
 */
async function findWalletVSRAccounts(walletAddress) {
  try {
    const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
    
    console.log(`\nSearching for VSR accounts containing ${walletAddress}...`);
    
    // Load all VSR accounts
    const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    console.log(`Loaded ${accounts.length} VSR accounts`);
    
    const walletPubkey = new PublicKey(walletAddress);
    const walletBytes = walletPubkey.toBytes();
    
    const matchingAccounts = [];
    
    // Search each account for the wallet address
    for (const account of accounts) {
      const data = account.account.data;
      
      // Search for wallet bytes in the account data
      for (let offset = 0; offset <= data.length - 32; offset++) {
        if (data.slice(offset, offset + 32).equals(walletBytes)) {
          console.log(`Found wallet at account ${account.pubkey.toBase58()}, offset ${offset}`);
          
          matchingAccounts.push({
            account: account.pubkey.toBase58(),
            data: data,
            size: data.length,
            walletOffset: offset
          });
          break;
        }
      }
    }
    
    console.log(`Found ${matchingAccounts.length} accounts containing wallet ${walletAddress}`);
    return matchingAccounts;
    
  } catch (error) {
    console.error(`Error finding VSR accounts for ${walletAddress}:`, error);
    return [];
  }
}

/**
 * Extract governance power values from account data near wallet location
 */
function extractGovernancePowerFromAccountData(accountData, walletOffset) {
  const data = accountData.data;
  const potentialValues = [];
  
  // Look for large numbers (potential governance power) in the account
  for (let offset = 0; offset <= data.length - 8; offset += 8) {
    try {
      const value = new BN(data.slice(offset, offset + 8), 'le');
      
      // Look for values that could be governance power in lamports
      if (value.gt(new BN('1000000000')) && value.lt(new BN('100000000000000000'))) {
        const tokens = value.div(new BN(1000000));
        
        potentialValues.push({
          offset,
          lamports: value.toString(),
          tokens: tokens.toString(),
          tokensFormatted: (tokens.toNumber() / 1000).toFixed(3)
        });
      }
    } catch (error) {
      // Skip invalid values
    }
  }
  
  console.log(`Account ${accountData.account} (${data.length} bytes):`);
  console.log(`  Wallet found at offset: ${walletOffset}`);
  console.log(`  Potential governance values:`);
  
  potentialValues.forEach(value => {
    console.log(`    Offset ${value.offset}: ${value.tokensFormatted} ISLAND (${value.lamports} lamports)`);
  });
  
  return potentialValues;
}

/**
 * Test governance power extraction with known wallets
 */
async function testGovernancePowerExtraction() {
  console.log('Testing governance power extraction with known correct values...\n');
  
  for (const [walletAddress, expectedValues] of Object.entries(KNOWN_TEST_VALUES)) {
    console.log(`\n=== Testing ${walletAddress} ===`);
    console.log(`Expected: Native=${(parseInt(expectedValues.native) / 1000000).toFixed(3)} ISLAND, Delegated=${(parseInt(expectedValues.delegated) / 1000000).toFixed(3)} ISLAND`);
    
    // Method 1: Search all VSR accounts for this wallet
    const vsrAccounts = await findWalletVSRAccounts(walletAddress);
    
    for (const accountData of vsrAccounts) {
      const potentialValues = extractGovernancePowerFromAccountData(accountData, accountData.walletOffset);
      
      // Check if any extracted value matches expected
      for (const value of potentialValues) {
        const expectedNativeTokens = (parseInt(expectedValues.native) / 1000000).toFixed(3);
        if (Math.abs(parseFloat(value.tokensFormatted) - parseFloat(expectedNativeTokens)) < 0.01) {
          console.log(`    *** MATCH FOUND! Expected: ${expectedNativeTokens}, Found: ${value.tokensFormatted} ***`);
        }
      }
    }
    
    // Method 2: Try derived voter PDA
    const voterPDA = getVoterPDA(walletAddress);
    if (voterPDA) {
      console.log(`\nTrying derived voter PDA: ${voterPDA.voter.toBase58()}`);
      
      try {
        const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
        const voterAccount = await connection.getAccountInfo(voterPDA.voter);
        
        if (voterAccount) {
          console.log(`Found voter account with ${voterAccount.data.length} bytes`);
          
          const accountData = {
            account: voterPDA.voter.toBase58(),
            data: voterAccount.data,
            size: voterAccount.data.length
          };
          
          const potentialValues = extractGovernancePowerFromAccountData(accountData, 8);
          
          // Check matches
          for (const value of potentialValues) {
            const expectedNativeTokens = (parseInt(expectedValues.native) / 1000000).toFixed(3);
            if (Math.abs(parseFloat(value.tokensFormatted) - parseFloat(expectedNativeTokens)) < 0.01) {
              console.log(`    *** VOTER PDA MATCH! Expected: ${expectedNativeTokens}, Found: ${value.tokensFormatted} ***`);
            }
          }
        } else {
          console.log(`No voter account found at derived PDA`);
        }
      } catch (error) {
        console.log(`Error checking voter PDA: ${error.message}`);
      }
    }
  }
}

/**
 * Find the correct governance power extraction method
 */
async function findCorrectExtractionMethod() {
  console.log('\n=== Finding Correct Governance Power Extraction Method ===\n');
  
  await testGovernancePowerExtraction();
  
  console.log('\n=== Analysis Complete ===');
  console.log('Review the output above to identify which extraction method produces the correct values.');
  console.log('Once identified, we can implement the correct formula for all citizens.');
}

module.exports = {
  findWalletVSRAccounts,
  extractGovernancePowerFromAccountData,
  testGovernancePowerExtraction,
  findCorrectExtractionMethod
};

// Run test if called directly
if (require.main === module) {
  findCorrectExtractionMethod().then(() => {
    console.log('\nCorrect extraction method analysis completed');
    process.exit(0);
  }).catch(error => {
    console.error('Analysis failed:', error);
    process.exit(1);
  });
}