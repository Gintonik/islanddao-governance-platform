/**
 * Citizen Recovery Tool (Development Use Only)
 * Restore citizens who were removed but may have regained NFTs
 */

import { config } from "dotenv";
import { restoreCitizenIfValid } from "./map-management-system.js";

config();

async function restoreCitizen() {
  const walletAddress = process.argv[2];
  
  if (!walletAddress) {
    console.log('Usage: node restore-citizen.js <wallet_address>');
    process.exit(1);
  }
  
  console.log(`Attempting to restore citizen: ${walletAddress}`);
  
  const result = await restoreCitizenIfValid(walletAddress);
  
  if (result.success) {
    console.log('✓ Citizen restored to map');
  } else {
    console.log(`✗ Restoration failed: ${result.message}`);
  }
}

restoreCitizen();