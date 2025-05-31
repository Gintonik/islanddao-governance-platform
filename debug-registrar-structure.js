/**
 * Debug Registrar Structure
 * Analyzes the raw registrar data to understand the correct value parsing
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';
const ISLAND_MINT = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
const ISLANDDAO_REGISTRAR = new PublicKey('5ZnjJjALX8xs7zuM6t6m7XVkPV3fY3NqxwHvDLhwpShM');

const connection = new Connection(HELIUS_RPC, 'confirmed');

async function debugRegistrarStructure() {
  console.log('=== Debugging IslandDAO Registrar Structure ===');
  
  const registrarAccount = await connection.getAccountInfo(ISLANDDAO_REGISTRAR);
  if (!registrarAccount) {
    throw new Error('Registrar account not found');
  }
  
  const data = registrarAccount.data;
  console.log(`Account data length: ${data.length} bytes`);
  
  // Find ISLAND mint location
  for (let offset = 0; offset < data.length - 32; offset += 4) {
    try {
      const potentialMint = new PublicKey(data.subarray(offset, offset + 32));
      
      if (potentialMint.equals(ISLAND_MINT)) {
        console.log(`\nFound ISLAND mint at offset ${offset}`);
        
        // Show the next 128 bytes after the mint for analysis
        console.log('\nRaw bytes after ISLAND mint:');
        for (let i = 0; i < 128 && offset + 32 + i < data.length; i += 8) {
          const value = data.readBigUInt64LE(offset + 32 + i);
          console.log(`  Offset +${i}: ${value.toString()} (0x${value.toString(16)})`);
        }
        
        // Try different scaling approaches
        const configOffset = offset + 32;
        const rawBaseline = Number(data.readBigUInt64LE(configOffset));
        const rawMaxExtra = Number(data.readBigUInt64LE(configOffset + 8));
        const rawSaturation = Number(data.readBigUInt64LE(configOffset + 16));
        
        console.log('\nTrying different scaling approaches:');
        
        // Approach 1: Direct values
        console.log(`1. Direct values: baseline=${rawBaseline}, maxExtra=${rawMaxExtra}, saturation=${rawSaturation}`);
        
        // Approach 2: Scale by 1e18
        console.log(`2. Scale by 1e18: baseline=${rawBaseline/1e18}, maxExtra=${rawMaxExtra/1e18}, saturation=${rawSaturation}`);
        
        // Approach 3: Scale by 1e9
        console.log(`3. Scale by 1e9: baseline=${rawBaseline/1e9}, maxExtra=${rawMaxExtra/1e9}, saturation=${rawSaturation}`);
        
        // Approach 4: Scale by 1e6
        console.log(`4. Scale by 1e6: baseline=${rawBaseline/1e6}, maxExtra=${rawMaxExtra/1e6}, saturation=${rawSaturation}`);
        
        // Approach 5: Check if they're actually different data types
        console.log(`5. As different interpretations:`);
        console.log(`   Baseline as float: ${new DataView(data.buffer, data.byteOffset + configOffset).getFloat64(0, true)}`);
        console.log(`   MaxExtra as float: ${new DataView(data.buffer, data.byteOffset + configOffset + 8).getFloat64(0, true)}`);
        
        // The saturation value is enormous, suggesting wrong parsing
        // Let's check if the structure is different
        console.log('\nChecking alternative structure interpretations:');
        
        // Maybe there's padding or different field order
        for (let testOffset = 0; testOffset < 64; testOffset += 8) {
          const testValue = Number(data.readBigUInt64LE(configOffset + testOffset));
          
          // Look for reasonable saturation values (1-10 years in seconds)
          if (testValue >= 31557600 && testValue <= 315576000) { // 1-10 years
            console.log(`   Found reasonable saturation at offset +${testOffset}: ${testValue} seconds (${(testValue/31557600).toFixed(2)} years)`);
          }
          
          // Look for reasonable baseline values when scaled
          const scaled18 = testValue / 1e18;
          const scaled9 = testValue / 1e9;
          if (scaled18 >= 0.5 && scaled18 <= 5.0) {
            console.log(`   Found reasonable baseline (1e18) at offset +${testOffset}: ${scaled18}`);
          }
          if (scaled9 >= 0.5 && scaled9 <= 5.0) {
            console.log(`   Found reasonable baseline (1e9) at offset +${testOffset}: ${scaled9}`);
          }
        }
        
        break;
      }
    } catch (e) {
      continue;
    }
  }
}

debugRegistrarStructure().catch(console.error);