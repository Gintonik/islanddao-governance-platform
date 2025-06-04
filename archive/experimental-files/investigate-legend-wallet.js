/**
 * Investigate Legend Wallet Discrepancy
 * Detailed analysis of each deposit and multiplier calculation
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const REGISTRAR_ADDRESS = new PublicKey('5ZnjJjALX8xs7zuM6t6m7XVkPV3fY3NqxwHvDLhwpShM');
const ISLAND_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');

const connection = new Connection(HELIUS_RPC, 'confirmed');

let registrarConfig = null;

async function parseRegistrarConfig() {
  const registrarAccount = await connection.getAccountInfo(REGISTRAR_ADDRESS);
  const data = registrarAccount.data;
  
  for (let offset = 0; offset < data.length - 60; offset += 4) {
    try {
      const potentialMint = new PublicKey(data.subarray(offset, offset + 32));
      
      if (potentialMint.equals(ISLAND_MINT)) {
        const configOffset = offset + 32;
        const baselineRaw = Number(data.readBigUInt64LE(configOffset + 32));
        const maxExtraRaw = Number(data.readBigUInt64LE(configOffset + 40));  
        const saturationRaw = Number(data.readBigUInt64LE(configOffset + 48));
        
        return {
          baselineVoteWeight: baselineRaw / 1e9,
          maxExtraLockupVoteWeight: maxExtraRaw / 1e9,
          lockupSaturationSecs: saturationRaw
        };
      }
    } catch (e) {
      continue;
    }
  }
  
  throw new Error('Could not parse registrar config');
}

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

function extractDeposits(data, accountAddress) {
  const VSR_DISCRIMINATOR = '14560581792603266545';
  
  if (data.length < 8) return [];
  
  const discriminator = data.readBigUInt64LE(0);
  if (discriminator.toString() !== VSR_DISCRIMINATOR) {
    return [];
  }
  
  const deposits = [];
  const processedAmounts = new Map();
  
  console.log(`\n--- Scanning account ${accountAddress} ---`);
  console.log(`Data length: ${data.length} bytes`);
  
  for (let offset = 0; offset < data.length - 8; offset += 8) {
    try {
      const value = Number(data.readBigUInt64LE(offset));
      const amountInTokens = value / 1e6;
      
      if (amountInTokens >= 1000 && amountInTokens <= 50000000) {
        let startTs = 0;
        let endTs = 0;
        let isLocked = false;
        let lockupKind = 'none';
        
        for (let searchOffset = Math.max(0, offset - 32); 
             searchOffset <= Math.min(data.length - 16, offset + 32); 
             searchOffset += 8) {
          try {
            const ts1 = Number(data.readBigUInt64LE(searchOffset));
            const ts2 = Number(data.readBigUInt64LE(searchOffset + 8));
            
            if (ts1 >= 1700000000 && ts1 <= 1800000000 && 
                ts2 > ts1 && ts2 <= 1800000000) {
              startTs = ts1;
              endTs = ts2;
              isLocked = true;
              
              const duration = endTs - startTs;
              if (duration > 3 * 365 * 24 * 3600) {
                lockupKind = 'cliff';
              } else if (duration > 30 * 24 * 3600) {
                lockupKind = 'constant';
              } else if (duration > 7 * 24 * 3600) {
                lockupKind = 'monthly';
              } else {
                lockupKind = 'daily';
              }
              break;
            }
          } catch (e) {
            continue;
          }
        }
        
        const amountKey = Math.round(amountInTokens * 1000);
        if (!processedAmounts.has(amountKey)) {
          processedAmounts.set(amountKey, true);
          
          console.log(`Found deposit at offset ${offset}: ${amountInTokens.toLocaleString()} ISLAND (${lockupKind}, locked=${isLocked})`);
          if (isLocked) {
            console.log(`  Lockup: ${new Date(startTs * 1000).toISOString()} to ${new Date(endTs * 1000).toISOString()}`);
          }
          
          deposits.push({
            offset,
            amount: amountInTokens,
            startTs,
            endTs,
            isLocked,
            lockupKind,
            accountAddress
          });
        }
      }
    } catch (e) {
      continue;
    }
  }
  
  return deposits;
}

function calculateMultiplier(deposit) {
  const currentTime = Math.floor(Date.now() / 1000);
  
  if (!deposit.isLocked || deposit.endTs <= currentTime) {
    return registrarConfig.baselineVoteWeight;
  }
  
  const remainingTime = deposit.endTs - currentTime;
  const factor = Math.min(remainingTime / registrarConfig.lockupSaturationSecs, 1.0);
  const multiplier = registrarConfig.baselineVoteWeight + 
                    (registrarConfig.maxExtraLockupVoteWeight * factor);
  
  return multiplier;
}

async function investigateLegendWallet() {
  console.log('=== INVESTIGATING LEGEND WALLET DISCREPANCY ===');
  console.log('Wallet: Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG');
  console.log('Expected: ~3,361,730 ISLAND');
  console.log('Calculated: 3,403,935.32 ISLAND');
  console.log('Difference: 42,205.32 ISLAND (1.25%)');
  
  registrarConfig = await parseRegistrarConfig();
  console.log(`\nRegistrar Config:`);
  console.log(`  Baseline: ${registrarConfig.baselineVoteWeight}`);
  console.log(`  Max Extra: ${registrarConfig.maxExtraLockupVoteWeight}`);
  console.log(`  Saturation: ${registrarConfig.lockupSaturationSecs} seconds`);
  
  const walletPubkey = new PublicKey('Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG');
  const vsrAccounts = await findVSRAccounts(walletPubkey);
  
  console.log(`\nFound ${vsrAccounts.length} VSR accounts for Legend wallet`);
  
  let totalPower = 0;
  let allDeposits = [];
  let expiredDailyTotal = 0;
  let expiredDailyCount = 0;
  
  for (let i = 0; i < vsrAccounts.length; i++) {
    const account = vsrAccounts[i];
    console.log(`\n=== VSR Account ${i + 1}: ${account.pubkey?.toBase58()} ===`);
    
    const deposits = extractDeposits(account.account.data, account.pubkey?.toBase58());
    
    for (const deposit of deposits) {
      const multiplier = calculateMultiplier(deposit);
      const power = deposit.amount * multiplier;
      
      const currentTime = Math.floor(Date.now() / 1000);
      let status = 'unlocked';
      let isExpired = false;
      
      if (deposit.isLocked) {
        if (deposit.endTs > currentTime) {
          const remainingYears = (deposit.endTs - currentTime) / (365.25 * 24 * 3600);
          status = `${remainingYears.toFixed(2)}y remaining`;
        } else {
          status = 'expired';
          isExpired = true;
        }
      }
      
      // Track expired daily lockups specifically
      if (deposit.lockupKind === 'daily' && isExpired) {
        expiredDailyTotal += deposit.amount;
        expiredDailyCount++;
      }
      
      console.log(`\nDeposit Analysis:`);
      console.log(`  Amount: ${deposit.amount.toLocaleString()} ISLAND`);
      console.log(`  Lockup: ${deposit.lockupKind}`);
      console.log(`  Status: ${status}`);
      console.log(`  Multiplier: ${multiplier.toFixed(6)}x`);
      console.log(`  Power: ${power.toLocaleString()} ISLAND`);
      console.log(`  Account: ${deposit.accountAddress}`);
      console.log(`  Offset: ${deposit.offset}`);
      
      // Flag potential discrepancies
      if (deposit.amount === 3361730.15) {
        console.log(`  ✓ MATCHES expected main deposit`);
      } else if (deposit.lockupKind === 'daily' && isExpired) {
        console.log(`  ✓ Expected expired daily lockup`);
      } else {
        console.log(`  ⚠️  ADDITIONAL deposit not in expected list`);
      }
      
      allDeposits.push({
        amount: deposit.amount,
        lockupKind: deposit.lockupKind,
        multiplier,
        power,
        status,
        isExpired,
        accountAddress: deposit.accountAddress,
        offset: deposit.offset
      });
      
      totalPower += power;
    }
  }
  
  console.log('\n=== SUMMARY ANALYSIS ===');
  console.log(`Total deposits found: ${allDeposits.length}`);
  console.log(`Total governance power: ${totalPower.toLocaleString()} ISLAND`);
  console.log(`Expected power: 3,361,730 ISLAND`);
  console.log(`Difference: ${(totalPower - 3361730).toLocaleString()} ISLAND`);
  
  console.log(`\nExpired daily lockups: ${expiredDailyCount} deposits totaling ${expiredDailyTotal.toLocaleString()} ISLAND`);
  console.log(`Expected expired daily total: ~13,839 ISLAND`);
  
  // Identify unexpected deposits
  const mainDeposit = allDeposits.find(d => d.amount === 3361730.15);
  const expiredDailies = allDeposits.filter(d => d.lockupKind === 'daily' && d.isExpired);
  const otherDeposits = allDeposits.filter(d => d.amount !== 3361730.15 && !(d.lockupKind === 'daily' && d.isExpired));
  
  console.log('\n=== DEPOSIT BREAKDOWN ===');
  
  if (mainDeposit) {
    console.log(`\n1. Main deposit (expected):`);
    console.log(`   ${mainDeposit.amount.toLocaleString()} ISLAND = ${mainDeposit.power.toLocaleString()} power`);
  }
  
  console.log(`\n2. Expired daily lockups (expected ${expiredDailyCount}):`);
  expiredDailies.forEach((d, i) => {
    console.log(`   ${i+1}. ${d.amount.toLocaleString()} ISLAND = ${d.power.toLocaleString()} power`);
  });
  
  if (otherDeposits.length > 0) {
    console.log(`\n3. ADDITIONAL deposits (${otherDeposits.length}) - potential source of discrepancy:`);
    otherDeposits.forEach((d, i) => {
      console.log(`   ${i+1}. ${d.amount.toLocaleString()} ISLAND | ${d.lockupKind} | ${d.status} = ${d.power.toLocaleString()} power`);
      console.log(`      Account: ${d.accountAddress}, Offset: ${d.offset}`);
    });
    
    const additionalPower = otherDeposits.reduce((sum, d) => sum + d.power, 0);
    console.log(`   Total additional power: ${additionalPower.toLocaleString()} ISLAND`);
  }
  
  console.log('\n=== CONCLUSION ===');
  const expectedTotal = 3361730.15 + expiredDailyTotal;
  const actualTotal = totalPower;
  const unexpectedTotal = actualTotal - expectedTotal;
  
  console.log(`Expected total (main + expired dailies): ${expectedTotal.toLocaleString()} ISLAND`);
  console.log(`Actual total: ${actualTotal.toLocaleString()} ISLAND`);
  console.log(`Unexpected additional power: ${unexpectedTotal.toLocaleString()} ISLAND`);
  
  if (Math.abs(unexpectedTotal) > 1000) {
    console.log(`\n⚠️  SIGNIFICANT DISCREPANCY: ${unexpectedTotal.toLocaleString()} ISLAND difference`);
    console.log('This suggests additional legitimate deposits exist on-chain');
  } else {
    console.log('\n✓ Discrepancy within reasonable range for rounding/precision');
  }
}

investigateLegendWallet().catch(console.error);