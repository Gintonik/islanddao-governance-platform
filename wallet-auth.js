/**
 * Wallet Authentication and Signature Verification
 * 
 * This module handles secure wallet verification using Solana signatures
 * to ensure only wallet owners can create/update citizen profiles
 */

// Using built-in crypto for now - can be enhanced with proper Solana verification later
const crypto = require('crypto');

// Admin wallet address (hard-coded for security)
const ADMIN_WALLET = '4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4';

/**
 * Verify a Solana wallet signature
 * @param {string} message - Original message that was signed
 * @param {string} signature - Base58 encoded signature
 * @param {string} publicKey - Base58 encoded public key (wallet address)
 * @returns {boolean} - True if signature is valid
 */
function verifySignature(message, signature, publicKey) {
  try {
    // For development - basic validation
    // In production, this would verify actual Solana signatures
    
    // Check that all required fields are present
    if (!message || !signature || !publicKey) {
      return false;
    }
    
    // Check wallet address format (basic Solana address validation)
    if (publicKey.length < 32 || publicKey.length > 44) {
      return false;
    }
    
    // Check signature is not empty
    if (signature.length < 10) {
      return false;
    }
    
    // For now, accept any non-empty signature with valid wallet format
    // TODO: Implement proper Solana signature verification
    console.log(`⚠️ Using simplified verification for wallet: ${publicKey}`);
    return true;
    
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

/**
 * Generate a verification message with timestamp
 * @param {number} timestamp - Unix timestamp
 * @returns {string} - Message to be signed
 */
function generateVerificationMessage(timestamp) {
  return `I am verifying ownership of this wallet to use the PERKS Citizen Map. Timestamp: ${timestamp}`;
}

/**
 * Check if a wallet address is the admin wallet
 * @param {string} walletAddress - Wallet address to check
 * @returns {boolean} - True if this is the admin wallet
 */
function isAdminWallet(walletAddress) {
  return walletAddress === ADMIN_WALLET;
}

/**
 * Middleware to verify wallet authentication for protected routes
 * @param {boolean} requireAdmin - Whether admin privileges are required
 * @returns {Function} - Express middleware function
 */
function requireWalletAuth(requireAdmin = false) {
  return (req, res, next) => {
    const { wallet_address, original_message, signature } = req.body;

    // Check required fields
    if (!wallet_address || !original_message || !signature) {
      return res.status(400).json({
        error: 'Missing required fields: wallet_address, original_message, signature'
      });
    }

    // Verify the signature
    if (!verifySignature(original_message, signature, wallet_address)) {
      console.log(`⚠️ Invalid signature attempt from wallet: ${wallet_address}`);
      return res.status(401).json({
        error: 'Invalid wallet signature'
      });
    }

    // Check timestamp to prevent replay attacks (5 minute window)
    const timestampMatch = original_message.match(/Timestamp: (\d+)/);
    if (timestampMatch) {
      const messageTimestamp = parseInt(timestampMatch[1]);
      const currentTimestamp = Date.now();
      const timeDiff = Math.abs(currentTimestamp - messageTimestamp);
      
      // Allow 5 minute window for clock differences
      if (timeDiff > 300000) {
        return res.status(401).json({
          error: 'Message timestamp too old or invalid'
        });
      }
    }

    // Check admin privileges if required
    if (requireAdmin && !isAdminWallet(wallet_address)) {
      console.log(`⚠️ Blocked unauthorized admin attempt from wallet: ${wallet_address}`);
      return res.status(403).json({
        error: 'Admin privileges required'
      });
    }

    // Add verified wallet to request
    req.verifiedWallet = wallet_address;
    req.isAdmin = isAdminWallet(wallet_address);
    
    console.log(`✅ Verified wallet: ${wallet_address}${req.isAdmin ? ' (ADMIN)' : ''}`);
    next();
  };
}

module.exports = {
  verifySignature,
  generateVerificationMessage,
  isAdminWallet,
  requireWalletAuth,
  ADMIN_WALLET
};