/**
 * Debug VSR Deposits - Detailed Analysis
 * Shows individual deposit entries with proper validation
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

/**
 * Parse individual deposit entry with detailed logging
 */
function parseDepositEntry(data, offset, index) {
  try {
    // Lockup structure (24 bytes)
    const startTs = Number(data.readBigInt64LE(offset));
    const endTs = Number(data.readBigInt64LE(offset + 8));
    const lockupKind = data.readUInt8(offset + 16);
    
    // Skip remaining lockup padding
    offset += 24;
    
    // Deposit amounts (16 bytes)
    const amountDepositedNative = Number(data.readBigUInt64LE(offset));
    const amountInitiallyLockedNative = Number(data.readBigUInt64LE(offset + 8));
    offset += 16;
    
    // Flags (2 bytes)
    const isUsed = data.readUInt8(offset) === 1;
    const allowClawback = data.readUInt8(offset + 1) === 1;
    offset += 2;
    
    // Voting mint config index (1 byte)
    const votingMintConfigIdx = data.readUInt8(offset);
    offset += 1;
    
    // Additional fields that might exist in some implementations
    let available = 0;
    let currentlyLocked = 0;
    
    // Try to read additional fields if they exist
    if (offset + 16 <= data.length) {
      try {
        available = Number(data.readBigUInt64LE(offset));
        currentlyLocked = Number(data.readBigUInt64LE(offset + 8));
      } catch (error) {
        // These fields might not exist in all implementations
      }
    }
    
    return {
      index,
      lockup: {
        startTs,
        endTs,
        kind: lockupKind
      },
      amountDepositedNative,
      amountInitiallyLockedNative,
      isUsed,
      allowClawback,
      votingMintConfigIdx,
      available,
      currentlyLocked
    };
    
  } catch (error) {
    console.error(`Error parsing deposit ${index}:`, error.message);
    return null;
  }
}

/**
 * Parse voter account and extract all deposits with validation
 */
function parseVoterAccountWithDeposits(data, walletPubkey) {
  try {
    // Find voter account structure by looking for the wallet as voter_authority
    for (let baseOffset = 8; baseOffset <= 50; baseOffset += 8) {
      try {
        const potentialAuthority = new PublicKey(data.slice(baseOffset, baseOffset + 32));
        if (potentialAuthority.equals(walletPubkey)) {
          
          console.log(`Found voter account with authority at offset ${baseOffset}`);
          
          // Skip voter_authority (32) + registrar (32)
          const depositsOffset = baseOffset + 64;
          
          if (depositsOffset + 4 < data.length) {
            const depositsCount = data.readUInt32LE(depositsOffset);
            console.log(`Deposits count: ${depositsCount}`);
            
            if (depositsCount > 0 && depositsCount < 50) {
              const deposits = [];
              let currentOffset = depositsOffset + 4;
              
              for (let i = 0; i < depositsCount && currentOffset + 50 < data.length; i++) {
                const deposit = parseDepositEntry(data, currentOffset, i);
                if (deposit) {
                  deposits.push(deposit);
                }
                currentOffset += 56; // Approximate deposit entry size with padding
              }
              
              return deposits;
            }
          }
        }
      } catch (error) {
        // Continue searching
      }
    }
    
    return [];
  } catch (error) {
    console.error('Error parsing voter account:', error.message);
    return [];
  }
}

/**
 * Calculate voting power for a deposit with proper validation
 */
function calculateDepositVotingPower(deposit) {
  const currentTimestamp = Math.floor(Date.now() / 1000);
  
  console.log(`  Deposit ${deposit.index}:`);
  console.log(`    Amount Deposited: ${(deposit.amountDepositedNative / 1e6).toLocaleString()} ISLAND`);
  console.log(`    Amount Initially Locked: ${(deposit.amountInitiallyLockedNative / 1e6).toLocaleString()} ISLAND`);
  console.log(`    Lockup Kind: ${deposit.lockup.kind} (0=none, 1=cliff, 2=constant, 3=monthly, 4=daily)`);
  console.log(`    Start TS: ${deposit.lockup.startTs} (${new Date(deposit.lockup.startTs * 1000).toISOString()})`);
  console.log(`    End TS: ${deposit.lockup.endTs} (${new Date(deposit.lockup.endTs * 1000).toISOString()})`);
  console.log(`    Is Used: ${deposit.isUsed}`);
  console.log(`    Available (unlocked): ${(deposit.available / 1e6).toLocaleString()} ISLAND`);
  console.log(`    Currently Locked: ${(deposit.currentlyLocked / 1e6).toLocaleString()} ISLAND`);
  
  // Validation checks
  if (!deposit.isUsed) {
    console.log(`    ❌ SKIPPED: Deposit not used`);
    return 0;
  }
  
  if (deposit.available > 0) {
    console.log(`    ❌ SKIPPED: Deposit has unlocked amount (${deposit.available / 1e6} ISLAND)`);
    return 0;
  }
  
  if (deposit.lockup.endTs <= currentTimestamp) {
    console.log(`    ❌ SKIPPED: Lockup expired (ended ${new Date(deposit.lockup.endTs * 1000).toISOString()})`);
    return 0;
  }
  
  if (deposit.amountDepositedNative === 0) {
    console.log(`    ❌ SKIPPED: Zero deposit amount`);
    return 0;
  }
  
  // Calculate remaining lockup time
  const lockupSecsRemaining = deposit.lockup.endTs - currentTimestamp;
  const lockupDaysRemaining = Math.round(lockupSecsRemaining / 86400);
  
  // Simple multiplier calculation (should be replaced with authentic VSR formula)
  let multiplier = 1.0; // Base multiplier
  
  // Add lockup bonus based on remaining time (simplified)
  if (lockupSecsRemaining > 0) {
    const maxLockupSecs = 4 * 365 * 24 * 60 * 60; // 4 years
    const lockupFactor = Math.min(lockupSecsRemaining / maxLockupSecs, 1.0);
    multiplier += lockupFactor * 4.0; // Up to 5x multiplier for max lockup
  }
  
  const votingPower = (deposit.amountDepositedNative * multiplier) / 1e6;
  
  console.log(`    Lockup Days Remaining: ${lockupDaysRemaining}`);
  console.log(`    Multiplier: ${multiplier.toFixed(2)}x`);
  console.log(`    ✅ Voting Power: ${votingPower.toLocaleString()} ISLAND`);
  
  return votingPower;
}

/**
 * Debug specific wallet VSR accounts
 */
async function debugWalletVSR(walletAddress) {
  try {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`DEBUG VSR DEPOSITS FOR: ${walletAddress}`);
    console.log(`${'='.repeat(80)}`);
    
    const connection = new Connection(process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
    
    // Load all VSR accounts
    const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
    console.log(`Loaded ${allVSRAccounts.length} VSR accounts`);
    
    const walletPubkey = new PublicKey(walletAddress);
    const walletBuffer = walletPubkey.toBuffer();
    
    let totalVotingPower = 0;
    let validDeposits = 0;
    let vsrAccountsFound = 0;
    
    // Search through VSR accounts
    for (const account of allVSRAccounts) {
      try {
        const data = account.account.data;
        
        // Check if wallet is referenced in this account
        let walletFound = false;
        for (let offset = 0; offset <= data.length - 32; offset += 8) {
          if (data.subarray(offset, offset + 32).equals(walletBuffer)) {
            walletFound = true;
            break;
          }
        }
        
        if (!walletFound) continue;
        
        vsrAccountsFound++;
        console.log(`\nVSR Account ${vsrAccountsFound}: ${account.pubkey.toBase58()}`);
        console.log(`Account size: ${data.length} bytes`);
        
        // Try to parse as voter account with deposits
        const deposits = parseVoterAccountWithDeposits(data, walletPubkey);
        
        if (deposits.length > 0) {
          console.log(`\nFound ${deposits.length} deposits in this account:`);
          
          for (const deposit of deposits) {
            const depositPower = calculateDepositVotingPower(deposit);
            if (depositPower > 0) {
              totalVotingPower += depositPower;
              validDeposits++;
            }
          }
        } else {
          // Fall back to offset-based extraction
          console.log(`No deposits parsed, trying offset-based extraction...`);
          
          const governanceOffsets = [104, 112];
          let maxAccountPower = 0;
          
          for (const offset of governanceOffsets) {
            if (offset + 8 <= data.length) {
              try {
                const value = Number(data.readBigUInt64LE(offset)) / 1e6;
                if (value > 1000 && value < 50000000) {
                  maxAccountPower = Math.max(maxAccountPower, value);
                  console.log(`  Offset ${offset}: ${value.toLocaleString()} ISLAND`);
                }
              } catch (error) {
                // Skip invalid data
              }
            }
          }
          
          if (maxAccountPower > 0) {
            console.log(`  Max power from offsets: ${maxAccountPower.toLocaleString()} ISLAND`);
            totalVotingPower += maxAccountPower;
          }
        }
        
      } catch (error) {
        console.error(`Error processing VSR account:`, error.message);
      }
    }
    
    console.log(`\n${'='.repeat(80)}`);
    console.log(`SUMMARY FOR ${walletAddress}:`);
    console.log(`VSR Accounts Found: ${vsrAccountsFound}`);
    console.log(`Valid Deposits: ${validDeposits}`);
    console.log(`Total Voting Power: ${totalVotingPower.toLocaleString()} ISLAND`);
    console.log(`${'='.repeat(80)}\n`);
    
    return totalVotingPower;
    
  } catch (error) {
    console.error(`Error debugging ${walletAddress}:`, error.message);
    return 0;
  }
}

/**
 * Debug specific wallets
 */
async function debugSpecificWallets() {
  const testWallets = [
    '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt', // DeanMachine
    'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG', // legend
    'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1', // Titanmaker
    '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4'  // Whale's Friend
  ];
  
  for (const wallet of testWallets) {
    await debugWalletVSR(wallet);
    // Small delay between wallets
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}

debugSpecificWallets();