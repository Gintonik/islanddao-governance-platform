/**
 * Analyze VSR account structure to understand deposit entry layout
 * Find the correct position and values for deposit validity flags
 */

const { Connection, PublicKey } = require('@solana/web3.js');

const connection = new Connection(process.env.HELIUS_RPC_URL);
const VSR_PROGRAM_ID = new PublicKey("vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ");

async function analyzeVSRStructure() {
  console.log('Analyzing VSR account structure to understand deposit validity flags...');
  
  // Get a few VSR accounts for analysis
  const accounts = await connection.getProgramAccounts(VSR_PROGRAM_ID, {
    filters: [{ dataSize: 2728 }]
  });
  
  console.log(`Found ${accounts.length} VSR accounts for analysis`);
  
  // Analyze first few accounts
  for (let i = 0; i < Math.min(5, accounts.length); i++) {
    const account = accounts[i];
    const data = account.account.data;
    
    console.log(`\nAccount ${i + 1}: ${account.pubkey.toBase58()}`);
    console.log(`Data length: ${data.length} bytes`);
    
    // Check authority
    const authority = new PublicKey(data.slice(8, 40)).toBase58();
    console.log(`Authority: ${authority}`);
    
    // Analyze potential deposit entries
    const HEADER_SIZE = 104;
    const DEPOSIT_ENTRY_SIZE = 80;
    const remainingBytes = data.length - HEADER_SIZE;
    const maxEntries = Math.floor(remainingBytes / DEPOSIT_ENTRY_SIZE);
    
    console.log(`Max possible deposit entries: ${maxEntries}`);
    
    for (let j = 0; j < Math.min(3, maxEntries); j++) {
      const entryOffset = HEADER_SIZE + (j * DEPOSIT_ENTRY_SIZE);
      
      if (entryOffset + DEPOSIT_ENTRY_SIZE <= data.length) {
        const amount = Number(data.readBigUInt64LE(entryOffset)) / 1e6;
        
        if (amount > 0 && amount < 50_000_000) {
          console.log(`  Entry ${j}: ${amount.toFixed(6)} ISLAND at offset ${entryOffset}`);
          
          // Analyze various flag positions
          for (let flagOffset = 70; flagOffset < 80; flagOffset++) {
            const flagValue = data[entryOffset + flagOffset];
            console.log(`    Flag at +${flagOffset}: ${flagValue} (0x${flagValue.toString(16).padStart(2, '0')})`);
          }
        }
      }
    }
  }
}

analyzeVSRStructure().catch(console.error);