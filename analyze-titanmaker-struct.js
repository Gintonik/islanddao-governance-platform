/**
 * Analyze Titanmaker VSR Account Structure
 * Deep dive into the specific account containing 200,000 ISLAND
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const TITANMAKER_VSR_ACCOUNT = 'xGW423w6m34PkGfFsCF6eWzP8LbEAYMHFYp9dvvV2br';

const connection = new Connection(HELIUS_RPC, 'confirmed');

function deserializeDepositEntry(data, offset, index) {
  try {
    const startTs = Number(data.readBigUInt64LE(offset + 0));
    const endTs = Number(data.readBigUInt64LE(offset + 8));
    const lockupKind = data.readUInt8(offset + 16);
    const amountDepositedNative = Number(data.readBigUInt64LE(offset + 24));
    const amountInitiallyLockedNative = Number(data.readBigUInt64LE(offset + 32));
    const isUsed = data.readUInt8(offset + 40);
    const allowClawback = data.readUInt8(offset + 41);
    const votingMintConfigIdx = data.readUInt8(offset + 42);
    
    const amountInTokens = amountDepositedNative / 1e6;
    
    return {
      index,
      offset,
      startTs,
      endTs,
      lockupKind,
      amountDepositedNative,
      amountInitiallyLockedNative,
      amountInTokens,
      isUsed,
      allowClawback,
      votingMintConfigIdx
    };
    
  } catch (error) {
    return null;
  }
}

async function analyzeTitanmakerStruct() {
  console.log('=== Analyze Titanmaker VSR Account Structure ===');
  console.log(`Account: ${TITANMAKER_VSR_ACCOUNT}`);
  console.log('Looking for the 200,000 ISLAND deposit and its isUsed flag');
  console.log('');
  
  const accountInfo = await connection.getAccountInfo(new PublicKey(TITANMAKER_VSR_ACCOUNT));
  
  if (!accountInfo) {
    console.log('❌ Account not found');
    return;
  }
  
  const data = accountInfo.data;
  console.log(`Data length: ${data.length} bytes`);
  
  // Check VSR discriminator
  const VSR_DISCRIMINATOR = '14560581792603266545';
  if (data.length >= 8) {
    const discriminator = data.readBigUInt64LE(0);
    if (discriminator.toString() === VSR_DISCRIMINATOR) {
      console.log('✅ Valid VSR discriminator');
      
      // Parse header
      if (data.length >= 80) {
        const registrar = new PublicKey(data.subarray(8, 40));
        const authority = new PublicKey(data.subarray(40, 72));
        const voterBump = data.readUInt8(72);
        const voterWeightRecordBump = data.readUInt8(73);
        
        console.log(`Registrar: ${registrar.toBase58()}`);
        console.log(`Authority: ${authority.toBase58()}`);
        console.log(`Voter bump: ${voterBump}`);
        console.log(`VWR bump: ${voterWeightRecordBump}`);
        
        // Parse all deposit entries
        const DEPOSIT_SIZE = 72;
        const DEPOSITS_START = 80;
        const MAX_DEPOSITS = 32;
        
        console.log(`\nParsing ${MAX_DEPOSITS} deposit entries:`);
        
        let foundTarget = false;
        
        for (let i = 0; i < MAX_DEPOSITS; i++) {
          const entryOffset = DEPOSITS_START + (i * DEPOSIT_SIZE);
          
          if (entryOffset + DEPOSIT_SIZE > data.length) {
            break;
          }
          
          const entry = deserializeDepositEntry(data, entryOffset, i);
          if (!entry) continue;
          
          const isTargetAmount = Math.abs(entry.amountInTokens - 200000) < 0.01;
          const marker = isTargetAmount ? '🎯' : '  ';
          
          console.log(`${marker} Entry ${i} (offset ${entryOffset}):`);
          console.log(`    Amount: ${entry.amountInTokens.toLocaleString()} ISLAND (${entry.amountDepositedNative})`);
          console.log(`    isUsed: ${entry.isUsed} (${entry.isUsed === 1 ? 'true' : 'false'})`);
          console.log(`    lockupKind: ${entry.lockupKind}`);
          console.log(`    startTs: ${entry.startTs}`);
          console.log(`    endTs: ${entry.endTs}`);
          console.log(`    allowClawback: ${entry.allowClawback}`);
          console.log(`    votingMintConfigIdx: ${entry.votingMintConfigIdx}`);
          
          if (isTargetAmount) {
            foundTarget = true;
            console.log(`    >>> THIS IS THE TARGET DEPOSIT <<<`);
            
            if (entry.isUsed !== 1) {
              console.log(`    ⚠️  isUsed=${entry.isUsed} - This is why it's being filtered out!`);
            } else {
              console.log(`    ✅ isUsed=true - This should be included`);
            }
          }
          
          console.log('');
        }
        
        if (!foundTarget) {
          console.log('❌ 200,000 ISLAND deposit not found in deposit entries');
          
          // Manual search through raw data
          const targetAmount = BigInt(200000000000);
          console.log('\nManual search through raw data:');
          
          for (let offset = 0; offset <= data.length - 8; offset += 1) {
            try {
              const value = data.readBigUInt64LE(offset);
              if (value === targetAmount) {
                console.log(`Found 200,000 ISLAND at raw offset ${offset}`);
                
                // Try to determine which deposit entry this belongs to
                if (offset >= 80) {
                  const entryIndex = Math.floor((offset - 80) / 72);
                  const entryStart = 80 + entryIndex * 72;
                  const offsetInEntry = offset - entryStart;
                  
                  console.log(`  Belongs to entry ${entryIndex}, offset ${offsetInEntry} within entry`);
                  
                  if (offsetInEntry === 24) {
                    console.log(`  This is the amountDepositedNative field`);
                    const isUsedOffset = entryStart + 40;
                    const isUsed = data.readUInt8(isUsedOffset);
                    console.log(`  isUsed flag at offset ${isUsedOffset}: ${isUsed}`);
                  }
                }
              }
            } catch (error) {
              // Continue
            }
          }
        }
        
      } else {
        console.log('❌ Insufficient data for VSR header');
      }
    } else {
      console.log('❌ Invalid VSR discriminator');
    }
  }
}

if (require.main === module) {
  analyzeTitanmakerStruct().catch((error) => {
    console.error('Analysis failed:', error.message);
    process.exit(1);
  });
}