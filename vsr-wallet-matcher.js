/**
 * VSR Wallet Matcher
 * Analyzes VSR accounts to properly match wallets to their governance power
 * Improves wallet extraction logic to find DeanMachine and other known citizens
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { BN } = require('@coral-xyz/anchor');

const VSR_PROGRAM_ID = new PublicKey('VotEn9AWwTFtJPJSMV5F9jsMY6QwWM5qn3XP9PATGW7');

/**
 * Analyze VSR account structure to find wallet addresses
 */
function analyzeVSRAccountForWallets(data, accountAddress) {
  const wallets = [];
  
  // Look for potential wallet addresses (32-byte PublicKeys) at common offsets
  const commonOffsets = [0, 8, 32, 40, 64, 72];
  
  for (const offset of commonOffsets) {
    if (offset + 32 <= data.length) {
      try {
        const pubkey = new PublicKey(data.slice(offset, offset + 32));
        const address = pubkey.toBase58();
        
        // Skip system program and common invalid addresses
        if (address !== '11111111111111111111111111111111' && 
            address !== '1111111111111111111111111111111' &&
            !address.includes('1111111')) {
          wallets.push({
            offset,
            address,
            accountAddress
          });
        }
      } catch (error) {
        // Not a valid pubkey
      }
    }
  }
  
  return wallets;
}

/**
 * Search for specific known wallets in VSR accounts
 */
async function searchForKnownWallets() {
  try {
    const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
    
    const knownWallets = [
      'DqH7YkHBu4pKxCp5JsLZT8jMKYmYTN9cmEyQHPbxMPkE', // DeanMachine
      'GJdRQcsyoKpW8a3YFe9HqeZdnG4Z8h5gM9qo8M3iThz8'  // legend
    ];
    
    console.log('Loading VSR accounts to search for known wallets...');
    const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    console.log(`Analyzing ${accounts.length} VSR accounts\n`);
    
    const walletMatches = new Map();
    
    for (let i = 0; i < accounts.length; i++) {
      const account = accounts[i];
      const data = account.account.data;
      
      // Search for each known wallet in this account's data
      for (const knownWallet of knownWallets) {
        const knownPubkey = new PublicKey(knownWallet);
        const knownBytes = knownPubkey.toBytes();
        
        // Search for the wallet's bytes in the account data
        for (let offset = 0; offset <= data.length - 32; offset++) {
          if (data.slice(offset, offset + 32).equals(knownBytes)) {
            console.log(`*** FOUND ${knownWallet} ***`);
            console.log(`Account: ${account.pubkey.toBase58()}`);
            console.log(`Offset: ${offset}`);
            console.log(`Data length: ${data.length} bytes\n`);
            
            if (!walletMatches.has(knownWallet)) {
              walletMatches.set(knownWallet, []);
            }
            walletMatches.get(knownWallet).push({
              account: account.pubkey.toBase58(),
              offset,
              dataLength: data.length,
              data: data
            });
          }
        }
      }
      
      // Show progress every 50 accounts
      if ((i + 1) % 50 === 0) {
        console.log(`Searched ${i + 1}/${accounts.length} accounts...`);
      }
    }
    
    return walletMatches;
    
  } catch (error) {
    console.error('Error searching for known wallets:', error);
    return new Map();
  }
}

/**
 * Extract governance power from accounts containing known wallets
 */
function extractGovernancePowerFromMatch(matchData) {
  try {
    const data = matchData.data;
    const dataLength = data.length;
    
    console.log(`Analyzing account with ${dataLength} bytes of data...`);
    
    // Look for large numbers that could be governance power
    const potentialPowers = [];
    
    for (let offset = 0; offset <= dataLength - 8; offset += 8) {
      const value = new BN(data.slice(offset, offset + 8), 'le');
      
      // Look for values that could be governance power (in lamports)
      if (value.gt(new BN(1000000)) && value.lt(new BN('100000000000000'))) {
        const tokenValue = value.div(new BN(1000000));
        potentialPowers.push({
          offset,
          lamports: value.toString(),
          tokens: tokenValue.toString()
        });
      }
    }
    
    console.log('Potential governance power values found:');
    potentialPowers.forEach(power => {
      console.log(`  Offset ${power.offset}: ${power.tokens} ISLAND (${power.lamports} lamports)`);
    });
    
    // Return the largest reasonable value
    const reasonablePowers = potentialPowers.filter(p => {
      const tokens = parseInt(p.tokens);
      return tokens >= 100 && tokens <= 50000000; // Between 100 and 50M ISLAND
    });
    
    if (reasonablePowers.length > 0) {
      // Sort by token amount and return the largest
      reasonablePowers.sort((a, b) => parseInt(b.tokens) - parseInt(a.tokens));
      return new BN(reasonablePowers[0].tokens);
    }
    
    return new BN(0);
    
  } catch (error) {
    console.error('Error extracting governance power:', error);
    return new BN(0);
  }
}

/**
 * Test the wallet matching system
 */
async function testWalletMatching() {
  console.log('Testing VSR wallet matching system...\n');
  
  const walletMatches = await searchForKnownWallets();
  
  console.log('\n=== Wallet Match Results ===');
  
  for (const [wallet, matches] of walletMatches.entries()) {
    console.log(`\n${wallet}:`);
    console.log(`Found in ${matches.length} VSR accounts`);
    
    let maxPower = new BN(0);
    
    for (const match of matches) {
      console.log(`\nAccount: ${match.account} (${match.dataLength} bytes)`);
      const power = extractGovernancePowerFromMatch(match);
      console.log(`Extracted power: ${power.toString()} ISLAND`);
      
      if (power.gt(maxPower)) {
        maxPower = power;
      }
    }
    
    console.log(`\n*** Maximum power for ${wallet}: ${maxPower.toString()} ISLAND ***`);
  }
  
  if (walletMatches.size === 0) {
    console.log('No known wallets found in VSR accounts');
    console.log('This might indicate the wallets are stored differently or need different extraction logic');
  }
}

module.exports = {
  searchForKnownWallets,
  extractGovernancePowerFromMatch,
  testWalletMatching
};

// Run test if called directly
if (require.main === module) {
  testWalletMatching().then(() => {
    console.log('\nWallet matching test completed');
    process.exit(0);
  }).catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}