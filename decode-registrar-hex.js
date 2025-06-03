/**
 * Decode IslandDAO Registrar using VSR IDL
 * Fetch complete account data and extract authentic votingMintConfig parameters
 */

import { Connection, PublicKey } from '@solana/web3.js';
import * as anchor from '@coral-xyz/anchor';
import { config } from 'dotenv';
import fs from 'fs';
config();

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const REGISTRAR_ADDRESS = new PublicKey('5ZnjJjALX8xs7zuM6t6m7XVkPV3fY3NqxwHvDLhwpShM');

/**
 * Create dummy wallet for Anchor provider
 */
function createDummyWallet() {
  const keypair = anchor.web3.Keypair.generate();
  return {
    publicKey: keypair.publicKey,
    signTransaction: async () => { throw new Error('Read-only wallet'); },
    signAllTransactions: async () => { throw new Error('Read-only wallet'); }
  };
}

/**
 * Fetch and decode registrar data using VSR IDL
 */
async function decodeRegistrarHex() {
  console.log('Decoding IslandDAO Registrar using VSR IDL...');
  console.log(`Program ID: ${VSR_PROGRAM_ID.toBase58()}`);
  console.log(`Registrar Address: ${REGISTRAR_ADDRESS.toBase58()}`);
  console.log('');
  
  try {
    // Create connection and fetch account data
    const connection = new Connection(process.env.HELIUS_RPC_URL);
    const accountInfo = await connection.getAccountInfo(REGISTRAR_ADDRESS);
    
    if (!accountInfo) {
      throw new Error('Registrar account not found');
    }
    
    console.log(`✅ Fetched account data: ${accountInfo.data.length} bytes`);
    console.log(`Account owner: ${accountInfo.owner.toBase58()}`);
    
    // Verify it's owned by VSR program
    if (!accountInfo.owner.equals(VSR_PROGRAM_ID)) {
      throw new Error(`Account not owned by VSR program: ${accountInfo.owner.toBase58()}`);
    }
    
    // Load VSR IDL
    const vsrIdl = JSON.parse(fs.readFileSync('./vsr-idl.json', 'utf8'));
    console.log('✅ Loaded VSR IDL');
    
    // Create Anchor provider and program
    const wallet = createDummyWallet();
    const provider = new anchor.AnchorProvider(connection, wallet, { commitment: 'confirmed' });
    
    // Try to create program instance
    let program;
    try {
      program = new anchor.Program(vsrIdl, VSR_PROGRAM_ID, provider);
      console.log('✅ Created Anchor program instance');
    } catch (programError) {
      console.log(`Program creation failed: ${programError.message}`);
      return await manualDeserialization(accountInfo.data);
    }
    
    // Try to deserialize using different methods
    try {
      // Method 1: Direct fetch
      const registrar = await program.account.registrar.fetch(REGISTRAR_ADDRESS);
      console.log('✅ Successfully decoded registrar using Anchor fetch');
      return await displayRegistrarData(registrar);
      
    } catch (fetchError) {
      console.log(`Anchor fetch failed: ${fetchError.message}`);
      
      try {
        // Method 2: Deserialize raw data
        const coder = new anchor.BorshAccountsCoder(vsrIdl);
        const registrar = coder.decode('registrar', accountInfo.data);
        console.log('✅ Successfully decoded using BorshAccountsCoder');
        return await displayRegistrarData(registrar);
        
      } catch (coderError) {
        console.log(`BorshAccountsCoder failed: ${coderError.message}`);
        return await manualDeserialization(accountInfo.data);
      }
    }
    
  } catch (error) {
    console.error('❌ Error decoding registrar:', error.message);
    throw error;
  }
}

/**
 * Display registrar data in structured format
 */
async function displayRegistrarData(registrar) {
  console.log('\nREGISTRAR ACCOUNT DATA:');
  console.log('=======================');
  console.log(`Governance Program: ${registrar.governanceProgramId.toBase58()}`);
  console.log(`Realm: ${registrar.realm.toBase58()}`);
  console.log(`Governing Token Mint: ${registrar.governingTokenMint.toBase58()}`);
  console.log(`Voting Mint Configs: ${registrar.votingMintConfigs.length} entries`);
  
  console.log('\nVOTING MINT CONFIGURATIONS:');
  console.log('===========================');
  
  for (let i = 0; i < registrar.votingMintConfigs.length; i++) {
    const config = registrar.votingMintConfigs[i];
    
    console.log(`\nConfig ${i}:`);
    console.log(`  Mint: ${config.mint.toBase58()}`);
    console.log(`  Grants Authority: ${config.grantsAuthority.toBase58()}`);
    console.log(`  Baseline Vote Weight Scaled Factor: ${config.baselineVoteWeightScaledFactor.toString()}`);
    console.log(`  Max Extra Lockup Vote Weight Scaled Factor: ${config.maxExtraLockupVoteWeightScaledFactor.toString()}`);
    console.log(`  Lockup Saturation Seconds: ${config.lockupSaturationSecs.toString()}`);
    console.log(`  Digit Shift: ${config.digitShift}`);
    
    // Calculate scaling factors
    const baselineScaling = config.baselineVoteWeightScaledFactor.toNumber() / 1e9;
    const maxExtraScaling = config.maxExtraLockupVoteWeightScaledFactor.toNumber() / 1e9;
    const saturationYears = config.lockupSaturationSecs.toNumber() / (365.25 * 24 * 3600);
    
    console.log(`  \nCalculated Values:`);
    console.log(`    Baseline Multiplier: ${baselineScaling}x`);
    console.log(`    Max Extra Multiplier: ${maxExtraScaling}x`);
    console.log(`    Total Range: ${baselineScaling}x to ${baselineScaling + maxExtraScaling}x`);
    console.log(`    Lockup Saturation: ${saturationYears.toFixed(3)} years`);
  }
  
  return registrar;
}

/**
 * Manual deserialization fallback
 */
async function manualDeserialization(data) {
  console.log('\nMANUAL DESERIALIZATION:');
  console.log('=======================');
  
  try {
    let offset = 8; // Skip discriminator
    
    // Read governance program ID (32 bytes)
    const governanceProgramId = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    
    // Read realm (32 bytes)
    const realm = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    
    // Read governing token mint (32 bytes)
    const governingTokenMint = new PublicKey(data.slice(offset, offset + 32));
    offset += 32;
    
    console.log(`Governance Program: ${governanceProgramId.toBase58()}`);
    console.log(`Realm: ${realm.toBase58()}`);
    console.log(`Governing Token Mint: ${governingTokenMint.toBase58()}`);
    
    // Try to find voting mint config data patterns
    console.log('\nSearching for voting mint config patterns...');
    
    // Look for the IslandDAO token mint in the data
    const islandMintBytes = governingTokenMint.toBuffer();
    let mintConfigOffset = -1;
    
    for (let i = offset; i <= data.length - 32; i++) {
      if (data.slice(i, i + 32).equals(islandMintBytes)) {
        console.log(`Found ISLAND mint at offset ${i}`);
        mintConfigOffset = i;
        break;
      }
    }
    
    if (mintConfigOffset > 0) {
      console.log('\nVOTING MINT CONFIG (Manual Parse):');
      console.log('==================================');
      
      // Parse the config structure around the mint
      let configOffset = mintConfigOffset;
      
      // Mint (32 bytes)
      const mint = new PublicKey(data.slice(configOffset, configOffset + 32));
      configOffset += 32;
      
      // Grants authority (32 bytes)
      const grantsAuthority = new PublicKey(data.slice(configOffset, configOffset + 32));
      configOffset += 32;
      
      // Try to read numeric values at various offsets
      console.log(`Mint: ${mint.toBase58()}`);
      console.log(`Grants Authority: ${grantsAuthority.toBase58()}`);
      
      // Scan for the configuration values we found earlier
      console.log('\nScanning for configuration values...');
      
      for (let i = configOffset; i <= data.length - 8; i += 8) {
        try {
          const value = data.readBigUInt64LE(i);
          const numValue = Number(value);
          
          if (numValue === 3000000000) {
            console.log(`Found 3,000,000,000 at offset ${i} (likely baseline or max extra factor)`);
          }
          if (numValue === 31536000) {
            console.log(`Found 31,536,000 at offset ${i} (likely lockup saturation seconds = 1 year)`);
          }
        } catch (e) {
          continue;
        }
      }
    }
    
    return {
      governanceProgramId,
      realm,
      governingTokenMint,
      manualParse: true
    };
    
  } catch (error) {
    console.error('Manual deserialization failed:', error.message);
    throw error;
  }
}

/**
 * Validate against known values
 */
function validateResults(registrar) {
  console.log('\nVALIDATION AGAINST KNOWN VALUES:');
  console.log('================================');
  
  const expectedValues = {
    baselineVoteWeightScaledFactor: 3000000000,
    maxExtraLockupVoteWeightScaledFactor: 3000000000,
    lockupSaturationSecs: 31536000
  };
  
  if (registrar.votingMintConfigs && registrar.votingMintConfigs.length > 0) {
    const config = registrar.votingMintConfigs[0];
    
    console.log('Expected vs Actual:');
    console.log(`Baseline Factor: ${expectedValues.baselineVoteWeightScaledFactor} vs ${config.baselineVoteWeightScaledFactor.toString()}`);
    console.log(`Max Extra Factor: ${expectedValues.maxExtraLockupVoteWeightScaledFactor} vs ${config.maxExtraLockupVoteWeightScaledFactor.toString()}`);
    console.log(`Lockup Saturation: ${expectedValues.lockupSaturationSecs} vs ${config.lockupSaturationSecs.toString()}`);
    
    const baselineMatch = config.baselineVoteWeightScaledFactor.toString() === expectedValues.baselineVoteWeightScaledFactor.toString();
    const maxExtraMatch = config.maxExtraLockupVoteWeightScaledFactor.toString() === expectedValues.maxExtraLockupVoteWeightScaledFactor.toString();
    const saturationMatch = config.lockupSaturationSecs.toString() === expectedValues.lockupSaturationSecs.toString();
    
    console.log(`\nValidation Results:`);
    console.log(`Baseline Factor: ${baselineMatch ? '✅ MATCH' : '❌ MISMATCH'}`);
    console.log(`Max Extra Factor: ${maxExtraMatch ? '✅ MATCH' : '❌ MISMATCH'}`);
    console.log(`Lockup Saturation: ${saturationMatch ? '✅ MATCH' : '❌ MISMATCH'}`);
    
    if (baselineMatch && maxExtraMatch && saturationMatch) {
      console.log('\n🎯 All values match expected configuration!');
    }
  }
}

// Main execution
async function main() {
  try {
    const registrar = await decodeRegistrarHex();
    validateResults(registrar);
    
    console.log('\n✅ Registrar hex decoding completed successfully');
    
  } catch (error) {
    console.error('\n❌ Registrar decoding failed:', error.message);
    process.exit(1);
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { decodeRegistrarHex };