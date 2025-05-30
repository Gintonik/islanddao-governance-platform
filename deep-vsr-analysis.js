/**
 * Deep VSR Analysis
 * Comprehensive examination of VSR account structures to find correct governance power
 * Focus on finding the 10.35M ISLAND value for DeanMachine
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { BN } = require('@coral-xyz/anchor');

/**
 * Analyze DeanMachine's VSR accounts in detail
 */
async function analyzeDeanMachineAccounts() {
  try {
    const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
    const VSR_PROGRAM_ID = new PublicKey('VotEn9AWwTFtJPJSMV5F9jsMY6QwWM5qn3XP9PATGW7');
    
    console.log('Deep analysis of DeanMachine VSR accounts...\n');
    
    const deanMachine = '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt';
    const expectedValue = '10353648013000'; // 10,353,648.013 ISLAND in lamports
    
    console.log(`Looking for governance power value: ${expectedValue} lamports (${(parseInt(expectedValue) / 1000000).toFixed(3)} ISLAND)`);
    
    // Load all VSR accounts
    const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    console.log(`Loaded ${accounts.length} VSR accounts\n`);
    
    const deanMachinePubkey = new PublicKey(deanMachine);
    const deanMachineBytes = deanMachinePubkey.toBytes();
    
    // Find accounts containing DeanMachine
    const matchingAccounts = [];
    
    for (const account of accounts) {
      const data = account.account.data;
      
      // Search for DeanMachine's pubkey in the account
      for (let offset = 0; offset <= data.length - 32; offset++) {
        if (data.slice(offset, offset + 32).equals(deanMachineBytes)) {
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
    
    console.log(`Found DeanMachine in ${matchingAccounts.length} accounts\n`);
    
    // Analyze each account thoroughly
    for (let i = 0; i < matchingAccounts.length; i++) {
      const accountData = matchingAccounts[i];
      console.log(`=== Account ${i + 1}: ${accountData.account} ===`);
      console.log(`Size: ${accountData.size} bytes`);
      console.log(`DeanMachine wallet found at offset: ${accountData.walletOffset}\n`);
      
      await analyzeAccountForGovernancePower(accountData, expectedValue);
      console.log('\n' + '='.repeat(60) + '\n');
    }
    
    // Also search for the expected value across ALL VSR accounts
    console.log('=== Searching ALL VSR accounts for the expected value ===\n');
    
    const expectedBN = new BN(expectedValue);
    
    for (const account of accounts) {
      const data = account.account.data;
      
      // Search for the exact expected value
      for (let offset = 0; offset <= data.length - 8; offset += 8) {
        try {
          const value = new BN(data.slice(offset, offset + 8), 'le');
          
          if (value.eq(expectedBN)) {
            console.log(`*** FOUND EXACT MATCH! ***`);
            console.log(`Account: ${account.pubkey.toBase58()}`);
            console.log(`Offset: ${offset}`);
            console.log(`Value: ${value.toString()} lamports (${value.div(new BN(1000000)).toString()} ISLAND)`);
            
            // Check if DeanMachine is in this account
            const deanMachineInAccount = searchForWalletInAccount(data, deanMachine);
            if (deanMachineInAccount) {
              console.log(`DeanMachine found in this account at offset: ${deanMachineInAccount.offset}`);
            }
            console.log('');
          }
        } catch (error) {
          // Continue searching
        }
      }
    }
    
  } catch (error) {
    console.error('Error in deep analysis:', error);
  }
}

/**
 * Analyze account data for governance power patterns
 */
async function analyzeAccountForGovernancePower(accountData, expectedValue) {
  const data = accountData.data;
  
  console.log('Searching for all potential governance power values...');
  
  // Look for values in different ranges
  const ranges = [
    { min: '1000000000000', max: '20000000000000', name: 'Large values (1M-20M ISLAND)' },
    { min: '100000000000', max: '1000000000000', name: 'Medium values (100K-1M ISLAND)' },
    { min: '10000000000', max: '100000000000', name: 'Small values (10K-100K ISLAND)' }
  ];
  
  for (const range of ranges) {
    console.log(`\n${range.name}:`);
    
    for (let offset = 0; offset <= data.length - 8; offset += 8) {
      try {
        const value = new BN(data.slice(offset, offset + 8), 'le');
        
        if (value.gte(new BN(range.min)) && value.lt(new BN(range.max))) {
          const tokens = value.div(new BN(1000000));
          console.log(`  Offset ${offset}: ${tokens.toString()} ISLAND (${value.toString()} lamports)`);
          
          // Check if this matches our expected value
          if (value.toString() === expectedValue) {
            console.log(`    *** EXACT MATCH FOR EXPECTED VALUE! ***`);
          }
        }
      } catch (error) {
        // Continue searching
      }
    }
  }
  
  // Analyze account structure based on size
  if (data.length === 2728) {
    console.log('\nAnalyzing as Voter Record (2728 bytes):');
    analyzeVoterRecord(data);
  } else if (data.length === 176) {
    console.log('\nAnalyzing as Deposit Entry (176 bytes):');
    analyzeDepositEntry(data);
  }
}

/**
 * Analyze voter record structure
 */
function analyzeVoterRecord(data) {
  try {
    // Standard voter record structure
    console.log('Voter record fields:');
    
    // Voter authority (offset 8)
    const voterAuthority = extractWalletFromOffset(data, 8);
    console.log(`  Voter authority (offset 8): ${voterAuthority}`);
    
    // Registrar (offset 40)
    const registrar = extractWalletFromOffset(data, 40);
    console.log(`  Registrar (offset 40): ${registrar}`);
    
    // Analyze deposits array (starting around offset 72)
    console.log('\nDeposits analysis:');
    
    for (let i = 0; i < 32; i++) { // Max 32 deposits
      const depositOffset = 72 + (i * 64);
      if (depositOffset + 64 > data.length) break;
      
      const isUsed = data[depositOffset] !== 0;
      if (!isUsed) continue;
      
      console.log(`  Deposit ${i}:`);
      
      const votingMintConfigIdx = data[depositOffset + 1];
      const amountDeposited = new BN(data.slice(depositOffset + 8, depositOffset + 16), 'le');
      const amountInitiallyLocked = new BN(data.slice(depositOffset + 16, depositOffset + 24), 'le');
      const lockupStartTs = new BN(data.slice(depositOffset + 24, depositOffset + 32), 'le');
      const lockupEndTs = new BN(data.slice(depositOffset + 32, depositOffset + 40), 'le');
      
      console.log(`    Amount deposited: ${amountDeposited.div(new BN(1000000)).toString()} ISLAND`);
      console.log(`    Amount initially locked: ${amountInitiallyLocked.div(new BN(1000000)).toString()} ISLAND`);
      console.log(`    Lockup start: ${new Date(lockupStartTs.toNumber() * 1000).toISOString()}`);
      console.log(`    Lockup end: ${new Date(lockupEndTs.toNumber() * 1000).toISOString()}`);
      
      // Calculate potential governance power for this deposit
      const now = Math.floor(Date.now() / 1000);
      const timeRemaining = Math.max(0, lockupEndTs.toNumber() - now);
      const maxLockupTime = 5 * 365 * 24 * 60 * 60;
      const lockupMultiplier = 1 + Math.min(timeRemaining / maxLockupTime, 1) * 5;
      
      const governancePower = amountDeposited.muln(Math.floor(lockupMultiplier * 100)).divn(100);
      console.log(`    Calculated governance power: ${governancePower.div(new BN(1000000)).toString()} ISLAND (${lockupMultiplier.toFixed(2)}x multiplier)`);
    }
    
    // Check the end of the account for final values
    console.log('\nEnd-of-account values:');
    for (let offset = data.length - 32; offset < data.length; offset += 8) {
      if (offset >= 0) {
        try {
          const value = new BN(data.slice(offset, Math.min(offset + 8, data.length)), 'le');
          if (value.gt(new BN(0))) {
            console.log(`  Offset ${offset}: ${value.toString()} (${value.div(new BN(1000000)).toString()} ISLAND)`);
          }
        } catch (error) {
          // Continue
        }
      }
    }
    
  } catch (error) {
    console.log('Error analyzing voter record:', error);
  }
}

/**
 * Analyze deposit entry structure
 */
function analyzeDepositEntry(data) {
  try {
    console.log('Deposit entry fields:');
    
    // Extract basic fields
    const amount = new BN(data.slice(8, 16), 'le');
    const lockupStart = new BN(data.slice(24, 32), 'le');
    const lockupEnd = new BN(data.slice(168, 176), 'le');
    
    console.log(`  Amount: ${amount.div(new BN(1000000)).toString()} ISLAND`);
    console.log(`  Lockup start: ${new Date(lockupStart.toNumber() * 1000).toISOString()}`);
    console.log(`  Lockup end: ${new Date(lockupEnd.toNumber() * 1000).toISOString()}`);
    
    // Calculate governance power
    const now = Math.floor(Date.now() / 1000);
    const timeRemaining = Math.max(0, lockupEnd.toNumber() - now);
    const maxLockupTime = 5 * 365 * 24 * 60 * 60;
    const lockupMultiplier = 1 + Math.min(timeRemaining / maxLockupTime, 1) * 5;
    
    const governancePower = amount.muln(Math.floor(lockupMultiplier * 100)).divn(100);
    console.log(`  Calculated governance power: ${governancePower.div(new BN(1000000)).toString()} ISLAND (${lockupMultiplier.toFixed(2)}x multiplier)`);
    
  } catch (error) {
    console.log('Error analyzing deposit entry:', error);
  }
}

/**
 * Extract wallet address from specific offset
 */
function extractWalletFromOffset(data, offset) {
  try {
    if (offset + 32 <= data.length) {
      const pubkey = new PublicKey(data.slice(offset, offset + 32));
      return pubkey.toBase58();
    }
  } catch (error) {
    // Not a valid pubkey
  }
  return null;
}

/**
 * Search for wallet in account data
 */
function searchForWalletInAccount(data, walletAddress) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    const walletBytes = walletPubkey.toBytes();
    
    for (let offset = 0; offset <= data.length - 32; offset++) {
      if (data.slice(offset, offset + 32).equals(walletBytes)) {
        return { offset, found: true };
      }
    }
  } catch (error) {
    // Continue
  }
  return null;
}

module.exports = {
  analyzeDeanMachineAccounts
};

// Run analysis if called directly
if (require.main === module) {
  analyzeDeanMachineAccounts().then(() => {
    console.log('Deep VSR analysis completed');
    process.exit(0);
  }).catch(error => {
    console.error('Analysis failed:', error);
    process.exit(1);
  });
}