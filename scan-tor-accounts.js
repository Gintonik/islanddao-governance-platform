// Scan all TokenOwnerRecords to find any that belong to a specific wallet
// even if PDA derivation fails. It scans all accounts and filters locally.

import { Connection, PublicKey } from "@solana/web3.js";
import { config } from 'dotenv';

config();

const GOVERNANCE_PROGRAM_ID = new PublicKey("GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw");
const ISLAND_REALM_ID = new PublicKey("F9VL4wo49aUe8FufjMbU6uhdfyDRqKY54WpzdpncUSk9");
const WALLET_TO_CHECK = new PublicKey("4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4");

const connection = new Connection(process.env.HELIUS_RPC_URL);

(async () => {
  console.log(`Scanning for TokenOwnerRecords belonging to: ${WALLET_TO_CHECK.toBase58()}`);
  console.log(`In realm: ${ISLAND_REALM_ID.toBase58()}\n`);
  
  const accounts = await connection.getProgramAccounts(GOVERNANCE_PROGRAM_ID, {
    filters: [{ dataSize: 404 }],
  });

  console.log(`Found ${accounts.length} total TokenOwnerRecord accounts\n`);

  let matches = [];
  for (let acc of accounts) {
    const data = acc.account.data;
    const realm = new PublicKey(data.slice(0, 32));
    const governingTokenOwner = new PublicKey(data.slice(72, 104));
    
    if (realm.equals(ISLAND_REALM_ID) && governingTokenOwner.equals(WALLET_TO_CHECK)) {
      // Parse additional fields
      const governingTokenMint = new PublicKey(data.slice(32, 64));
      const governingTokenDepositAmount = data.readBigUInt64LE(104);
      
      // Check for governance delegate (optional field)
      const hasGovernanceDelegate = data[112] === 1;
      let governanceDelegate = null;
      if (hasGovernanceDelegate) {
        governanceDelegate = new PublicKey(data.slice(113, 145));
      }
      
      matches.push({
        address: acc.pubkey.toBase58(),
        lamports: acc.account.lamports,
        realm: realm.toBase58(),
        governingTokenMint: governingTokenMint.toBase58(),
        governingTokenOwner: governingTokenOwner.toBase58(),
        governingTokenDepositAmount: governingTokenDepositAmount.toString(),
        governanceDelegate: governanceDelegate ? governanceDelegate.toBase58() : null,
      });
    }
  }

  if (matches.length === 0) {
    console.log("❌ No TokenOwnerRecord found for this wallet in IslandDAO realm");
  } else {
    console.log(`✅ Found ${matches.length} TokenOwnerRecord(s):`);
    matches.forEach((match, i) => {
      console.log(`\nRecord ${i + 1}:`);
      console.log(`  Address: ${match.address}`);
      console.log(`  Deposit Amount: ${match.governingTokenDepositAmount}`);
      console.log(`  Token Mint: ${match.governingTokenMint}`);
      console.log(`  Governance Delegate: ${match.governanceDelegate || 'None'}`);
      console.log(`  Lamports: ${match.lamports}`);
    });
  }
})();