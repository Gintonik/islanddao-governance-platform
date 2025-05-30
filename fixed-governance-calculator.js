/**
 * Fixed Governance Calculator
 * Based on the comprehensive analysis that was working earlier
 * Properly aggregates ALL deposits and VSR accounts for each wallet
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { BN } = require('@coral-xyz/anchor');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const VSR_PROGRAM_ID = new PublicKey('VotEn9AWwTFtJPJSMV5F9jsMY6QwWM5qn3XP9PATGW7');

/**
 * Extract all VSR accounts and properly calculate governance power
 */
async function extractCompleteGovernancePower() {
  try {
    const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
    
    console.log('Loading all VSR accounts...');
    const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    console.log(`Processing ${accounts.length} VSR accounts...\n`);
    
    const walletAccountMap = new Map(); // wallet -> array of accounts
    const walletGovernanceMap = new Map(); // wallet -> total governance power
    
    // Process each VSR account
    for (const account of accounts) {
      const data = account.account.data;
      const accountAddress = account.pubkey.toBase58();
      
      // Extract wallet and governance data from this account
      const accountInfo = extractAccountInfo(data, accountAddress);
      
      if (accountInfo && accountInfo.wallet) {
        // Map wallet to this account
        if (!walletAccountMap.has(accountInfo.wallet)) {
          walletAccountMap.set(accountInfo.wallet, []);
        }
        walletAccountMap.get(accountInfo.wallet).push(accountInfo);
        
        // Add governance power for this wallet
        const currentPower = walletGovernanceMap.get(accountInfo.wallet) || new BN(0);
        const newPower = currentPower.add(accountInfo.governance_power);
        walletGovernanceMap.set(accountInfo.wallet, newPower);
      }
    }
    
    return { walletAccountMap, walletGovernanceMap };
    
  } catch (error) {
    console.error('Error extracting governance power:', error);
    return { walletAccountMap: new Map(), walletGovernanceMap: new Map() };
  }
}

/**
 * Extract wallet and governance info from a single VSR account
 */
function extractAccountInfo(data, accountAddress) {
  try {
    const dataLength = data.length;
    
    if (dataLength === 2728) {
      // Voter records
      return extractFromVoterRecord(data, accountAddress);
    } else if (dataLength === 176) {
      // Deposit entries
      return extractFromDepositEntry(data, accountAddress);
    } else if (dataLength === 880) {
      // Registrar accounts
      return extractFromRegistrarAccount(data, accountAddress);
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Extract from voter record (2728 bytes)
 */
function extractFromVoterRecord(data, accountAddress) {
  try {
    // Get voter authority (wallet) at offset 8
    const wallet = extractWalletFromOffset(data, 8);
    if (!wallet) return null;
    
    let totalGovernancePower = new BN(0);
    const deposits = [];
    
    // Parse all deposits (max 32)
    for (let i = 0; i < 32; i++) {
      const depositOffset = 72 + (i * 64);
      if (depositOffset + 64 > data.length) break;
      
      const isUsed = data[depositOffset] !== 0;
      if (!isUsed) continue;
      
      try {
        const amountDeposited = new BN(data.slice(depositOffset + 8, depositOffset + 16), 'le');
        const lockupEndTs = new BN(data.slice(depositOffset + 32, depositOffset + 40), 'le');
        
        if (amountDeposited.gt(new BN(0))) {
          // Calculate governance power for this deposit
          const now = Math.floor(Date.now() / 1000);
          const timeRemaining = Math.max(0, lockupEndTs.toNumber() - now);
          const maxLockupTime = 5 * 365 * 24 * 60 * 60; // 5 years
          
          // VSR multiplier: 1x base + up to 5x lockup = max 6x
          const lockupMultiplier = 1 + Math.min(timeRemaining / maxLockupTime, 1) * 5;
          const depositGovernancePower = amountDeposited.muln(Math.floor(lockupMultiplier * 100)).divn(100);
          
          totalGovernancePower = totalGovernancePower.add(depositGovernancePower);
          
          deposits.push({
            amount: amountDeposited.div(new BN(1000000)).toString(),
            multiplier: lockupMultiplier.toFixed(2),
            governance_power: depositGovernancePower.div(new BN(1000000)).toString()
          });
        }
      } catch (error) {
        // Skip problematic deposits
      }
    }
    
    // Also check for final governance value at end of account
    try {
      const finalValue = new BN(data.slice(2720, 2728), 'le');
      if (finalValue.gt(totalGovernancePower)) {
        totalGovernancePower = finalValue; // Use final value if higher
      }
    } catch (error) {
      // Continue with calculated value
    }
    
    return {
      wallet,
      account_type: 'voter_record',
      account_address: accountAddress,
      deposits,
      governance_power: totalGovernancePower.div(new BN(1000000)), // Convert to ISLAND tokens
      raw_governance_power: totalGovernancePower
    };
    
  } catch (error) {
    return null;
  }
}

/**
 * Extract from deposit entry (176 bytes)
 */
function extractFromDepositEntry(data, accountAddress) {
  try {
    // Find wallet address in the account data
    let wallet = null;
    for (let offset = 0; offset <= 96; offset += 32) {
      const testWallet = extractWalletFromOffset(data, offset);
      if (testWallet && testWallet !== '11111111111111111111111111111111') {
        wallet = testWallet;
        break;
      }
    }
    
    if (!wallet) return null;
    
    // Extract deposit amount and calculate governance power
    const amount = new BN(data.slice(8, 16), 'le');
    const lockupEnd = new BN(data.slice(168, 176), 'le');
    
    if (amount.isZero()) return null;
    
    // Calculate governance power
    const now = Math.floor(Date.now() / 1000);
    let timeRemaining = 0;
    
    try {
      timeRemaining = Math.max(0, lockupEnd.toNumber() - now);
    } catch (error) {
      // Handle overflow - assume no time remaining
      timeRemaining = 0;
    }
    
    const maxLockupTime = 5 * 365 * 24 * 60 * 60;
    const lockupMultiplier = 1 + Math.min(timeRemaining / maxLockupTime, 1) * 5;
    const governancePower = amount.muln(Math.floor(lockupMultiplier * 100)).divn(100);
    
    return {
      wallet,
      account_type: 'deposit_entry',
      account_address: accountAddress,
      deposits: [{
        amount: amount.div(new BN(1000000)).toString(),
        multiplier: lockupMultiplier.toFixed(2),
        governance_power: governancePower.div(new BN(1000000)).toString()
      }],
      governance_power: governancePower.div(new BN(1000000)),
      raw_governance_power: governancePower
    };
    
  } catch (error) {
    return null;
  }
}

/**
 * Extract from registrar account (880 bytes)
 */
function extractFromRegistrarAccount(data, accountAddress) {
  try {
    // Look for wallet addresses and governance values
    const wallets = [];
    
    for (let offset = 0; offset <= 200; offset += 32) {
      const wallet = extractWalletFromOffset(data, offset);
      if (wallet && wallet !== '11111111111111111111111111111111') {
        wallets.push(wallet);
      }
    }
    
    if (wallets.length === 0) return null;
    
    // Look for governance power values
    for (let offset = 200; offset <= data.length - 8; offset += 8) {
      try {
        const value = new BN(data.slice(offset, offset + 8), 'le');
        if (value.gt(new BN(1000000)) && value.lt(new BN('50000000000000'))) {
          return {
            wallet: wallets[0], // Use first wallet found
            account_type: 'registrar',
            account_address: accountAddress,
            deposits: [],
            governance_power: value.div(new BN(1000000)),
            raw_governance_power: value
          };
        }
      } catch (error) {
        // Continue searching
      }
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Extract wallet address from specific offset
 */
function extractWalletFromOffset(data, offset) {
  try {
    if (offset + 32 <= data.length) {
      const pubkey = new PublicKey(data.slice(offset, offset + 32));
      const address = pubkey.toBase58();
      
      if (address !== '11111111111111111111111111111111' && 
          !address.includes('111111111111111') &&
          address.length === 44) {
        return address;
      }
    }
  } catch (error) {
    // Not a valid pubkey
  }
  return null;
}

/**
 * Test with known wallets
 */
async function testFixedGovernanceCalculation() {
  console.log('Testing fixed governance calculation...\n');
  
  const { walletAccountMap, walletGovernanceMap } = await extractCompleteGovernancePower();
  
  // Test known wallets
  const testWallets = [
    { address: '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt', expected: '10353648.013', name: 'DeanMachine' },
    { address: 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh', expected: '144708.982', name: 'GJdRQcsy' },
    { address: 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG', expected: '3361730.15', name: 'legend' },
    { address: 'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1', expected: '200000', name: 'Titanmaker' }
  ];
  
  console.log('=== Testing Known Wallets ===');
  for (const testWallet of testWallets) {
    const foundPower = walletGovernanceMap.get(testWallet.address);
    const accounts = walletAccountMap.get(testWallet.address) || [];
    
    console.log(`\n${testWallet.name} (${testWallet.address}):`);
    console.log(`  Expected: ${testWallet.expected} ISLAND`);
    console.log(`  Found: ${foundPower ? foundPower.toString() : '0'} ISLAND`);
    console.log(`  Accounts: ${accounts.length}`);
    
    // Show account details
    accounts.forEach((account, idx) => {
      console.log(`    Account ${idx + 1}: ${account.account_type} - ${account.governance_power.toString()} ISLAND`);
      account.deposits.forEach((deposit, didx) => {
        console.log(`      Deposit ${didx + 1}: ${deposit.amount} ISLAND × ${deposit.multiplier} = ${deposit.governance_power} ISLAND`);
      });
    });
    
    // Check if close to expected
    if (foundPower) {
      const diff = Math.abs(foundPower.toNumber() - parseFloat(testWallet.expected));
      if (diff < 100) {
        console.log(`  *** CLOSE MATCH! (difference: ${diff.toFixed(3)}) ***`);
      }
    }
  }
  
  // Show top holders
  console.log('\n=== Top 10 Governance Power Holders ===');
  const sortedHolders = Array.from(walletGovernanceMap.entries())
    .sort((a, b) => b[1].cmp(a[1]))
    .slice(0, 10);
    
  sortedHolders.forEach((entry, index) => {
    const [wallet, power] = entry;
    console.log(`${index + 1}. ${wallet}: ${power.toString()} ISLAND`);
  });
  
  return walletGovernanceMap;
}

module.exports = {
  extractCompleteGovernancePower,
  testFixedGovernanceCalculation
};

// Run test if called directly
if (require.main === module) {
  testFixedGovernanceCalculation().then(() => {
    console.log('\nFixed governance calculation test completed');
    process.exit(0);
  }).catch(error => {
    console.error('Test failed:', error);
    process.exit(1);
  });
}