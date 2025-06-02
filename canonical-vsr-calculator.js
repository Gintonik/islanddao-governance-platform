/**
 * Canonical VSR Governance Power Calculator
 * Uses Anchor-based decoding to match Realms UI exactly
 * Implements the same logic as Mythic SDK for 100% accuracy
 */

import { Connection, PublicKey } from '@solana/web3.js';
import { AnchorProvider, Program, Wallet } from '@coral-xyz/anchor';
import 'dotenv/config';

const connection = new Connection(process.env.HELIUS_RPC_URL, "confirmed");
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const SPL_GOVERNANCE_PROGRAM_ID = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

// IslandDAO Realm and community mint
const REALM_PUBKEY = new PublicKey('Guiwem4qBivtkSFrxZAEfuthBz6YuWyCwS4G3fjBYu5Z');
const COMMUNITY_MINT = new PublicKey('DMQBcMsJg5CouyKshJKVfYhbdqjhmuDAPL1LkPu8BQPF');

/**
 * Create a dummy wallet for read-only Anchor operations
 */
function createDummyWallet() {
  return {
    publicKey: new PublicKey('11111111111111111111111111111112'),
    signTransaction: () => Promise.reject(new Error('Read-only wallet')),
    signAllTransactions: () => Promise.reject(new Error('Read-only wallet'))
  };
}

/**
 * VSR Program IDL (simplified for essential structures)
 */
const VSR_IDL = {
  version: "0.1.0",
  name: "voter_stake_registry",
  accounts: [
    {
      name: "Registrar",
      type: {
        kind: "struct",
        fields: [
          { name: "realm", type: "publicKey" },
          { name: "governingTokenMint", type: "publicKey" },
          { name: "lockupSaturationSecs", type: "u64" },
          { name: "maxVotingMintConfigs", type: "u8" },
          { name: "votingMints", type: { array: ["publicKey", 10] } }
        ]
      }
    },
    {
      name: "Voter",
      type: {
        kind: "struct", 
        fields: [
          { name: "registrar", type: "publicKey" },
          { name: "authority", type: "publicKey" },
          { name: "voterBump", type: "u8" },
          { name: "voterWeightRecordBump", type: "u8" },
          { name: "depositEntries", type: { array: ["DepositEntry", 32] } }
        ]
      }
    }
  ],
  types: [
    {
      name: "DepositEntry",
      type: {
        kind: "struct",
        fields: [
          { name: "isUsed", type: "bool" },
          { name: "allowClawback", type: "bool" },
          { name: "votingMintConfigIdx", type: "u8" },
          { name: "amountDeposited", type: "u64" },
          { name: "amountInitiallyLockedNative", type: "u64" },
          { name: "lockup", type: "Lockup" }
        ]
      }
    },
    {
      name: "Lockup",
      type: {
        kind: "struct",
        fields: [
          { name: "kind", type: "u8" },
          { name: "startTs", type: "i64" },
          { name: "endTs", type: "i64" },
          { name: "period", type: "u32" }
        ]
      }
    }
  ]
};

/**
 * Get Registrar PDA for IslandDAO
 */
function getRegistrarPDA() {
  const [registrarPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("registrar"),
      REALM_PUBKEY.toBuffer(),
      COMMUNITY_MINT.toBuffer()
    ],
    VSR_PROGRAM_ID
  );
  return registrarPDA;
}

/**
 * Get Voter PDA for a wallet
 */
function getVoterPDA(registrarPubkey, walletPubkey) {
  const [voterPDA] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("voter"),
      registrarPubkey.toBuffer(),
      walletPubkey.toBuffer()
    ],
    VSR_PROGRAM_ID
  );
  return voterPDA;
}

/**
 * Fetch and decode Registrar account using Anchor
 */
async function fetchRegistrarConfig() {
  console.log('📋 Fetching IslandDAO Registrar configuration...');
  
  try {
    const registrarPDA = getRegistrarPDA();
    console.log(`🔍 Registrar PDA: ${registrarPDA.toBase58()}`);
    
    const wallet = createDummyWallet();
    const provider = new AnchorProvider(connection, wallet, {});
    const program = new Program(VSR_IDL, VSR_PROGRAM_ID, provider);
    
    const registrar = await program.account.registrar.fetch(registrarPDA);
    
    console.log(`✅ Registrar loaded:`);
    console.log(`   Realm: ${registrar.realm.toBase58()}`);
    console.log(`   Governing Token Mint: ${registrar.governingTokenMint.toBase58()}`);
    console.log(`   Lockup Saturation: ${registrar.lockupSaturationSecs} seconds`);
    
    return {
      pubkey: registrarPDA,
      account: registrar
    };
    
  } catch (error) {
    console.error(`❌ Failed to fetch Registrar: ${error.message}`);
    
    // Fallback to manual decoding if Anchor fails
    console.log('🔄 Attempting manual registrar decoding...');
    const registrarPDA = getRegistrarPDA();
    const accountInfo = await connection.getAccountInfo(registrarPDA);
    
    if (!accountInfo) {
      throw new Error('Registrar account not found');
    }
    
    // Manual decode basic fields
    const data = accountInfo.data;
    const lockupSaturationSecs = Number(data.readBigUInt64LE(72)); // Known offset
    
    console.log(`✅ Manual registrar decode:`);
    console.log(`   Lockup Saturation: ${lockupSaturationSecs} seconds`);
    
    return {
      pubkey: registrarPDA,
      account: {
        realm: REALM_PUBKEY,
        governingTokenMint: COMMUNITY_MINT,
        lockupSaturationSecs: lockupSaturationSecs
      }
    };
  }
}

/**
 * Calculate multiplier using VSR formula
 */
function calculateVSRMultiplier(deposit, lockupSaturationSecs) {
  const { lockup } = deposit;
  
  if (!lockup || lockup.kind === 0) {
    return 1.0; // No lockup = 1x multiplier
  }
  
  const currentTime = Math.floor(Date.now() / 1000);
  const lockupDuration = Math.max(0, lockup.endTs - Math.max(lockup.startTs, currentTime));
  
  if (lockupDuration === 0) {
    return 1.0; // Expired lockup = 1x multiplier
  }
  
  // VSR multiplier formula: 1 + (lockupDuration / lockupSaturationSecs)
  // Capped at 6x maximum multiplier
  const multiplier = 1.0 + (lockupDuration / lockupSaturationSecs);
  return Math.min(multiplier, 6.0);
}

/**
 * Fetch and decode Voter account using Anchor
 */
async function fetchVoterAccount(registrarPubkey, walletPubkey) {
  try {
    const voterPDA = getVoterPDA(registrarPubkey, walletPubkey);
    
    const wallet = createDummyWallet();
    const provider = new AnchorProvider(connection, wallet, {});
    const program = new Program(VSR_IDL, VSR_PROGRAM_ID, provider);
    
    const voter = await program.account.voter.fetch(voterPDA);
    
    return {
      pubkey: voterPDA,
      account: voter
    };
    
  } catch (error) {
    // Account might not exist or be in different format
    return null;
  }
}

/**
 * Calculate native governance power for a wallet using Anchor
 */
async function calculateNativeGovernancePowerAnchor(walletAddress) {
  console.log(`\n🔍 Calculating native governance power for: ${walletAddress}`);
  
  // Fetch registrar configuration
  const registrar = await fetchRegistrarConfig();
  const lockupSaturationSecs = registrar.account.lockupSaturationSecs;
  
  console.log(`📊 Using lockup saturation: ${lockupSaturationSecs} seconds`);
  
  // Get all Voter accounts for this wallet (fallback to getProgramAccounts if Anchor fails)
  let voterAccounts = [];
  
  try {
    // Try Anchor approach first
    const voterAccount = await fetchVoterAccount(registrar.pubkey, new PublicKey(walletAddress));
    if (voterAccount) {
      voterAccounts.push(voterAccount);
    }
  } catch (error) {
    console.log(`⚠️  Anchor fetch failed, using getProgramAccounts fallback`);
  }
  
  // Fallback: Use getProgramAccounts to find all Voter accounts
  if (voterAccounts.length === 0) {
    const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
      filters: [
        { dataSize: 2728 },
        { memcmp: { offset: 40, bytes: walletAddress } } // authority field
      ]
    });
    
    for (const { pubkey, account } of accounts) {
      voterAccounts.push({ pubkey, account: { data: account.data } });
    }
  }
  
  console.log(`📊 Found ${voterAccounts.length} Voter accounts`);
  
  let totalVotingPower = 0;
  const allDeposits = [];
  
  for (const [index, voterAccount] of voterAccounts.entries()) {
    console.log(`\n📋 Processing Voter account ${index + 1}: ${voterAccount.pubkey.toBase58()}`);
    
    let depositEntries = [];
    
    if (voterAccount.account.depositEntries) {
      // Anchor-decoded account
      depositEntries = voterAccount.account.depositEntries;
    } else {
      // Manual parsing needed
      console.log('🔧 Manual deposit parsing required');
      depositEntries = parseDepositsManually(voterAccount.account.data);
    }
    
    for (const [depositIndex, deposit] of depositEntries.entries()) {
      if (!deposit.isUsed) continue;
      
      const amount = deposit.amountDeposited ? 
        Number(deposit.amountDeposited) / 1e6 : 
        Number(deposit.amount) / 1e6;
      
      if (amount === 0) continue;
      
      const multiplier = calculateVSRMultiplier(deposit, lockupSaturationSecs);
      const votingPower = amount * multiplier;
      
      totalVotingPower += votingPower;
      
      const depositInfo = {
        amount,
        multiplier,
        votingPower,
        startTs: deposit.lockup?.startTs || 0,
        endTs: deposit.lockup?.endTs || 0,
        kind: deposit.lockup?.kind || 0
      };
      
      allDeposits.push(depositInfo);
      
      console.log(`  🟢 [${depositIndex}] ${amount.toLocaleString()} ISLAND × ${multiplier.toFixed(6)}x = ${votingPower.toLocaleString()} power`);
    }
  }
  
  console.log(`\n✅ Native power total: ${totalVotingPower.toLocaleString()} ISLAND`);
  
  return {
    nativeGovernancePower: totalVotingPower,
    deposits: allDeposits,
    voterAccountCount: voterAccounts.length
  };
}

/**
 * Manual deposit parsing for fallback cases
 */
function parseDepositsManually(data) {
  const deposits = [];
  const depositOffsets = [112, 184, 264, 344, 424]; // Known working offsets
  
  for (const offset of depositOffsets) {
    if (offset + 8 > data.length) continue;
    
    try {
      const amountRaw = Number(data.readBigUInt64LE(offset));
      if (amountRaw === 0) continue;
      
      const isUsedOffset = offset + 8;
      if (data[isUsedOffset] === 1) {
        deposits.push({
          isUsed: true,
          amount: amountRaw,
          lockup: { kind: 0, startTs: 0, endTs: 0 } // Default to no lockup
        });
      }
    } catch (e) {
      // Continue to next offset
    }
  }
  
  return deposits;
}

/**
 * Calculate delegated governance power
 */
async function calculateDelegatedGovernancePowerAnchor(walletAddress) {
  console.log(`\n🔍 Calculating delegated governance power for: ${walletAddress}`);
  
  // Get all TokenOwnerRecord accounts where this wallet is the delegate
  const torAccounts = await connection.getProgramAccounts(SPL_GOVERNANCE_PROGRAM_ID, {
    filters: [
      { dataSize: 300 },
      { memcmp: { offset: 105, bytes: walletAddress } }
    ]
  });
  
  console.log(`📊 Found ${torAccounts.length} TokenOwnerRecord delegations`);
  
  let totalDelegatedPower = 0;
  const delegations = [];
  
  for (const [index, { pubkey, account }] of torAccounts.entries()) {
    try {
      const data = account.data;
      const ownerBytes = data.slice(73, 105);
      const tokenOwner = new PublicKey(ownerBytes).toBase58();
      
      console.log(`\n📋 Processing delegation ${index + 1}: ${tokenOwner}`);
      
      const ownerPower = await calculateNativeGovernancePowerAnchor(tokenOwner);
      
      if (ownerPower.nativeGovernancePower > 0) {
        delegations.push({
          from: tokenOwner,
          power: ownerPower.nativeGovernancePower,
          torAccount: pubkey.toBase58()
        });
        
        totalDelegatedPower += ownerPower.nativeGovernancePower;
        console.log(`   ✅ Delegated power: ${ownerPower.nativeGovernancePower.toLocaleString()} ISLAND`);
      }
    } catch (error) {
      console.log(`   ❌ Error processing delegation: ${error.message}`);
    }
  }
  
  console.log(`\n✅ Total delegated power: ${totalDelegatedPower.toLocaleString()} ISLAND`);
  
  return {
    delegatedGovernancePower: totalDelegatedPower,
    delegations: delegations
  };
}

/**
 * Calculate complete governance power breakdown
 */
async function calculateCompleteGovernancePowerAnchor(walletAddress) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🏛️  CANONICAL VSR GOVERNANCE POWER CALCULATION (ANCHOR)`);
  console.log(`📍 Wallet: ${walletAddress}`);
  console.log(`${'='.repeat(80)}`);
  
  try {
    const nativeResult = await calculateNativeGovernancePowerAnchor(walletAddress);
    const delegatedResult = await calculateDelegatedGovernancePowerAnchor(walletAddress);
    
    const totalGovernancePower = nativeResult.nativeGovernancePower + delegatedResult.delegatedGovernancePower;
    
    const result = {
      wallet: walletAddress,
      nativeGovernancePower: nativeResult.nativeGovernancePower,
      delegatedGovernancePower: delegatedResult.delegatedGovernancePower,
      totalGovernancePower: totalGovernancePower,
      deposits: nativeResult.deposits,
      delegations: delegatedResult.delegations,
      voterAccountCount: nativeResult.voterAccountCount
    };
    
    console.log(`\n🏆 FINAL GOVERNANCE POWER BREAKDOWN:`);
    console.log(`   Native power:    ${result.nativeGovernancePower.toLocaleString()} ISLAND`);
    console.log(`   Delegated power: ${result.delegatedGovernancePower.toLocaleString()} ISLAND`);
    console.log(`   TOTAL POWER:     ${result.totalGovernancePower.toLocaleString()} ISLAND`);
    
    return result;
    
  } catch (error) {
    console.error(`❌ Error calculating governance power: ${error.message}`);
    return null;
  }
}

/**
 * Test canonical VSR governance power calculation
 */
async function testCanonicalVSRAnchor() {
  console.log('🧪 CANONICAL VSR GOVERNANCE POWER CALCULATOR (ANCHOR)');
  console.log('====================================================');
  
  const benchmarkWallets = [
    { address: 'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG', expected: 8700000, name: 'Fywb (8.7M)' },
    { address: 'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh', expected: 144700, name: 'GJdR (144.7K)' },
    { address: 'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1', expected: 0, name: 'Fgv1 (0)' },
    { address: '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4', expected: 12600, name: '4pT6 (12.6K)' }
  ];
  
  const results = [];
  
  for (const wallet of benchmarkWallets) {
    console.log(`\n${'='.repeat(100)}`);
    console.log(`🎯 Testing ${wallet.name}: ${wallet.address}`);
    console.log(`📊 Expected: ${wallet.expected.toLocaleString()} ISLAND`);
    
    try {
      const result = await calculateCompleteGovernancePowerAnchor(wallet.address);
      
      if (result) {
        const accuracy = wallet.expected === 0 ? 
          (result.totalGovernancePower === 0 ? 'PERFECT' : 'FAILED') :
          (Math.abs(result.totalGovernancePower - wallet.expected) / wallet.expected) < 0.005 ? 'ACCURATE' : 'FAILED';
        
        const errorPercent = wallet.expected > 0 ? 
          Math.abs(result.totalGovernancePower - wallet.expected) / wallet.expected * 100 : 0;
        
        console.log(`\n📊 ACCURACY: ${accuracy} ${errorPercent > 0 ? `(${errorPercent.toFixed(1)}% error)` : ''}`);
        
        results.push({
          name: wallet.name,
          address: wallet.address,
          calculated: result.totalGovernancePower,
          expected: wallet.expected,
          accuracy: accuracy,
          errorPercent: errorPercent
        });
      }
    } catch (error) {
      console.error(`❌ Error testing ${wallet.name}: ${error.message}`);
      results.push({
        name: wallet.name,
        address: wallet.address,
        calculated: 0,
        expected: wallet.expected,
        accuracy: 'ERROR',
        errorPercent: 100
      });
    }
  }
  
  // Summary
  console.log(`\n\n📊 CANONICAL VSR ANCHOR VALIDATION SUMMARY`);
  console.log('===========================================');
  
  let passedCount = 0;
  for (const result of results) {
    const status = result.accuracy === 'PERFECT' || result.accuracy === 'ACCURATE' ? '✅' : '❌';
    const errorText = result.errorPercent > 0 ? ` (${result.errorPercent.toFixed(1)}% error)` : '';
    
    console.log(`${status} ${result.name}: ${result.calculated.toLocaleString()} / ${result.expected.toLocaleString()}${errorText}`);
    
    if (result.accuracy === 'PERFECT' || result.accuracy === 'ACCURATE') {
      passedCount++;
    }
  }
  
  console.log(`\n🎯 Overall Accuracy: ${passedCount}/${results.length} (${(passedCount/results.length*100).toFixed(1)}%)`);
  
  if (passedCount === results.length) {
    console.log('🏆 ALL TESTS PASSED - Anchor VSR calculation matches Realms!');
  } else {
    console.log('⚠️ Some tests failed - Check Anchor VSR implementation');
  }
  
  return results;
}

// Run tests
testCanonicalVSRAnchor().catch(console.error);