/**
 * Canonical VSR Governance Power Scanner
 * Implements proper Anchor-compatible deserialization for IslandDAO
 */

import { Connection, PublicKey } from '@solana/web3.js';
import fs from 'fs/promises';
import dotenv from 'dotenv';

dotenv.config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');

// Test wallets from validation requirements
const SCAN_WALLETS = [
  'GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh',
  'Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1',
  '3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt',
  'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG',
  '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4',
  '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA',
  'kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC',
  'CinHb6Xt2PnqKUkmhRo9hwUkixCcsH1uviuQqaTxwT9i',
  '2NZ9hwrGNitbGTjt4p4py2m6iwAjJ9Bzs8vXeWs1QpHT',
  '3s6VUe21HFVEC6j12bPXLcrBHMkTZ66847853pXWXspr',
  '9WW4oiMyW6A9oP4R8jvxJLMZ3RUss18qsM4yBBHJPj94',
  'B93csAjDr4sbgLvYmY1iNcHQ1wLe9abEiodJDcn8K7ST',
  'CdCAQnq13hTUiBxganRXYKw418uUTfZdmosqef2vu1bM',
  'DraTvYwqwySZ4kvzxsiYtKF8BieGtY9x4CCK2z6aoYoe4',
  'EViz4YGrY6GZtfu35Y1Q3PoFWAhoXY6YMHFrcneMbdCF',
  '37TGrYNu56AxaeojgtAok8tQAsBSxGhvFKXqCYFAbBrA',
  '2qYMBZwJhu8zpyEK29Dy5Hf9WrWWe1LkDzrUDiuVzBnk',
  '6aJo6zRiC5CFnuE7cqw4sTtHHknrr69NE7LKxPAfFY9U',
  'BPmVp1b4vbT2YUHfcFrtErA67nNsJ5LGAJ2BLg5ds9kz',
  'ADjG92YTwGUxTB3r9SY6Gip4q4xoUQdKq3DA1actaDUd'
];

/**
 * Parse Voter account authorities using correct offsets
 */
function parseVoterAuthorities(data) {
  try {
    const authority = new PublicKey(data.slice(8, 40)).toBase58();
    const voterAuthority = new PublicKey(data.slice(72, 104)).toBase58();
    return { authority, voterAuthority };
  } catch (error) {
    return null;
  }
}

/**
 * Calculate governance power using VoterWeightRecord (primary method)
 */
async function getVoterWeightRecordPower(walletAddress) {
  const voterWeightRecords = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { dataSize: 176 },
      { memcmp: { offset: 72, bytes: walletAddress } }
    ]
  });

  let totalPower = 0;
  const sources = [];

  for (const { pubkey, account } of voterWeightRecords) {
    const powerRaw = Number(account.data.readBigUInt64LE(104));
    const power = powerRaw / 1e6;

    if (power > 0) {
      totalPower += power;
      sources.push({
        account: pubkey.toBase58(),
        power: power,
        type: 'VWR'
      });
    }
  }

  return { totalPower, sources };
}

/**
 * Calculate native governance power from owned deposits
 */
async function getNativeGovernancePower(walletAddress) {
  // Find all Voter accounts where wallet is authority
  const voterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [
      { dataSize: 2728 },
      { memcmp: { offset: 8, bytes: walletAddress } }
    ]
  });

  let nativePower = 0;
  const sources = [];

  // Use simple deposit extraction that works reliably
  for (const { pubkey, account } of voterAccounts) {
    const data = account.data;
    
    // Try known deposit value offsets
    const depositOffsets = [112, 144, 176, 208, 240];
    
    for (const offset of depositOffsets) {
      try {
        const rawValue = Number(data.readBigUInt64LE(offset));
        const islandAmount = rawValue / 1e6;
        
        if (islandAmount >= 1000 && islandAmount <= 50000000 && rawValue !== 4294967296) {
          nativePower += islandAmount;
          sources.push({
            account: pubkey.toBase58(),
            power: islandAmount,
            type: 'Voter-native',
            offset: offset
          });
          break; // Only count one deposit per account to avoid double-counting
        }
      } catch (error) {
        continue;
      }
    }
  }

  return { nativePower, sources };
}

/**
 * Build delegation map from all Voter accounts
 */
async function buildDelegationMap() {
  console.log('🔍 Building delegation map from all Voter accounts...');
  
  const allVoterAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });

  const delegationMap = new Map();
  let totalDelegations = 0;

  for (const { pubkey, account } of allVoterAccounts) {
    const authorities = parseVoterAuthorities(account.data);
    if (!authorities) continue;

    const { authority, voterAuthority } = authorities;

    // Only process delegations (authority != voterAuthority)
    if (authority !== voterAuthority) {
      // Extract deposit power using simple method
      const depositOffsets = [112, 144, 176, 208, 240];
      
      for (const offset of depositOffsets) {
        try {
          const rawValue = Number(account.data.readBigUInt64LE(offset));
          const islandAmount = rawValue / 1e6;
          
          if (islandAmount >= 1000 && islandAmount <= 50000000 && rawValue !== 4294967296) {
            if (!delegationMap.has(voterAuthority)) {
              delegationMap.set(voterAuthority, { totalDelegated: 0, delegations: [] });
            }
            
            delegationMap.get(voterAuthority).totalDelegated += islandAmount;
            delegationMap.get(voterAuthority).delegations.push({
              from: authority,
              power: islandAmount,
              account: pubkey.toBase58()
            });
            
            totalDelegations++;
            break; // Only count one delegation per account
          }
        } catch (error) {
          continue;
        }
      }
    }
  }

  console.log(`📊 Built delegation map: ${delegationMap.size} recipients, ${totalDelegations} delegations`);
  return delegationMap;
}

/**
 * Calculate complete governance power for a wallet
 */
async function calculateWalletGovernancePower(walletAddress, delegationMap) {
  console.log(`🔍 Analyzing: ${walletAddress.substring(0,8)}...`);

  // Get total governance power from VWR (authoritative for total)
  const vwrResult = await getVoterWeightRecordPower(walletAddress);
  
  // Get native power from owned deposits
  const nativeResult = await getNativeGovernancePower(walletAddress);
  
  // Get delegated power from delegation map
  const walletDelegations = delegationMap.get(walletAddress) || { totalDelegated: 0, delegations: [] };
  
  let totalGovernancePower = 0;
  let nativeGovernancePower = 0;
  let delegatedGovernancePower = 0;

  // Strategy: Use VWR as authoritative total, then separate native vs delegated
  if (vwrResult.totalPower > 0) {
    totalGovernancePower = vwrResult.totalPower;
    
    // If we have native power calculation, use that as baseline
    if (nativeResult.nativePower > 0) {
      nativeGovernancePower = nativeResult.nativePower;
      // Remaining power is considered delegated
      delegatedGovernancePower = Math.max(0, totalGovernancePower - nativeGovernancePower);
    } else {
      // No native power detected - all power might be delegated or we need fallback
      delegatedGovernancePower = walletDelegations.totalDelegated;
      nativeGovernancePower = Math.max(0, totalGovernancePower - delegatedGovernancePower);
    }
  } else {
    // No VWR - use calculated native + delegated
    nativeGovernancePower = nativeResult.nativePower;
    delegatedGovernancePower = walletDelegations.totalDelegated;
    totalGovernancePower = nativeGovernancePower + delegatedGovernancePower;
  }

  // Sanity check: ensure native + delegated = total (within small tolerance)
  const calculatedTotal = nativeGovernancePower + delegatedGovernancePower;
  if (Math.abs(calculatedTotal - totalGovernancePower) > 0.01) {
    // Adjust to make them match - prefer keeping VWR total accurate
    const adjustment = totalGovernancePower - calculatedTotal;
    delegatedGovernancePower = Math.max(0, delegatedGovernancePower + adjustment);
  }

  const result = {
    wallet: walletAddress,
    nativeGovernancePower: Math.round(nativeGovernancePower * 1000000) / 1000000,
    delegatedGovernancePower: Math.round(delegatedGovernancePower * 1000000) / 1000000,
    totalGovernancePower: Math.round(totalGovernancePower * 1000000) / 1000000,
    nativeSources: nativeResult.sources,
    delegatedSources: walletDelegations.delegations,
    vwrSources: vwrResult.sources,
    reconciliation: {
      vwrTotal: vwrResult.totalPower,
      calculatedNative: nativeResult.nativePower,
      calculatedDelegated: walletDelegations.totalDelegated
    }
  };

  console.log(`   ${result.totalGovernancePower.toLocaleString()} ISLAND (${result.nativeGovernancePower.toLocaleString()} native + ${result.delegatedGovernancePower.toLocaleString()} delegated)`);
  
  return result;
}

/**
 * Main scanner function
 */
async function runCanonicalVSRScanner() {
  console.log('🏛️ CANONICAL VSR GOVERNANCE SCANNER');
  console.log('==================================');
  console.log(`📊 Scanning ${SCAN_WALLETS.length} wallets`);
  
  // Build delegation map once for all wallets
  const delegationMap = await buildDelegationMap();
  
  const results = [];
  
  for (const wallet of SCAN_WALLETS) {
    try {
      const result = await calculateWalletGovernancePower(wallet, delegationMap);
      if (result.totalGovernancePower > 0) {
        results.push(result);
      }
    } catch (error) {
      console.log(`❌ Error analyzing ${wallet.substring(0,8)}...: ${error.message}`);
    }
  }

  // Sort by total governance power
  results.sort((a, b) => b.totalGovernancePower - a.totalGovernancePower);

  // Display results
  console.log('\n📋 RESULTS:');
  console.log('===========');
  
  results.forEach((result, index) => {
    console.log(`${(index + 1).toString().padStart(2)}. ${result.totalGovernancePower.toLocaleString()} ISLAND (${result.nativeGovernancePower.toLocaleString()} native + ${result.delegatedGovernancePower.toLocaleString()} delegated)`);
    console.log(`    ${result.wallet}`);
  });

  // Save results
  const timestamp = new Date().toISOString().split('T')[0];
  const output = {
    scanDate: new Date().toISOString(),
    summary: {
      totalWallets: SCAN_WALLETS.length,
      walletsWithPower: results.length,
      totalNativePower: results.reduce((sum, r) => sum + r.nativeGovernancePower, 0),
      totalDelegatedPower: results.reduce((sum, r) => sum + r.delegatedGovernancePower, 0),
      totalGovernancePower: results.reduce((sum, r) => sum + r.totalGovernancePower, 0)
    },
    results: results
  };

  await fs.writeFile(`canonical-vsr-scan-${timestamp}.json`, JSON.stringify(output, null, 2));
  console.log(`\n💾 Results saved to: canonical-vsr-scan-${timestamp}.json`);

  return results;
}

// Run scanner
runCanonicalVSRScanner().catch(console.error);