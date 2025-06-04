/**
 * Wallet Verification Module
 * Framework-agnostic vanilla JS module for Solana wallet signature verification
 * Supports hardware wallets with transaction fallback method
 */

class WalletVerifier {
    constructor(options = {}) {
        this.connection = options.connection;
        this.debug = options.debug || false;
        this.apiBaseUrl = options.apiBaseUrl || '';
        
        // Import Solana web3 classes if available globally
        if (typeof window !== 'undefined' && window.solanaWeb3) {
            this.Transaction = window.solanaWeb3.Transaction;
            this.SystemProgram = window.solanaWeb3.SystemProgram;
            this.PublicKey = window.solanaWeb3.PublicKey;
        }
        
        this.log('WalletVerifier initialized');
    }

    log(message, data = null) {
        if (this.debug) {
            console.log(`[WalletVerifier] ${message}`, data || '');
        }
    }

    error(message, error = null) {
        console.error(`[WalletVerifier] ${message}`, error || '');
    }

    /**
     * Generate verification message from server
     */
    async generateVerificationMessage() {
        try {
            this.log('Generating verification message...');
            
            const response = await fetch(`${this.apiBaseUrl}/api/auth/generate-message`);
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            const result = await response.json();
            this.log('Verification message generated', result.message);
            
            return result;
        } catch (error) {
            this.error('Failed to generate verification message', error);
            throw new Error(`Message generation failed: ${error.message}`);
        }
    }

    /**
     * Convert signature to base64 format
     */
    signatureToBase64(signature) {
        if (signature instanceof Uint8Array) {
            return btoa(String.fromCharCode(...signature));
        } else if (Array.isArray(signature)) {
            return btoa(String.fromCharCode(...signature));
        } else if (typeof signature === 'string') {
            return signature; // Already base64
        }
        throw new Error('Invalid signature format');
    }

    /**
     * Verify wallet ownership using message signature
     */
    async verifyWithMessage(wallet, message) {
        try {
            this.log(`Attempting message signature with ${wallet.getConnectedWallet()}...`);
            
            const encodedMessage = new TextEncoder().encode(message);
            const signResult = await wallet.signMessage(encodedMessage);
            
            const base64Signature = this.signatureToBase64(signResult.signature);
            
            this.log('Message signature successful');
            return {
                signature: base64Signature,
                method: 'message',
                publicKey: signResult.publicKey || wallet.getPublicKey()
            };
            
        } catch (error) {
            const errorMessage = error.message || error.toString() || 'Unknown error';
            const errorName = error.name || '';
            const errorCode = error.code;
            
            this.log('Message signature failed', errorMessage);
            
            // Check if it's a user cancellation
            if (errorMessage.includes('User rejected') || 
                errorMessage.includes('cancelled') ||
                errorMessage.includes('Transaction cancelled') ||
                errorCode === 4001) {
                throw new Error('Signature canceled. Try again or switch wallet.');
            }
            
            // Check for Ledger hardware wallet errors
            if (errorMessage.includes('Ledger') ||
                errorMessage.includes('unsupportedOperation') ||
                errorMessage.includes('off chain messages') ||
                errorMessage.includes('not yet supported')) {
                this.log('Hardware wallet detected, will try transaction fallback');
                throw error; // Let caller handle fallback
            }
            
            // Check if signMessage is not supported (other hardware wallets)
            if (errorMessage.includes('not supported') || 
                errorName === 'NotSupportedError' ||
                errorMessage.includes('does not support')) {
                this.log('SignMessage not supported, will try transaction fallback');
                throw error; // Let caller handle fallback
            }
            
            throw error;
        }
    }

    /**
     * Verify wallet ownership using transaction signature (hardware wallet fallback)
     */
    async verifyWithTransaction(wallet, message) {
        try {
            this.log(`Attempting transaction signature fallback with ${wallet.getConnectedWallet()}...`);
            
            if (!this.Transaction || !this.SystemProgram || !this.PublicKey) {
                throw new Error('Solana web3.js not available for transaction fallback');
            }
            
            if (!this.connection) {
                throw new Error('Solana connection required for transaction fallback');
            }
            
            const publicKey = new this.PublicKey(wallet.getPublicKey().toString());
            
            // Create 0-lamport self-transfer with message in memo
            const transaction = new this.Transaction();
            
            // Add memo instruction with verification message
            if (window.solanaWeb3 && window.solanaWeb3.MEMO_PROGRAM_ID) {
                transaction.add(
                    new window.solanaWeb3.TransactionInstruction({
                        keys: [],
                        programId: window.solanaWeb3.MEMO_PROGRAM_ID,
                        data: Buffer.from(message, 'utf8')
                    })
                );
            }
            
            // Add 0-lamport self-transfer
            transaction.add(
                this.SystemProgram.transfer({
                    fromPubkey: publicKey,
                    toPubkey: publicKey,
                    lamports: 0
                })
            );
            
            // Get recent blockhash
            const { blockhash } = await this.connection.getLatestBlockhash();
            transaction.recentBlockhash = blockhash;
            transaction.feePayer = publicKey;
            
            this.log('Requesting transaction signature...');
            const signedTransaction = await wallet.signTransaction(transaction);
            
            // Serialize transaction for verification
            const serializedTx = signedTransaction.serialize();
            const base64Signature = this.signatureToBase64(serializedTx);
            
            this.log('Transaction signature successful');
            return {
                signature: base64Signature,
                method: 'transaction',
                publicKey: publicKey
            };
            
        } catch (error) {
            this.error('Transaction signature failed', error);
            
            if (error.message.includes('User rejected') || 
                error.message.includes('cancelled') ||
                error.code === 4001) {
                throw new Error('Transaction signature canceled by user');
            }
            
            throw new Error(`Transaction fallback failed: ${error.message}`);
        }
    }

    /**
     * Complete wallet verification with automatic fallback
     */
    async verifyWallet(wallet, connection = null) {
        try {
            if (!wallet || !wallet.isConnected()) {
                throw new Error('Wallet not connected');
            }
            
            // Set connection for transaction fallback
            if (connection) {
                this.connection = connection;
            }
            
            this.log('Starting wallet verification process...');
            
            // Step 1: Generate verification message
            const { message, timestamp } = await this.generateVerificationMessage();
            
            let verificationResult;
            
            try {
                // Step 2: Try message signature first
                verificationResult = await this.verifyWithMessage(wallet, message);
                
            } catch (error) {
                const errorMessage = error.message || error.toString() || 'Unknown error';
                const errorName = error.name || '';
                
                // Step 3: Fallback to transaction signature for hardware wallets
                if (errorMessage.includes('Ledger') ||
                    errorMessage.includes('unsupportedOperation') ||
                    errorMessage.includes('off chain messages') ||
                    errorMessage.includes('not yet supported') ||
                    errorMessage.includes('not supported') || 
                    errorName === 'NotSupportedError' ||
                    errorMessage.includes('does not support')) {
                    
                    this.log('Using transaction fallback for hardware wallet...');
                    verificationResult = await this.verifyWithTransaction(wallet, message);
                    
                } else {
                    // Re-throw other errors (user cancellation, etc.)
                    throw error;
                }
            }
            
            // Step 4: Return complete verification data
            const result = {
                walletAddress: wallet.getPublicKey().toString(),
                signature: verificationResult.signature,
                originalMessage: message,
                fallbackMethod: verificationResult.method,
                timestamp: timestamp,
                verified: true
            };
            
            this.log('Wallet verification complete', {
                wallet: result.walletAddress,
                method: result.fallbackMethod
            });
            
            return result;
            
        } catch (error) {
            this.error('Wallet verification failed', error);
            
            // Provide user-friendly error messages
            if (error.message.includes('canceled') || error.message.includes('rejected')) {
                throw new Error('Signature canceled. Try again or switch wallet.');
            } else if (error.message.includes('not connected')) {
                throw new Error('Please connect your wallet first.');
            } else if (error.message.includes('not supported')) {
                throw new Error('Verification failed. Please try again with a different wallet.');
            } else {
                throw new Error(`Verification failed: ${error.message}`);
            }
        }
    }

    /**
     * Submit verified citizen data to server
     */
    async submitVerifiedCitizen(verificationData, citizenData) {
        try {
            this.log('Submitting verified citizen data...');
            
            const payload = {
                wallet_address: verificationData.walletAddress,
                signature: verificationData.signature,
                original_message: verificationData.originalMessage,
                fallback_method: verificationData.fallbackMethod,
                ...citizenData
            };
            
            this.log('Payload prepared', payload);
            
            const response = await fetch(`${this.apiBaseUrl}/api/save-citizen-verified`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }
            
            const result = await response.json();
            this.log('Citizen data submitted successfully', result);
            
            return result;
            
        } catch (error) {
            this.error('Failed to submit citizen data', error);
            throw new Error(`Submission failed: ${error.message}`);
        }
    }
}

// Export for both module and global usage
if (typeof module !== 'undefined' && module.exports) {
    module.exports = WalletVerifier;
} else if (typeof window !== 'undefined') {
    window.WalletVerifier = WalletVerifier;
}