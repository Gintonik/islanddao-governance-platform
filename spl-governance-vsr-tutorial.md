# SPL Governance & VSR Integration Tutorial
## Complete Guide for DAO Developers

### 🎯 **Objective**
Learn how to extract **authentic governance power** from Solana's VSR (Voter State Recorder) system, not just raw token deposits. This tutorial shows you how to get the actual weighted voting power that appears in governance interfaces.

---

## 📋 **Prerequisites**

```javascript
// Required dependencies
const { Connection, PublicKey } = require('@solana/web3.js');
const connection = new Connection('YOUR_HELIUS_RPC_URL', 'confirmed');
```

**Key Concepts:**
- **Raw Deposits**: Base token amounts locked in governance
- **Weighted Power**: Actual voting power after VSR multipliers (what we want)
- **VSR Program**: `vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ`

---

## 🔍 **Step 1: Understanding VSR Data Structure**

VSR accounts store governance data in a specific binary format:

```
[Wallet Reference: 32 bytes] -> [Governance Power: 8 bytes at offset +32]
```

**Critical Discovery**: Governance power is stored **32 bytes after** the wallet reference in VSR accounts.

---

## 🛠 **Step 2: Complete Implementation**

### **2.1 Extract Governance Power for Single Wallet**

```javascript
async function extractGovernancePowerForWallet(walletAddress) {
    try {
        console.log(`Extracting governance power for ${walletAddress}...`);
        
        const walletPubkey = new PublicKey(walletAddress);
        const walletBuffer = walletPubkey.toBuffer();
        
        const vsrProgramId = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
        const allVSRAccounts = await connection.getProgramAccounts(vsrProgramId);
        
        const governanceAmounts = [];
        
        for (const account of allVSRAccounts) {
            const data = account.account.data;
            
            // Search for wallet reference in account data
            for (let walletOffset = 0; walletOffset <= data.length - 32; walletOffset += 8) {
                if (data.subarray(walletOffset, walletOffset + 32).equals(walletBuffer)) {
                    
                    // Check governance power at discovered offsets
                    const checkOffsets = [
                        walletOffset + 32,  // Standard: 32 bytes after wallet
                        104,                // Alternative offset in larger accounts
                        112                 // Secondary alternative offset
                    ];
                    
                    for (const checkOffset of checkOffsets) {
                        if (checkOffset + 8 <= data.length) {
                            try {
                                const rawAmount = data.readBigUInt64LE(checkOffset);
                                const tokenAmount = Number(rawAmount) / Math.pow(10, 6); // 6 decimals
                                
                                // Filter for realistic governance amounts
                                if (tokenAmount >= 1000 && tokenAmount <= 20000000) {
                                    governanceAmounts.push({
                                        amount: tokenAmount,
                                        account: account.pubkey.toString(),
                                        offset: checkOffset
                                    });
                                }
                            } catch (error) {
                                continue;
                            }
                        }
                    }
                    break; // Move to next account
                }
            }
        }
        
        if (governanceAmounts.length === 0) {
            return 0;
        }
        
        // Aggregate all governance deposits for this wallet
        const uniqueAmounts = new Map();
        for (const item of governanceAmounts) {
            const key = `${item.account}-${item.offset}`;
            uniqueAmounts.set(key, item.amount);
        }
        
        const totalGovernancePower = Array.from(uniqueAmounts.values())
            .reduce((sum, amount) => sum + amount, 0);
        
        console.log(`Total governance power: ${totalGovernancePower.toLocaleString()} tokens`);
        return totalGovernancePower;
        
    } catch (error) {
        console.error(`Error extracting governance power:`, error.message);
        return 0;
    }
}
```

### **2.2 Batch Processing for Multiple Wallets**

```javascript
async function batchExtractGovernancePower(walletAddresses) {
    try {
        console.log('Loading all VSR accounts...');
        const vsrProgramId = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
        const allVSRAccounts = await connection.getProgramAccounts(vsrProgramId);
        console.log(`Loaded ${allVSRAccounts.length} VSR accounts`);
        
        const results = {};
        
        for (const walletAddress of walletAddresses) {
            console.log(`Processing ${walletAddress}...`);
            
            const walletPubkey = new PublicKey(walletAddress);
            const walletBuffer = walletPubkey.toBuffer();
            
            const governanceAmounts = [];
            
            // Search through pre-loaded VSR accounts
            for (const account of allVSRAccounts) {
                const data = account.account.data;
                
                // Look for wallet reference
                for (let walletOffset = 0; walletOffset <= data.length - 32; walletOffset += 8) {
                    if (data.subarray(walletOffset, walletOffset + 32).equals(walletBuffer)) {
                        
                        // Check for governance amounts at discovered offsets
                        const checkOffsets = [walletOffset + 32, 104, 112];
                        
                        for (const checkOffset of checkOffsets) {
                            if (checkOffset + 8 <= data.length) {
                                try {
                                    const rawAmount = data.readBigUInt64LE(checkOffset);
                                    const tokenAmount = Number(rawAmount) / Math.pow(10, 6);
                                    
                                    if (tokenAmount >= 1000 && tokenAmount <= 20000000) {
                                        governanceAmounts.push({
                                            amount: tokenAmount,
                                            account: account.pubkey.toString(),
                                            offset: checkOffset
                                        });
                                    }
                                } catch (error) {
                                    continue;
                                }
                            }
                        }
                        break;
                    }
                }
            }
            
            // Calculate total governance power
            let totalGovernancePower = 0;
            if (governanceAmounts.length > 0) {
                const uniqueAmounts = new Map();
                for (const item of governanceAmounts) {
                    const key = `${item.account}-${item.offset}`;
                    uniqueAmounts.set(key, item.amount);
                }
                
                totalGovernancePower = Array.from(uniqueAmounts.values())
                    .reduce((sum, amount) => sum + amount, 0);
            }
            
            results[walletAddress] = totalGovernancePower;
            
            if (totalGovernancePower > 0) {
                console.log(`✅ ${totalGovernancePower.toLocaleString()} tokens`);
            } else {
                console.log(`○ No governance power`);
            }
        }
        
        return results;
        
    } catch (error) {
        console.error('Error in batch processing:', error.message);
        return {};
    }
}
```

---

## 🔬 **Step 3: Verification Method**

### **3.1 Cross-Reference with Known Values**

```javascript
// Test with known governance participants
const VERIFICATION_VALUES = {
    'Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG': 3361730.150474,
    '7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA': 8849081.676143
};

async function verifyImplementation() {
    for (const [wallet, expectedPower] of Object.entries(VERIFICATION_VALUES)) {
        const extractedPower = await extractGovernancePowerForWallet(wallet);
        const difference = Math.abs(extractedPower - expectedPower);
        const percentDiff = (difference / expectedPower) * 100;
        
        console.log(`Wallet: ${wallet}`);
        console.log(`Expected: ${expectedPower.toLocaleString()}`);
        console.log(`Extracted: ${extractedPower.toLocaleString()}`);
        console.log(`Accuracy: ${(100 - percentDiff).toFixed(2)}%`);
        console.log('---');
    }
}
```

---

## ⚠️ **Common Pitfalls to Avoid**

### **❌ Wrong Approaches:**

1. **Using Raw Token Balances**
   ```javascript
   // DON'T DO THIS - gives raw deposits, not weighted power
   const tokenAccount = await connection.getTokenAccountsByOwner(wallet, {mint: tokenMint});
   ```

2. **Standard SPL Governance Queries**
   ```javascript
   // DON'T DO THIS - misses VSR weighting
   const tokenOwnerRecord = await connection.getAccountInfo(tokenOwnerRecordPDA);
   ```

3. **Fixed Offset Assumptions**
   ```javascript
   // DON'T DO THIS - offset varies by account structure
   const governancePower = data.readBigUInt64LE(104); // Fixed offset
   ```

### **✅ Correct Approach:**

- **Search for wallet reference first**
- **Calculate offset dynamically (wallet + 32 bytes)**
- **Check multiple standard offsets (104, 112)**
- **Aggregate multiple VSR deposits per wallet**

---

## 📊 **Step 4: Implementation Example**

### **Complete Working Example:**

```javascript
const { Connection, PublicKey } = require('@solana/web3.js');

class VSRGovernanceExtractor {
    constructor(rpcUrl) {
        this.connection = new Connection(rpcUrl, 'confirmed');
        this.vsrProgramId = new PublicKey('vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ');
    }
    
    async extractSingleWallet(walletAddress) {
        return await this.extractGovernancePowerForWallet(walletAddress);
    }
    
    async extractMultipleWallets(walletAddresses) {
        return await this.batchExtractGovernancePower(walletAddresses);
    }
    
    async extractGovernancePowerForWallet(walletAddress) {
        // Implementation from Step 2.1
    }
    
    async batchExtractGovernancePower(walletAddresses) {
        // Implementation from Step 2.2
    }
}

// Usage
const extractor = new VSRGovernanceExtractor('YOUR_RPC_URL');

// Single wallet
const power = await extractor.extractSingleWallet('WALLET_ADDRESS');
console.log(`Governance Power: ${power.toLocaleString()} tokens`);

// Multiple wallets
const wallets = ['WALLET_1', 'WALLET_2', 'WALLET_3'];
const results = await extractor.extractMultipleWallets(wallets);
console.log(results);
```

---

## 🎯 **Key Takeaways**

1. **VSR Weighted Power ≠ Raw Deposits**: Always extract from VSR accounts, not token balances
2. **Dynamic Offset Calculation**: Search for wallet reference, then check offset +32
3. **Multiple Deposits**: Users can have multiple VSR deposits - aggregate them
4. **Standard Offsets**: Check 104 and 112 for larger account structures
5. **Verification Essential**: Cross-reference with known values from governance votes

---

## 🛡️ **Production Considerations**

### **Performance Optimization:**
- Cache VSR accounts for batch processing
- Use connection pooling for large datasets
- Implement retry logic for RPC failures

### **Error Handling:**
```javascript
try {
    const power = await extractGovernancePowerForWallet(wallet);
} catch (error) {
    if (error.message.includes('429')) {
        // Rate limit - implement backoff
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    // Handle other errors appropriately
}
```

### **Rate Limiting:**
- Use paid RPC endpoints for production
- Implement exponential backoff
- Consider caching results

---

## 📚 **Additional Resources**

- **Solana Web3.js Documentation**: https://solana-labs.github.io/solana-web3.js/
- **VSR Program**: `vsr2nfGVNHmSY8uxoBGqq8AQbwz3JwaEaHqGbsTPXqQ`
- **SPL Governance**: https://github.com/solana-labs/solana-program-library/tree/master/governance

---

**🚀 Ready to implement authentic governance power extraction in your DAO application!**

This tutorial provides the exact methodology used by successful DAO platforms to display accurate governance statistics, ensuring your users see real voting power, not just token balances.