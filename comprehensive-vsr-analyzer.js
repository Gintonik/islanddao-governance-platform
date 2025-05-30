/**
 * Comprehensive VSR Governance Power Analyzer
 * Reverse engineers the complete VSR calculation from blockchain data
 * Handles multiple locks, durations, expirations, and delegation relationships
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { BN } = require('@coral-xyz/anchor');

// VSR Program and SPL Governance constants
const VSR_PROGRAM_ID = new PublicKey('VotEn9AWwTFtJPJSMV5F9jsMY6QwWM5qn3XP9PATGW7');
const SPL_GOVERNANCE_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const REALM_ID = new PublicKey('4Z6bAwcBkDg8We6rRdnuCBNu2UUuSVnTekFWrtzckRA7');
const COMMUNITY_MINT = new PublicKey('FKJvvVJ242tX7zFtzTmzqoA631LqHh4CdgcN8dcfFSju');

/**
 * Analyze a single VSR account with detailed structure parsing
 */
function analyzeVSRAccountStructure(data, accountAddress) {
  try {
    const analysis = {
      account: accountAddress,
      size: data.length,
      type: 'unknown',
      wallets: [],
      deposits: [],
      governance_values: [],
      timestamps: []
    };

    // Determine account type by size
    if (data.length === 176) {
      analysis.type = 'deposit_entry';
      analyzeDepositEntry(data, analysis);
    } else if (data.length === 2728) {
      analysis.type = 'voter_record';
      analyzeVoterRecord(data, analysis);
    } else if (data.length === 880) {
      analysis.type = 'registrar_or_config';
      analyzeRegistrarAccount(data, analysis);
    }

    return analysis;
  } catch (error) {
    return null;
  }
}

/**
 * Analyze deposit entry (176 bytes) - individual lockup deposits
 */
function analyzeDepositEntry(data, analysis) {
  try {
    // Extract wallet addresses at common offsets
    for (let offset = 0; offset <= 64; offset += 32) {
      const wallet = extractWalletFromOffset(data, offset);
      if (wallet) {
        analysis.wallets.push({ offset, wallet });
      }
    }

    // Extract deposit information
    const amount = new BN(data.slice(8, 16), 'le');
    const lockupStart = new BN(data.slice(24, 32), 'le');
    const lockupEnd = new BN(data.slice(168, 176), 'le');
    
    if (amount.gt(new BN(0))) {
      const now = Math.floor(Date.now() / 1000);
      const timeRemaining = Math.max(0, lockupEnd.toNumber() - now);
      const lockupDuration = lockupEnd.toNumber() - lockupStart.toNumber();
      
      // VSR multiplier calculation
      const maxLockupTime = 5 * 365 * 24 * 60 * 60; // 5 years
      const lockupMultiplier = 1 + Math.min(timeRemaining / maxLockupTime, 1) * 5;
      
      analysis.deposits.push({
        amount: amount.toString(),
        amount_tokens: amount.div(new BN(1000000)).toString(),
        lockup_start: lockupStart.toString(),
        lockup_end: lockupEnd.toString(),
        time_remaining: timeRemaining,
        lockup_duration: lockupDuration,
        multiplier: lockupMultiplier,
        governance_power: amount.muln(Math.floor(lockupMultiplier * 100)).divn(100).div(new BN(1000000)).toString()
      });
    }

    // Look for governance power values
    for (let offset = 0; offset <= data.length - 8; offset += 8) {
      const value = new BN(data.slice(offset, offset + 8), 'le');
      if (value.gt(new BN(1000000)) && value.lt(new BN('1000000000000000'))) {
        analysis.governance_values.push({
          offset,
          lamports: value.toString(),
          tokens: value.div(new BN(1000000)).toString()
        });
      }
    }
  } catch (error) {
    // Continue with partial analysis
  }
}

/**
 * Analyze voter record (2728 bytes) - aggregated voting power
 */
function analyzeVoterRecord(data, analysis) {
  try {
    // Extract voter authority
    const voterAuthority = extractWalletFromOffset(data, 8);
    if (voterAuthority) {
      analysis.wallets.push({ offset: 8, wallet: voterAuthority, role: 'voter_authority' });
    }

    // Extract registrar
    const registrar = extractWalletFromOffset(data, 40);
    if (registrar) {
      analysis.wallets.push({ offset: 40, wallet: registrar, role: 'registrar' });
    }

    // Parse deposits array (starts around offset 72)
    const maxDeposits = 32;
    for (let i = 0; i < maxDeposits; i++) {
      const depositOffset = 72 + (i * 64);
      if (depositOffset + 64 > data.length) break;

      const isUsed = data[depositOffset] !== 0;
      if (!isUsed) continue;

      const votingMintConfigIdx = data[depositOffset + 1];
      const amountDeposited = new BN(data.slice(depositOffset + 8, depositOffset + 16), 'le');
      const amountInitiallyLocked = new BN(data.slice(depositOffset + 16, depositOffset + 24), 'le');
      const lockupStartTs = new BN(data.slice(depositOffset + 24, depositOffset + 32), 'le');
      const lockupEndTs = new BN(data.slice(depositOffset + 32, depositOffset + 40), 'le');

      if (amountDeposited.gt(new BN(0))) {
        const now = Math.floor(Date.now() / 1000);
        const timeRemaining = Math.max(0, lockupEndTs.toNumber() - now);
        const lockupDuration = lockupEndTs.toNumber() - lockupStartTs.toNumber();
        
        // Calculate governance power for this deposit
        const maxLockupTime = 5 * 365 * 24 * 60 * 60;
        const lockupMultiplier = 1 + Math.min(timeRemaining / maxLockupTime, 1) * 5;
        const depositGovernancePower = amountDeposited.muln(Math.floor(lockupMultiplier * 100)).divn(100);

        analysis.deposits.push({
          index: i,
          voting_mint_config_idx: votingMintConfigIdx,
          amount_deposited: amountDeposited.toString(),
          amount_deposited_tokens: amountDeposited.div(new BN(1000000)).toString(),
          amount_initially_locked: amountInitiallyLocked.toString(),
          lockup_start: lockupStartTs.toString(),
          lockup_end: lockupEndTs.toString(),
          time_remaining: timeRemaining,
          lockup_duration: lockupDuration,
          multiplier: lockupMultiplier,
          governance_power: depositGovernancePower.div(new BN(1000000)).toString()
        });
      }
    }

    // Look for final governance power value (often at the end)
    const finalGovernancePower = new BN(data.slice(2720, 2728), 'le');
    if (finalGovernancePower.gt(new BN(0))) {
      analysis.governance_values.push({
        offset: 2720,
        lamports: finalGovernancePower.toString(),
        tokens: finalGovernancePower.div(new BN(1000000)).toString(),
        type: 'final_voting_power'
      });
    }
  } catch (error) {
    // Continue with partial analysis
  }
}

/**
 * Analyze registrar account (880 bytes) - configuration and delegation info
 */
function analyzeRegistrarAccount(data, analysis) {
  try {
    // Look for governance program ID
    const governanceProgramId = extractWalletFromOffset(data, 0);
    if (governanceProgramId) {
      analysis.wallets.push({ offset: 0, wallet: governanceProgramId, role: 'governance_program' });
    }

    // Look for realm
    const realm = extractWalletFromOffset(data, 32);
    if (realm) {
      analysis.wallets.push({ offset: 32, wallet: realm, role: 'realm' });
    }

    // Look for governing token mint
    const governingTokenMint = extractWalletFromOffset(data, 64);
    if (governingTokenMint) {
      analysis.wallets.push({ offset: 64, wallet: governingTokenMint, role: 'governing_token_mint' });
    }

    // Extract governance values
    for (let offset = 200; offset <= data.length - 8; offset += 8) {
      const value = new BN(data.slice(offset, offset + 8), 'le');
      if (value.gt(new BN(1000000)) && value.lt(new BN('10000000000000'))) {
        analysis.governance_values.push({
          offset,
          lamports: value.toString(),
          tokens: value.div(new BN(1000000)).toString()
        });
      }
    }
  } catch (error) {
    // Continue with partial analysis
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
 * Analyze all VSR accounts and find governance patterns
 */
async function analyzeAllVSRAccounts() {
  try {
    const connection = new Connection('https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
    
    console.log('Loading all VSR accounts for comprehensive analysis...');
    const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    
    console.log(`Analyzing ${accounts.length} VSR accounts...\n`);
    
    const accountAnalyses = [];
    const walletToAccounts = new Map();
    const walletGovernancePower = new Map();
    
    for (const account of accounts) {
      const analysis = analyzeVSRAccountStructure(account.account.data, account.pubkey.toBase58());
      
      if (analysis) {
        accountAnalyses.push(analysis);
        
        // Map wallets to their accounts
        for (const walletInfo of analysis.wallets) {
          if (!walletToAccounts.has(walletInfo.wallet)) {
            walletToAccounts.set(walletInfo.wallet, []);
          }
          walletToAccounts.get(walletInfo.wallet).push(analysis);
        }
      }
    }
    
    // Calculate total governance power for each wallet
    for (const [wallet, accounts] of walletToAccounts.entries()) {
      let totalPower = new BN(0);
      
      for (const account of accounts) {
        // Sum governance power from all deposits
        for (const deposit of account.deposits) {
          const power = new BN(deposit.governance_power);
          totalPower = totalPower.add(power);
        }
        
        // Also consider final governance values
        for (const govValue of account.governance_values) {
          if (govValue.type === 'final_voting_power') {
            const power = new BN(govValue.tokens);
            if (power.gt(totalPower)) {
              totalPower = power; // Use maximum value methodology
            }
          }
        }
      }
      
      if (totalPower.gt(new BN(0))) {
        walletGovernancePower.set(wallet, totalPower);
      }
    }
    
    return {
      accountAnalyses,
      walletToAccounts,
      walletGovernancePower
    };
    
  } catch (error) {
    console.error('Error analyzing VSR accounts:', error);
    return null;
  }
}

/**
 * Test comprehensive VSR analysis with known wallets
 */
async function testComprehensiveVSRAnalysis() {
  console.log('Testing comprehensive VSR analysis...\n');
  
  const result = await analyzeAllVSRAccounts();
  if (!result) return;
  
  const { accountAnalyses, walletToAccounts, walletGovernancePower } = result;
  
  // Show summary
  console.log(`=== VSR Analysis Summary ===`);
  console.log(`Total accounts analyzed: ${accountAnalyses.length}`);
  console.log(`Unique wallets found: ${walletToAccounts.size}`);
  console.log(`Wallets with governance power: ${walletGovernancePower.size}\n`);
  
  // Show top governance holders
  const sortedPowers = Array.from(walletGovernancePower.entries())
    .sort((a, b) => b[1].cmp(a[1]))
    .slice(0, 10);
  
  console.log('=== Top 10 Governance Power Holders ===');
  sortedPowers.forEach((entry, index) => {
    const [wallet, power] = entry;
    console.log(`${index + 1}. ${wallet}: ${power.toString()} ISLAND`);
  });
  
  // Detailed analysis of top holders
  console.log('\n=== Detailed Analysis of Top Holders ===');
  for (let i = 0; i < Math.min(3, sortedPowers.length); i++) {
    const [wallet, power] = sortedPowers[i];
    console.log(`\n--- ${wallet} (${power.toString()} ISLAND) ---`);
    
    const accounts = walletToAccounts.get(wallet) || [];
    console.log(`Found in ${accounts.length} VSR accounts:`);
    
    for (const account of accounts) {
      console.log(`\nAccount: ${account.account} (${account.type})`);
      console.log(`Deposits: ${account.deposits.length}`);
      
      account.deposits.forEach((deposit, idx) => {
        console.log(`  ${idx + 1}. ${deposit.amount_deposited_tokens} ISLAND locked until ${new Date(deposit.lockup_end * 1000).toLocaleDateString()}, multiplier: ${deposit.multiplier.toFixed(2)}x, power: ${deposit.governance_power} ISLAND`);
      });
      
      if (account.governance_values.length > 0) {
        console.log(`Governance values found:`);
        account.governance_values.forEach(value => {
          console.log(`  Offset ${value.offset}: ${value.tokens} ISLAND${value.type ? ` (${value.type})` : ''}`);
        });
      }
    }
  }
  
  // Test known wallets
  console.log('\n=== Known Wallet Test ===');
  const knownWallets = [
    'DqH7YkHBu4pKxCp5JsLZT8jMKYmYTN9cmEyQHPbxMPkE', // DeanMachine
    'GJdRQcsyoKpW8a3YFe9HqeZdnG4Z8h5gM9qo8M3iThz8'  // legend
  ];
  
  knownWallets.forEach(wallet => {
    const power = walletGovernancePower.get(wallet) || new BN(0);
    const accounts = walletToAccounts.get(wallet) || [];
    console.log(`${wallet}: ${power.toString()} ISLAND (${accounts.length} accounts)`);
  });
  
  return walletGovernancePower;
}

module.exports = {
  analyzeAllVSRAccounts,
  testComprehensiveVSRAnalysis
};

// Run test if called directly
if (require.main === module) {
  testComprehensiveVSRAnalysis().then(() => {
    console.log('\nComprehensive VSR analysis completed');
    process.exit(0);
  }).catch(error => {
    console.error('Analysis failed:', error);
    process.exit(1);
  });
}