/**
 * Targeted VSR Governance Power Scanner
 * Uses known VSR account PDAs to get current governance power
 */

import { Connection, PublicKey } from "@solana/web3.js";
import { config } from "dotenv";

config();

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const ISLAND_DAO_REGISTRAR = new PublicKey('Hsak8MsKZnqiXEW8wEQAGjdz1sJFjfGZjxDvXbyGxK8K');

// Target citizens with their verified data for comparison
const TARGET_CITIZENS = {
  "7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA": { name: "Takisoul", verified: 8974792 },
  "Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG": { name: "legend", verified: 2000 }, 
  "37TGrYNu56AxaeojgtAok8tQAsBSxGhvFKXqCYFAbBrA": { name: "Moxie", verified: 536529 },
  "EXRBCP2MX6hRAt4oh61k5mhL6WhmUXPemfzNssUpM4S6": { name: "Icoder", verified: 332768 }
};

/**
 * Derive voter weight record PDA
 */
function deriveVoterWeightRecord(wallet, realm, mint) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("voter-weight-record"),
      new PublicKey(realm).toBuffer(),
      new PublicKey(mint).toBuffer(),
      new PublicKey(wallet).toBuffer()
    ],
    VSR_PROGRAM_ID
  );
}

/**
 * Parse voter weight record data
 */
function parseVoterWeightRecord(data) {
  try {
    if (data.length < 72) return null;
    
    // Parse voter weight (8 bytes at offset 64)
    const voterWeight = data.readBigUInt64LE(64);
    return Number(voterWeight) / 1_000_000; // Convert from lamports
  } catch (error) {
    return null;
  }
}

/**
 * Get current governance power from blockchain
 */
async function getCurrentGovernancePower(walletAddress, nickname) {
  try {
    console.log(`\nChecking ${nickname} (${walletAddress})`);
    
    // Derive voter weight record PDA
    const [voterWeightRecord] = deriveVoterWeightRecord(
      walletAddress,
      'HT19EcD68zn8FGGQeGeTNrF7H3xNbNKgPy8rMrp1Ggde', // IslandDAO realm
      'GfmdKWR1KrttDsQkJfwtXovZw9bUBHYkPAEwB6wZqQvJ'  // ISLAND mint
    );
    
    console.log(`  Voter Weight Record PDA: ${voterWeightRecord.toString()}`);
    
    // Get account data
    const accountInfo = await connection.getAccountInfo(voterWeightRecord);
    
    if (!accountInfo) {
      console.log(`  No voter weight record found`);
      return { wallet: walletAddress, nickname, currentPower: 0, status: 'no_record' };
    }
    
    const voterWeight = parseVoterWeightRecord(accountInfo.data);
    
    if (voterWeight === null) {
      console.log(`  Failed to parse voter weight record`);
      return { wallet: walletAddress, nickname, currentPower: 0, status: 'parse_error' };
    }
    
    console.log(`  Current governance power: ${Math.floor(voterWeight).toLocaleString()} ISLAND`);
    
    return {
      wallet: walletAddress,
      nickname,
      currentPower: Math.floor(voterWeight),
      status: 'success'
    };
    
  } catch (error) {
    console.log(`  Error: ${error.message}`);
    return { wallet: walletAddress, nickname, currentPower: 0, status: 'error', error: error.message };
  }
}

/**
 * Scan all target citizens for current governance power
 */
async function scanCurrentGovernancePower() {
  console.log('Real Blockchain Native Governance Power Scanner');
  console.log('='.repeat(60));
  
  const results = [];
  
  for (const [wallet, info] of Object.entries(TARGET_CITIZENS)) {
    const result = await getCurrentGovernancePower(wallet, info.name);
    result.verifiedPower = info.verified;
    result.difference = result.currentPower - info.verified;
    results.push(result);
    
    // Small delay between requests
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n📊 COMPARISON RESULTS:');
  console.log('='.repeat(60));
  
  for (const result of results) {
    const status = result.status === 'success' ? '✅' : '❌';
    const current = result.currentPower.toLocaleString();
    const verified = result.verifiedPower.toLocaleString();
    const diff = result.difference;
    
    console.log(`${status} ${result.nickname}:`);
    console.log(`    Current:  ${current} ISLAND`);
    console.log(`    Verified: ${verified} ISLAND`);
    
    if (diff !== 0) {
      const sign = diff > 0 ? '+' : '';
      console.log(`    Difference: ${sign}${diff.toLocaleString()} ISLAND`);
    } else {
      console.log(`    Status: MATCHES`);
    }
    
    if (result.error) {
      console.log(`    Error: ${result.error}`);
    }
    console.log('');
  }
  
  return results;
}

// Run the scanner
scanCurrentGovernancePower().catch(console.error);