/**
 * Manual Registrar Analysis
 * Direct parsing of registrar accounts to extract ISLAND token configuration
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const VSR_PROGRAM_ID = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
const ISLAND_TOKEN_MINT = '4SLdYJzqbRUzwKJSvBdoFiY24KjTMvKMCpWcBAdTQrby';

// Known registrars from DeanMachine's accounts
const KNOWN_REGISTRARS = [
  '3xJZ38FE31xVcsYnGpeHy36N7YwkBUsGi8Y5aPFNr4s9',
  '6YGuFEQnMtHfRNn6hgmnYVdEk6yMLGGeESRgLikSdLgP',
  '5vVAxag6WVUWn1Yq2hqKrWUkNtSJEefJmBLtk5syLZJ5',
  'Du7fEQExVrmNKDWjctgA4vbn2CnVSDvH2AoXsBpPcYvd',
  'FYGUd8h7mNt7QKyEZeCKA69heM85YNfuFKqFWvAtiVar'
];

async function analyzeRegistrars() {
  try {
    console.log('🔍 Manual analysis of registrar accounts...\n');
    
    const connection = new Connection(process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00');
    
    let islandConfig = null;
    
    for (const registrarAddress of KNOWN_REGISTRARS) {
      try {
        console.log(`📋 Analyzing registrar: ${registrarAddress}`);
        
        const registrarPubkey = new PublicKey(registrarAddress);
        const accountInfo = await connection.getAccountInfo(registrarPubkey);
        
        if (!accountInfo) {
          console.log('❌ Account not found\n');
          continue;
        }
        
        console.log(`📏 Account size: ${accountInfo.data.length} bytes`);
        
        const registrarData = parseRegistrarAccount(accountInfo.data);
        
        if (registrarData) {
          console.log('✅ Successfully parsed registrar:');
          console.log(`   Governance Program: ${registrarData.governanceProgramId}`);
          console.log(`   Realm: ${registrarData.realm}`);
          console.log(`   Governing Token Mint: ${registrarData.governingTokenMint}`);
          console.log(`   Voting Mints: ${registrarData.votingMints.length}`);
          
          // Look for ISLAND token configuration
          const islandMintConfig = registrarData.votingMints.find(mint => 
            mint.mint === ISLAND_TOKEN_MINT
          );
          
          if (islandMintConfig) {
            console.log('\n🏝️  FOUND ISLAND TOKEN CONFIGURATION:');
            console.log(`   Baseline Vote Weight Factor: ${islandMintConfig.baselineVoteWeightScaledFactor}`);
            console.log(`   Max Extra Lockup Factor: ${islandMintConfig.maxExtraLockupVoteWeightScaledFactor}`);
            console.log(`   Lockup Saturation Secs: ${islandMintConfig.lockupSaturationSecs}`);
            console.log(`   Digit Shift: ${islandMintConfig.digitShift}`);
            
            islandConfig = {
              registrar: registrarAddress,
              ...islandMintConfig
            };
            
            // Calculate some example multipliers
            console.log('\n📊 Example multipliers:');
            const examples = [
              { days: 0, secs: 0 },
              { days: 30, secs: 30 * 24 * 60 * 60 },
              { days: 365, secs: 365 * 24 * 60 * 60 },
              { days: 730, secs: 730 * 24 * 60 * 60 },
              { days: 1460, secs: 1460 * 24 * 60 * 60 }
            ];
            
            examples.forEach(example => {
              const multiplier = calculateMultiplier(example.secs, islandMintConfig);
              console.log(`   ${example.days} days: ${multiplier.toFixed(6)}x`);
            });
          }
        }
        
        console.log(''); // Blank line
        
      } catch (error) {
        console.log(`❌ Error analyzing ${registrarAddress}: ${error.message}\n`);
      }
    }
    
    if (islandConfig) {
      console.log('🎯 ISLAND Token Configuration Found!');
      console.log('This configuration can be used for authentic governance power calculation.\n');
      
      // Test with a known voter account
      await testVoterCalculation(connection, islandConfig);
    } else {
      console.log('❌ No ISLAND token configuration found in any registrar');
    }
    
  } catch (error) {
    console.error('Error in registrar analysis:', error);
  }
}

function parseRegistrarAccount(data) {
  try {
    let offset = 8; // Skip discriminator
    
    // Read governance program ID (32 bytes)
    const governanceProgramId = new PublicKey(data.slice(offset, offset + 32)).toBase58();
    offset += 32;
    
    // Read realm (32 bytes)
    const realm = new PublicKey(data.slice(offset, offset + 32)).toBase58();
    offset += 32;
    
    // Read governing token mint (32 bytes)
    const governingTokenMint = new PublicKey(data.slice(offset, offset + 32)).toBase58();
    offset += 32;
    
    // Read voting mints vector
    const votingMintsCount = data.readUInt32LE(offset);
    offset += 4;
    
    if (votingMintsCount > 20) {
      console.log(`   Warning: Large voting mints count (${votingMintsCount}), limiting to 10`);
    }
    
    const votingMints = [];
    const maxMints = Math.min(votingMintsCount, 10);
    
    for (let i = 0; i < maxMints; i++) {
      try {
        // Parse voting mint config (each ~81 bytes)
        const mint = new PublicKey(data.slice(offset, offset + 32)).toBase58();
        offset += 32;
        
        // Grant authority option (1 + possibly 32 bytes)
        const hasGrantAuthority = data.readUInt8(offset);
        offset += 1;
        if (hasGrantAuthority) {
          offset += 32; // Skip grant authority pubkey
        }
        
        // Read scaled factors and settings
        const baselineVoteWeightScaledFactor = data.readBigUInt64LE(offset);
        offset += 8;
        
        const maxExtraLockupVoteWeightScaledFactor = data.readBigUInt64LE(offset);
        offset += 8;
        
        const lockupSaturationSecs = data.readBigUInt64LE(offset);
        offset += 8;
        
        const digitShift = data.readInt8(offset);
        offset += 1;
        
        votingMints.push({
          mint,
          baselineVoteWeightScaledFactor: Number(baselineVoteWeightScaledFactor),
          maxExtraLockupVoteWeightScaledFactor: Number(maxExtraLockupVoteWeightScaledFactor),
          lockupSaturationSecs: Number(lockupSaturationSecs),
          digitShift
        });
        
      } catch (error) {
        console.log(`   Error parsing voting mint ${i}: ${error.message}`);
        break;
      }
    }
    
    return {
      governanceProgramId,
      realm,
      governingTokenMint,
      votingMints
    };
    
  } catch (error) {
    console.log(`❌ Parsing failed: ${error.message}`);
    return null;
  }
}

function calculateMultiplier(lockupSecs, mintConfig) {
  const {
    baselineVoteWeightScaledFactor,
    maxExtraLockupVoteWeightScaledFactor,
    lockupSaturationSecs
  } = mintConfig;
  
  if (baselineVoteWeightScaledFactor === 0) return 0;
  
  // VSR multiplier formula
  const multiplier = (baselineVoteWeightScaledFactor +
    (maxExtraLockupVoteWeightScaledFactor *
      Math.min(lockupSecs, lockupSaturationSecs)) /
      lockupSaturationSecs) /
    baselineVoteWeightScaledFactor;
  
  return multiplier;
}

async function testVoterCalculation(connection, islandConfig) {
  try {
    console.log('🧪 Testing voter calculation with DeanMachine account...\n');
    
    // Use one of DeanMachine's voter accounts
    const voterAccount = 'ghdaFEBVGe8FjvEenZwuccfioymkRZM7Vwe6pBpYoDP';
    const voterPubkey = new PublicKey(voterAccount);
    
    const accountInfo = await connection.getAccountInfo(voterPubkey);
    
    if (!accountInfo) {
      console.log('❌ Voter account not found');
      return;
    }
    
    console.log(`📏 Voter account size: ${accountInfo.data.length} bytes`);
    
    // Parse voter account structure
    const voterData = parseVoterAccount(accountInfo.data, islandConfig);
    
    if (voterData) {
      console.log('✅ Voter account parsed successfully');
      console.log(`   Voter Authority: ${voterData.voterAuthority}`);
      console.log(`   Registrar: ${voterData.registrar}`);
      console.log(`   Valid Deposits: ${voterData.validDeposits}`);
      console.log(`   Total Governance Power: ${voterData.totalGovernancePower.toLocaleString()} ISLAND`);
    }
    
  } catch (error) {
    console.error('Error testing voter calculation:', error.message);
  }
}

function parseVoterAccount(data, islandConfig) {
  try {
    // Voter account structure: discriminator(8) + voter_authority(32) + registrar(32) + deposits
    let offset = 8; // Skip discriminator
    
    const voterAuthority = new PublicKey(data.slice(offset, offset + 32)).toBase58();
    offset += 32;
    
    const registrar = new PublicKey(data.slice(offset, offset + 32)).toBase58();
    offset += 32;
    
    const depositsCount = data.readUInt32LE(offset);
    offset += 4;
    
    console.log(`   Parsing ${depositsCount} deposits...`);
    
    // The deposit count is corrupted, so we'll try to read a reasonable number
    const maxDeposits = Math.min(depositsCount, 50);
    
    let totalGovernancePower = 0;
    let validDeposits = 0;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    
    for (let i = 0; i < maxDeposits && offset + 56 < data.length; i++) {
      try {
        // Parse deposit entry (~56 bytes)
        const startTs = Number(data.readBigInt64LE(offset));
        const endTs = Number(data.readBigInt64LE(offset + 8));
        const lockupKind = data.readUInt8(offset + 16);
        offset += 24; // Skip lockup structure
        
        const amountDepositedNative = Number(data.readBigUInt64LE(offset));
        const amountInitiallyLockedNative = Number(data.readBigUInt64LE(offset + 8));
        offset += 16;
        
        const isUsed = data.readUInt8(offset) === 1;
        const allowClawback = data.readUInt8(offset + 1) === 1;
        const votingMintConfigIdx = data.readUInt8(offset + 2);
        offset += 8; // Include padding
        
        // Validation
        if (!isUsed || amountDepositedNative === 0 || endTs <= currentTimestamp) {
          continue;
        }
        
        // Calculate remaining lockup
        const lockupSecsRemaining = endTs - currentTimestamp;
        
        // Calculate multiplier
        const multiplier = calculateMultiplier(lockupSecsRemaining, islandConfig);
        
        // Calculate voting power
        const votingPower = (amountDepositedNative * multiplier) / 1e6;
        
        totalGovernancePower += votingPower;
        validDeposits++;
        
        if (validDeposits <= 5) {
          console.log(`   Deposit ${i}: ${(amountDepositedNative / 1e6).toLocaleString()} ISLAND * ${multiplier.toFixed(3)}x = ${votingPower.toLocaleString()} power`);
        }
        
      } catch (error) {
        // Skip problematic deposits
        offset += 56; // Move to next deposit
      }
    }
    
    return {
      voterAuthority,
      registrar,
      validDeposits,
      totalGovernancePower
    };
    
  } catch (error) {
    console.log(`❌ Voter parsing failed: ${error.message}`);
    return null;
  }
}

analyzeRegistrars();