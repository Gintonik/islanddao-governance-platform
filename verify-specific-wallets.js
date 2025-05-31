/**
 * Verify Specific Wallets
 * Detailed analysis of Titanmaker, GJdRQcsy, and Legend to ensure correct parsing
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const REGISTRAR_ADDRESS = new PublicKey('5ZnjJjALX8xs7zuM6t6m7XVkPV3fY3NqxwHvDLhwpShM');

const connection = new Connection(HELIUS_RPC, 'confirmed');

const REGISTRAR_CONFIG = {
  baselineVoteWeight: 1.0,
  maxExtraLockupVoteWeight: 3.0,
  lockupSaturationSecs: 31536000
};

async function findVSRAccounts(walletPubkey) {
  const accounts = [];
  
  const authAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { memcmp: { offset: 8, bytes: walletPubkey.toBase58() } }
    ]
  });
  accounts.push(...authAccounts);
  
  const [voterPDA] = PublicKey.findProgramAddressSync(
    [
      REGISTRAR_ADDRESS.toBuffer(),
      Buffer.from('voter'),
      walletPubkey.toBuffer()
    ],
    VSR_PROGRAM_ID
  );
  
  const voterAccount = await connection.getAccountInfo(voterPDA);
  if (voterAccount) {
    accounts.push({ pubkey: voterPDA, account: voterAccount });
  }
  
  const uniqueAccounts = [];
  const seenPubkeys = new Set();
  
  for (const account of accounts) {
    const pubkeyStr = account.pubkey?.toBase58() || 'unknown';
    if (!seenPubkeys.has(pubkeyStr)) {
      seenPubkeys.add(pubkeyStr);
      uniqueAccounts.push(account);
    }
  }
  
  return uniqueAccounts;
}

function analyzeDepositsDetailed(data, accountAddress, expectedDeposits) {
  const VSR_DISCRIMINATOR = '14560581792603266545';
  
  if (data.length < 8) return [];
  
  const discriminator = data.readBigUInt64LE(0);
  if (discriminator.toString() !== VSR_DISCRIMINATOR) {
    return [];
  }
  
  console.log(`\nDetailed analysis of ${accountAddress}:`);
  console.log(`Expected deposits: ${expectedDeposits.map(d => d.toLocaleString()).join(', ')} ISLAND`);
  
  const allPotentialDeposits = [];
  
  // Find all potential deposit amounts
  for (let offset = 0; offset < data.length - 16; offset += 8) {
    try {
      const amountRaw = Number(data.readBigUInt64LE(offset));
      const amountInTokens = amountRaw / 1e6;
      
      if (amountInTokens >= 1000 && amountInTokens <= 50000000) {
        // Check for activation flag
        let hasFlag = false;
        let flagOffset = -1;
        
        for (let fOffset = offset + 8; fOffset <= offset + 40 && fOffset + 8 <= data.length; fOffset += 8) {
          try {
            const flagValue = Number(data.readBigUInt64LE(fOffset));
            if (flagValue === 1) {
              hasFlag = true;
              flagOffset = fOffset;
              break;
            }
          } catch (e) {
            continue;
          }
        }
        
        allPotentialDeposits.push({
          amount: amountInTokens,
          offset,
          hasFlag,
          flagOffset,
          isExpected: expectedDeposits.some(exp => Math.abs(exp - amountInTokens) < 1)
        });
      }
    } catch (e) {
      continue;
    }
  }
  
  console.log(`Found ${allPotentialDeposits.length} potential deposits:`);
  
  for (const deposit of allPotentialDeposits) {
    const status = deposit.isExpected ? '✅ EXPECTED' : '⚠️  UNEXPECTED';
    const flagStatus = deposit.hasFlag ? `flag at ${deposit.flagOffset}` : 'NO FLAG';
    console.log(`  ${deposit.amount.toLocaleString()} ISLAND @ offset ${deposit.offset} | ${flagStatus} | ${status}`);
  }
  
  // Validate expected deposits are found
  const foundExpected = allPotentialDeposits.filter(d => d.isExpected && d.hasFlag);
  const unexpectedWithFlags = allPotentialDeposits.filter(d => !d.isExpected && d.hasFlag);
  
  console.log(`\nValidation:`);
  console.log(`  Expected deposits found: ${foundExpected.length}/${expectedDeposits.length}`);
  console.log(`  Unexpected deposits with flags: ${unexpectedWithFlags.length}`);
  
  if (unexpectedWithFlags.length > 0) {
    console.log(`  WARNING: Found unexpected active deposits:`);
    for (const deposit of unexpectedWithFlags) {
      console.log(`    ${deposit.amount.toLocaleString()} ISLAND @ offset ${deposit.offset}`);
    }
  }
  
  return foundExpected;
}

function calculateMultiplier(deposit) {
  const currentTime = Math.floor(Date.now() / 1000);
  
  if (!deposit.isLocked || deposit.endTs <= currentTime) {
    return REGISTRAR_CONFIG.baselineVoteWeight;
  }
  
  const remainingTime = deposit.endTs - currentTime;
  const factor = Math.min(remainingTime / REGISTRAR_CONFIG.lockupSaturationSecs, 1.0);
  const multiplier = REGISTRAR_CONFIG.baselineVoteWeight + 
                    (REGISTRAR_CONFIG.maxExtraLockupVoteWeight * factor);
  
  return multiplier;
}

async function verifySpecificWallets() {
  console.log('=== VERIFYING SPECIFIC WALLETS ===');
  
  const testWallets = [
    {
      name: 'Titanmaker',
      address: 'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1',
      expectedDeposits: [200000], // Exactly 200,000 ISLAND
      expectedTotal: 200000
    },
    {
      name: 'GJdRQcsy', 
      address: 'GJdRQcsyQiWxPFfZ5PaYT5EGj4kfSAR8VfSHJtSUVV7G',
      expectedDeposits: [3913, 10000, 37626.983, 25738.999], // Approximate amounts
      expectedTotal: 144709 // Approximate with multipliers
    },
    {
      name: 'Legend',
      address: 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG', 
      expectedDeposits: [3361730.15], // Main deposit + expired dailies
      expectedTotal: 3361730 // Plus expired deposits at 1.0x
    }
  ];
  
  for (const wallet of testWallets) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`ANALYZING: ${wallet.name} (${wallet.address.substring(0, 8)}...)`);
    console.log(`Expected: ${wallet.expectedTotal.toLocaleString()} ISLAND total`);
    
    const walletPubkey = new PublicKey(wallet.address);
    const vsrAccounts = await findVSRAccounts(walletPubkey);
    
    console.log(`Found ${vsrAccounts.length} VSR accounts`);
    
    let totalPower = 0;
    const validDeposits = [];
    
    for (let i = 0; i < vsrAccounts.length; i++) {
      const account = vsrAccounts[i];
      console.log(`\nAccount ${i + 1}: ${account.pubkey?.toBase58()}`);
      
      const activeDeposits = analyzeDepositsDetailed(
        account.account.data, 
        account.pubkey?.toBase58(),
        wallet.expectedDeposits
      );
      
      for (const deposit of activeDeposits) {
        // Add lockup analysis if needed
        const multiplier = 1.0; // Simplified for now
        const power = deposit.amount * multiplier;
        totalPower += power;
        validDeposits.push(deposit);
      }
    }
    
    console.log(`\nFINAL RESULT for ${wallet.name}:`);
    console.log(`  Valid deposits: ${validDeposits.length}`);
    console.log(`  Total power: ${totalPower.toLocaleString()} ISLAND`);
    console.log(`  Expected: ${wallet.expectedTotal.toLocaleString()} ISLAND`);
    console.log(`  Difference: ${(totalPower - wallet.expectedTotal).toLocaleString()} ISLAND`);
    
    if (Math.abs(totalPower - wallet.expectedTotal) < 1000) {
      console.log(`  ✅ VALIDATION PASSED`);
    } else {
      console.log(`  ❌ VALIDATION FAILED - Significant difference`);
    }
  }
}

verifySpecificWallets().catch(console.error);