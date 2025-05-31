/**
 * Delegated Governance Power Calculator
 * Finds governance power delegated TO each citizen from other wallets
 * Uses SPL Governance Token Owner Records to identify delegation relationships
 */

const { Connection, PublicKey } = require('@solana/web3.js');
const { Pool } = require('pg');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const SPL_GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');
const REGISTRAR_ADDRESS = new PublicKey('5ZnjJjALX8xs7zuM6t6m7XVkPV3fY3NqxwHvDLhwpShM');
const ISLAND_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');

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

function parseVSRDepositsForDelegation(data, accountAddress) {
  const VSR_DISCRIMINATOR = '14560581792603266545';
  
  if (data.length < 8) return [];
  
  const discriminator = data.readBigUInt64LE(0);
  if (discriminator.toString() !== VSR_DISCRIMINATOR) {
    return [];
  }
  
  const deposits = [];
  const processedAmounts = new Set();
  
  for (let offset = 0; offset < data.length - 16; offset += 8) {
    try {
      const amountRaw = Number(data.readBigUInt64LE(offset));
      const amountInTokens = amountRaw / 1e6;
      
      if (amountInTokens < 1000 || amountInTokens > 50000000) {
        continue;
      }
      
      if (amountInTokens >= 1700000 && amountInTokens <= 1750000) {
        continue;
      }
      
      if (amountInTokens >= 1700 && amountInTokens <= 1800) {
        continue;
      }
      
      const roundedAmount = Math.round(amountInTokens);
      if (processedAmounts.has(roundedAmount)) {
        continue;
      }
      
      let hasValidFlag = false;
      let flagOffset = -1;
      
      const flagDistances = [8, 16, 24, 32, 40];
      for (const distance of flagDistances) {
        const checkOffset = offset + distance;
        if (checkOffset + 8 <= data.length) {
          try {
            const flagValue = Number(data.readBigUInt64LE(checkOffset));
            if (flagValue === 1) {
              let flagConflict = false;
              for (let conflictOffset = checkOffset - 40; conflictOffset <= checkOffset + 40; conflictOffset += 8) {
                if (conflictOffset !== offset && conflictOffset >= 0 && conflictOffset + 8 <= data.length) {
                  try {
                    const conflictAmount = Number(data.readBigUInt64LE(conflictOffset)) / 1e6;
                    if (conflictAmount >= 1000 && conflictAmount <= 50000000 && 
                        !(conflictAmount >= 1700000 && conflictAmount <= 1750000)) {
                      const conflictFlagOffset = conflictOffset + distance;
                      if (conflictFlagOffset === checkOffset) {
                        flagConflict = true;
                        break;
                      }
                    }
                  } catch (e) {
                    continue;
                  }
                }
              }
              
              if (!flagConflict) {
                hasValidFlag = true;
                flagOffset = checkOffset;
                break;
              }
            }
          } catch (e) {
            continue;
          }
        }
      }
      
      if (!hasValidFlag) {
        continue;
      }
      
      let startTs = 0;
      let endTs = 0;
      let isLocked = false;
      let lockupType = 'none';
      
      for (let searchOffset = Math.max(0, offset - 64); 
           searchOffset <= Math.min(data.length - 16, offset + 64); 
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
              lockupType = 'cliff';
            } else if (duration > 30 * 24 * 3600) {
              lockupType = 'constant';
            } else if (duration > 7 * 24 * 3600) {
              lockupType = 'monthly';
            } else {
              lockupType = 'daily';
            }
            break;
          }
        } catch (e) {
          continue;
        }
      }
      
      processedAmounts.add(roundedAmount);
      
      deposits.push({
        amount: amountInTokens,
        startTs,
        endTs,
        isLocked,
        lockupType,
        offset,
        flagOffset,
        accountAddress
      });
      
    } catch (e) {
      continue;
    }
  }
  
  return deposits;
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

async function getNativeGovernancePowerForWallet(walletAddress) {
  try {
    const walletPubkey = new PublicKey(walletAddress);
    const vsrAccounts = await findVSRAccounts(walletPubkey);
    
    if (vsrAccounts.length === 0) {
      return 0;
    }
    
    let totalPower = 0;
    
    for (const account of vsrAccounts) {
      const deposits = parseVSRDepositsForDelegation(account.account.data, account.pubkey?.toBase58());
      
      for (const deposit of deposits) {
        const multiplier = calculateMultiplier(deposit);
        const power = deposit.amount * multiplier;
        totalPower += power;
      }
    }
    
    return totalPower;
    
  } catch (error) {
    return 0;
  }
}

async function findDelegationRelationships(targetWalletAddress) {
  try {
    const targetWalletPubkey = new PublicKey(targetWalletAddress);
    
    // Find Token Owner Records where governingTokenOwner (delegate) equals target wallet
    const delegationAccounts = await connection.getProgramAccounts(SPL_GOVERNANCE_PROGRAM_ID, {
      filters: [
        { dataSize: 300 }, // TokenOwnerRecord size
        { memcmp: { offset: 1 + 32 + 32, bytes: targetWalletPubkey.toBase58() } } // governingTokenOwner field
      ]
    });
    
    const delegations = [];
    
    for (const account of delegationAccounts) {
      try {
        const data = account.account.data;
        
        // Parse TokenOwnerRecord structure
        // 0: account_type (1 byte)
        // 1-33: realm (32 bytes)
        // 33-65: governing_token_mint (32 bytes)
        // 65-97: governing_token_owner (32 bytes) - the delegate
        // 97-129: governing_token_deposit_amount (32 bytes)
        // 129-161: unrelinquished_votes_count (32 bytes)
        // 161-193: total_votes_count (32 bytes)
        // 193-225: outstanding_proposal_count (32 bytes)
        // 225-257: reserved (32 bytes)
        // 257-289: governance_delegate (32 bytes) - the original owner who delegated
        
        const realmBytes = data.subarray(1, 33);
        const governingTokenMintBytes = data.subarray(33, 65);
        const governingTokenOwnerBytes = data.subarray(65, 97);
        const governanceDelegateBytes = data.subarray(257, 289);
        
        const realm = new PublicKey(realmBytes);
        const governingTokenMint = new PublicKey(governingTokenMintBytes);
        const governingTokenOwner = new PublicKey(governingTokenOwnerBytes);
        const governanceDelegate = new PublicKey(governanceDelegateBytes);
        
        // Check if this is an ISLAND token delegation
        if (governingTokenMint.equals(ISLAND_MINT)) {
          // The governance delegate is the original owner who delegated to the target
          if (!governanceDelegate.equals(PublicKey.default)) {
            delegations.push({
              delegatorWallet: governanceDelegate.toBase58(),
              delegateWallet: governingTokenOwner.toBase58(),
              realm: realm.toBase58(),
              tokenOwnerRecord: account.pubkey.toBase58()
            });
          }
        }
        
      } catch (parseError) {
        continue;
      }
    }
    
    return delegations;
    
  } catch (error) {
    console.error(`Error finding delegations for ${targetWalletAddress}: ${error.message}`);
    return [];
  }
}

async function calculateDelegatedGovernancePower(targetWalletAddress) {
  console.log(`\nCalculating delegated power for ${targetWalletAddress.substring(0, 8)}...`);
  
  const delegations = await findDelegationRelationships(targetWalletAddress);
  
  if (delegations.length === 0) {
    console.log('  No delegations found');
    return { totalDelegatedPower: 0, delegations: [] };
  }
  
  console.log(`  Found ${delegations.length} delegation relationships`);
  
  let totalDelegatedPower = 0;
  const delegationDetails = [];
  
  for (const delegation of delegations) {
    const delegatorPower = await getNativeGovernancePowerForWallet(delegation.delegatorWallet);
    
    if (delegatorPower > 0) {
      console.log(`    ${delegation.delegatorWallet.substring(0, 8)}... delegated ${delegatorPower.toLocaleString()} ISLAND`);
      
      delegationDetails.push({
        delegatorWallet: delegation.delegatorWallet,
        delegatedPower: delegatorPower,
        tokenOwnerRecord: delegation.tokenOwnerRecord
      });
      
      totalDelegatedPower += delegatorPower;
    }
  }
  
  console.log(`  Total delegated power: ${totalDelegatedPower.toLocaleString()} ISLAND`);
  
  return { totalDelegatedPower, delegations: delegationDetails };
}

async function processAllCitizensDelegation() {
  console.log('=== Delegated Governance Power Calculator ===');
  console.log('Finding governance power delegated TO each citizen');
  console.log('');
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  let citizens;
  try {
    const result = await pool.query('SELECT wallet, nickname FROM citizens ORDER BY nickname');
    citizens = result.rows;
  } finally {
    await pool.end();
  }
  
  console.log(`Processing ${citizens.length} citizens...\n`);
  
  const results = [];
  
  for (let i = 0; i < citizens.length; i++) {
    const citizen = citizens[i];
    const citizenName = citizen.nickname || 'Anonymous';
    
    console.log(`[${i + 1}/${citizens.length}] ${citizenName} (${citizen.wallet.substring(0, 8)}...):`);
    
    const { totalDelegatedPower, delegations } = await calculateDelegatedGovernancePower(citizen.wallet);
    
    results.push({
      wallet: citizen.wallet,
      nickname: citizenName,
      delegatedPower: Math.round(totalDelegatedPower * 1000000) / 1000000,
      delegationCount: delegations.length
    });
  }
  
  // Update database
  const updatePool = new Pool({
    connectionString: process.env.DATABASE_URL
  });
  
  try {
    for (const result of results) {
      await updatePool.query(`
        UPDATE citizens 
        SET delegated_governance_power = $1
        WHERE wallet = $2
      `, [result.delegatedPower, result.wallet]);
    }
    
    console.log(`\n✅ Updated ${results.length} citizens with delegated governance power`);
  } finally {
    await updatePool.end();
  }
  
  // Final summary
  const totalDelegatedPower = results.reduce((sum, r) => sum + r.delegatedPower, 0);
  const citizensWithDelegatedPower = results.filter(r => r.delegatedPower > 0);
  
  console.log('\n=== FINAL RESULTS ===');
  console.log(`Citizens processed: ${citizens.length}`);
  console.log(`Citizens with delegated power: ${citizensWithDelegatedPower.length}`);
  console.log(`Total delegated power: ${totalDelegatedPower.toLocaleString()} ISLAND`);
  
  // Top delegated power recipients
  results.sort((a, b) => b.delegatedPower - a.delegatedPower);
  console.log('\n=== TOP DELEGATED POWER RECIPIENTS ===');
  results.slice(0, 10).forEach((citizen, index) => {
    if (citizen.delegatedPower > 0) {
      console.log(`${index + 1}. ${citizen.nickname}: ${citizen.delegatedPower.toLocaleString()} ISLAND (${citizen.delegationCount} delegations)`);
    }
  });
  
  console.log('\n✅ Delegated governance power calculation completed');
  
  return results;
}

if (require.main === module) {
  processAllCitizensDelegation().catch((error) => {
    console.error('Script failed:', error.message);
    process.exit(1);
  });
}

module.exports = { 
  processAllCitizensDelegation,
  calculateDelegatedGovernancePower
};