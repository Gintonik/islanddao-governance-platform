/**
 * VSR Account Structure Analyzer
 * Examines the actual VSR account data to understand how to properly match wallets
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { BN } = require('@coral-xyz/anchor');

async function analyzeVSRAccounts() {
  try {
    const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
    
    // Get all VSR accounts for IslandDAO
    const VSR_PROGRAM_ID = new PublicKey('VotEn9AWwTFtJPJSMV5F9jsMY6QwWM5qn3XP9PATGW7');
    const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    
    console.log(`\nLoaded ${accounts.length} VSR accounts`);
    console.log('\nAnalyzing account structures...\n');
    
    // Group accounts by size
    const accountsBySize = {};
    accounts.forEach(account => {
      const size = account.account.data.length;
      if (!accountsBySize[size]) {
        accountsBySize[size] = [];
      }
      accountsBySize[size].push(account);
    });
    
    // Analyze each size group
    for (const [size, accts] of Object.entries(accountsBySize)) {
      console.log(`=== Accounts of size ${size} bytes (${accts.length} accounts) ===`);
      
      // Analyze first account of each size
      const firstAccount = accts[0];
      const data = firstAccount.account.data;
      
      console.log(`Sample account: ${firstAccount.pubkey.toBase58()}`);
      console.log(`Data length: ${data.length}`);
      
      // Look for wallet addresses (32-byte sequences that could be pubkeys)
      console.log('\nPotential wallet addresses found:');
      for (let i = 0; i <= data.length - 32; i += 32) {
        try {
          const potentialPubkey = new PublicKey(data.slice(i, i + 32));
          console.log(`  Offset ${i}: ${potentialPubkey.toBase58()}`);
          
          // Check if this matches our known wallets
          const knownWallets = [
            'DqH7YkHBu4pKxCp5JsLZT8jMKYmYTN9cmEyQHPbxMPkE', // DeanMachine
            'GJdRQcsyoKpW8a3YFe9HqeZdnG4Z8h5gM9qo8M3iThz8'  // legend
          ];
          
          if (knownWallets.includes(potentialPubkey.toBase58())) {
            console.log(`    *** MATCH FOUND FOR KNOWN WALLET! ***`);
          }
          
        } catch (error) {
          // Not a valid pubkey, continue
        }
      }
      
      // Look for large numbers that could be governance power
      console.log('\nPotential governance power values:');
      for (let i = 0; i <= data.length - 8; i += 8) {
        const value = new BN(data.slice(i, i + 8), 'le');
        if (value.gt(new BN(1000000)) && value.lt(new BN('100000000000000'))) {
          const tokenValue = value.div(new BN(1000000));
          console.log(`  Offset ${i}: ${value.toString()} (${tokenValue.toString()} ISLAND)`);
        }
      }
      
      console.log('\n' + '-'.repeat(60) + '\n');
    }
    
    // Look specifically for DeanMachine's accounts
    console.log('=== SEARCHING FOR DEANMACHINE ACCOUNTS ===');
    const deanMachinePubkey = new PublicKey('DqH7YkHBu4pKxCp5JsLZT8jMKYmYTN9cmEyQHPbxMPkE');
    
    accounts.forEach((account, index) => {
      const data = account.account.data;
      
      // Search for DeanMachine's pubkey in this account
      for (let i = 0; i <= data.length - 32; i++) {
        try {
          const pubkey = new PublicKey(data.slice(i, i + 32));
          if (pubkey.equals(deanMachinePubkey)) {
            console.log(`\n*** FOUND DEANMACHINE IN ACCOUNT ${index} ***`);
            console.log(`Account: ${account.pubkey.toBase58()}`);
            console.log(`Size: ${data.length} bytes`);
            console.log(`DeanMachine pubkey found at offset: ${i}`);
            
            // Look for governance power near this location
            console.log('\nNearby potential governance values:');
            for (let j = Math.max(0, i - 64); j <= Math.min(data.length - 8, i + 64); j += 8) {
              const value = new BN(data.slice(j, j + 8), 'le');
              if (value.gt(new BN(1000000))) {
                const tokenValue = value.div(new BN(1000000));
                console.log(`  Offset ${j}: ${value.toString()} (${tokenValue.toString()} ISLAND)`);
                
                // Check if this matches DeanMachine's known power
                if (tokenValue.toString() === '10353648') {
                  console.log(`    *** POSSIBLE MATCH FOR DEANMACHINE'S POWER! ***`);
                }
              }
            }
          }
        } catch (error) {
          // Not a valid pubkey
        }
      }
    });
    
  } catch (error) {
    console.error('Error analyzing VSR accounts:', error);
  }
}

// Run the analysis
if (require.main === module) {
  analyzeVSRAccounts().then(() => {
    console.log('Analysis completed');
    process.exit(0);
  }).catch(error => {
    console.error('Analysis failed:', error);
    process.exit(1);
  });
}

module.exports = { analyzeVSRAccounts };