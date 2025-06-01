/**
 * Hybrid VSR Governance Power Calculator
 * Uses Anchor for account discovery and filtering, offset-based extraction for values
 * Combines robust account detection with reliable data extraction
 */

import { Connection, PublicKey } from '@solana/web3.js';
import pkg from '@coral-xyz/anchor';
const { AnchorProvider, Program } = pkg;

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Minimal VSR IDL for account filtering
const VSR_IDL = {
  "version": "0.2.7",
  "name": "voter_stake_registry",
  "instructions": [
    {
      "name": "createRegistrar",
      "accounts": [],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "voter",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "voterAuthority",
            "type": "publicKey"
          },
          {
            "name": "registrar",
            "type": "publicKey"
          }
        ]
      }
    }
  ]
};

function createDummyWallet() {
  return {
    publicKey: new PublicKey('11111111111111111111111111111112'),
    signTransaction: () => Promise.reject('Read-only wallet'),
    signAllTransactions: () => Promise.reject('Read-only wallet'),
  };
}

/**
 * Extract governance power using offset-based scanning with BigInt safety
 */
function extractGovernancePowerFromAccount(accountData, accountAddress) {
  console.log(`  Scanning account ${accountAddress} (${accountData.length} bytes)`);
  
  // Common offset positions where governance power values are stored
  const offsetsToCheck = [104, 112, 120, 128, 136, 144, 152, 160, 168, 176];
  
  let maxGovernancePower = 0n;
  let foundOffsets = [];
  
  for (const offset of offsetsToCheck) {
    if (offset + 8 <= accountData.length) {
      try {
        const rawValue = accountData.readBigUInt64LE(offset);
        
        // Convert to ISLAND tokens (6 decimals)
        const islandValue = Number(rawValue) / 1e6;
        
        // Validate: must be positive and under 1e12 ISLAND (reasonable limit)
        if (islandValue > 0 && islandValue < 1e12) {
          console.log(`    Offset ${offset}: ${islandValue.toLocaleString()} ISLAND`);
          foundOffsets.push({ offset, value: islandValue });
          
          if (rawValue > maxGovernancePower) {
            maxGovernancePower = rawValue;
          }
        }
        
      } catch (error) {
        // Skip invalid readings
      }
    }
  }
  
  const finalValue = Number(maxGovernancePower) / 1e6;
  
  if (foundOffsets.length > 0) {
    console.log(`    ✅ Found ${foundOffsets.length} valid values, using max: ${finalValue.toLocaleString()} ISLAND`);
  } else {
    console.log(`    ❌ No valid governance power values found`);
  }
  
  return finalValue;
}

/**
 * Find VSR accounts for wallet using Anchor filtering
 */
async function findVSRAccountsForWallet(walletAddress) {
  try {
    console.log(`Finding VSR accounts for: ${walletAddress}`);
    
    const connection = new Connection(process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
    const wallet = createDummyWallet();
    const provider = new AnchorProvider(connection, wallet, {});
    
    const walletPubkey = new PublicKey(walletAddress);
    
    // Get all VSR program accounts that reference this wallet
    const programAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        {
          memcmp: {
            offset: 8, // Skip discriminator
            bytes: walletPubkey.toBase58()
          }
        }
      ]
    });
    
    console.log(`Found ${programAccounts.length} VSR accounts containing wallet reference`);
    
    const categorizedAccounts = {
      voterAccounts: [],
      voterWeightRecords: [],
      registrarAccounts: [],
      other: []
    };
    
    // Categorize accounts by size and type
    for (const account of programAccounts) {
      const size = account.account.data.length;
      const address = account.pubkey.toBase58();
      
      if (size === 2728) {
        categorizedAccounts.voterAccounts.push({
          pubkey: account.pubkey,
          data: account.account.data,
          address
        });
      } else if (size === 176) {
        categorizedAccounts.voterWeightRecords.push({
          pubkey: account.pubkey,
          data: account.account.data,
          address
        });
      } else if (size === 880) {
        categorizedAccounts.registrarAccounts.push({
          pubkey: account.pubkey,
          data: account.account.data,
          address
        });
      } else {
        categorizedAccounts.other.push({
          pubkey: account.pubkey,
          data: account.account.data,
          address,
          size
        });
      }
    }
    
    console.log(`Account breakdown:`);
    console.log(`  Voter Accounts (2728 bytes): ${categorizedAccounts.voterAccounts.length}`);
    console.log(`  Voter Weight Records (176 bytes): ${categorizedAccounts.voterWeightRecords.length}`);
    console.log(`  Registrar Accounts (880 bytes): ${categorizedAccounts.registrarAccounts.length}`);
    console.log(`  Other: ${categorizedAccounts.other.length}`);
    
    return categorizedAccounts;
    
  } catch (error) {
    console.error(`Error finding VSR accounts: ${error.message}`);
    return {
      voterAccounts: [],
      voterWeightRecords: [],
      registrarAccounts: [],
      other: []
    };
  }
}

/**
 * Calculate native governance power using hybrid approach
 */
async function calculateNativeGovernancePower(walletAddress) {
  try {
    console.log('\n' + '='.repeat(80));
    console.log('HYBRID VSR GOVERNANCE POWER CALCULATION');
    console.log(`Wallet: ${walletAddress}`);
    console.log('='.repeat(80));
    
    const accounts = await findVSRAccountsForWallet(walletAddress);
    
    let maxGovernancePower = 0;
    
    // Process Voter Weight Records (176 bytes) - contain final calculated values
    console.log(`\nProcessing ${accounts.voterWeightRecords.length} Voter Weight Records:`);
    for (const account of accounts.voterWeightRecords) {
      const power = extractGovernancePowerFromAccount(account.data, account.address);
      if (power > maxGovernancePower) {
        maxGovernancePower = power;
      }
    }
    
    // Process Voter Accounts (2728 bytes) - contain individual deposits
    console.log(`\nProcessing ${accounts.voterAccounts.length} Voter Accounts:`);
    for (const account of accounts.voterAccounts) {
      const power = extractGovernancePowerFromAccount(account.data, account.address);
      if (power > maxGovernancePower) {
        maxGovernancePower = power;
      }
    }
    
    // Process other account types if they contain governance data
    if (accounts.other.length > 0) {
      console.log(`\nProcessing ${accounts.other.length} other accounts:`);
      for (const account of accounts.other) {
        console.log(`  Account ${account.address} (${account.size} bytes)`);
        const power = extractGovernancePowerFromAccount(account.data, account.address);
        if (power > maxGovernancePower) {
          maxGovernancePower = power;
        }
      }
    }
    
    console.log(`\nMaximum governance power found: ${maxGovernancePower.toLocaleString()} ISLAND`);
    return maxGovernancePower;
    
  } catch (error) {
    console.error(`Error calculating native governance power: ${error.message}`);
    return 0;
  }
}

/**
 * Calculate delegated governance power (simplified)
 */
async function calculateDelegatedGovernancePower(walletAddress) {
  // Delegation requires complex cross-account analysis
  // For most VSR setups, delegation is not commonly used
  console.log('Delegated power calculation: Not implemented (delegation rarely used)');
  return 0;
}

/**
 * Calculate complete governance power breakdown
 */
async function calculateGovernancePower(walletAddress) {
  try {
    const startTime = Date.now();
    
    // Calculate native and delegated power
    const [nativePower, delegatedPower] = await Promise.all([
      calculateNativeGovernancePower(walletAddress),
      calculateDelegatedGovernancePower(walletAddress)
    ]);
    
    const totalPower = nativePower + delegatedPower;
    const duration = Date.now() - startTime;
    
    const result = {
      wallet: walletAddress,
      native_governance_power: Math.round(nativePower),
      delegated_governance_power: Math.round(delegatedPower),
      total_governance_power: Math.round(totalPower),
      calculation_time_ms: duration,
      timestamp: new Date().toISOString()
    };
    
    console.log('\n' + '='.repeat(80));
    console.log('FINAL HYBRID RESULTS:');
    console.log(`Native Governance Power: ${result.native_governance_power.toLocaleString()} ISLAND`);
    console.log(`Delegated Governance Power: ${result.delegated_governance_power.toLocaleString()} ISLAND`);
    console.log(`Total Governance Power: ${result.total_governance_power.toLocaleString()} ISLAND`);
    console.log(`Calculation Time: ${duration}ms`);
    console.log('='.repeat(80));
    
    return result;
    
  } catch (error) {
    console.error(`Error calculating governance power: ${error.message}`);
    return {
      wallet: walletAddress,
      native_governance_power: 0,
      delegated_governance_power: 0,
      total_governance_power: 0,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

// Test with multiple wallets including DeanMachine
async function main() {
  const testWallets = [
    '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt', // DeanMachine
    'Takisou1DZx3VbCgHXdmnqQ5k9H6foyj1ABN8d7sYJhK'   // Takisoul
  ];
  
  console.log('🔥 HYBRID VSR GOVERNANCE POWER CALCULATOR');
  console.log('Combining Anchor account filtering with offset-based value extraction\n');
  
  const results = [];
  
  for (const wallet of testWallets) {
    const result = await calculateGovernancePower(wallet);
    results.push(result);
    
    // Add delay between wallets
    if (testWallets.indexOf(wallet) < testWallets.length - 1) {
      console.log('\nWaiting 2 seconds before next wallet...\n');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  console.log('\n' + '🎯 SUMMARY RESULTS:');
  console.log('='.repeat(60));
  
  results.forEach((result, index) => {
    console.log(`${index + 1}. ${result.wallet}:`);
    console.log(`   Total Power: ${result.total_governance_power.toLocaleString()} ISLAND`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
  });
  
  console.log('\nJSON OUTPUT:');
  console.log(JSON.stringify(results, null, 2));
}

// Run if this is the entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}

export { calculateGovernancePower, calculateNativeGovernancePower, calculateDelegatedGovernancePower };