// Verify that a Token Owner Record exists for this wallet in IslandDAO governance
import { Connection, PublicKey } from '@solana/web3.js';
import { config } from 'dotenv';

config();

// Canonical values
const wallet = new PublicKey('4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4');
const realm = new PublicKey('F9VL4wo49aUe8FufjMbU6uhdfyDRqKY54WpzdpncUSk9');
const mint = new PublicKey('Ds52CDgqdWbTWsua1hgT3AuSSy4FNx2Ezge1br3jQ14a');
const programId = new PublicKey('GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw');

const [pda] = PublicKey.findProgramAddressSync(
  [
    Buffer.from('token-owner-record'),
    realm.toBuffer(),
    mint.toBuffer(),
    wallet.toBuffer()
  ],
  programId
);

console.log('Derived PDA:', pda.toBase58());

const conn = new Connection(process.env.HELIUS_RPC_URL);
const accInfo = await conn.getAccountInfo(pda);
if (!accInfo) {
  console.log('❌ No account found at PDA');
} else {
  console.log('✅ Account exists at PDA');
  console.log('Lamports:', accInfo.lamports);
  console.log('Raw data (base64):', accInfo.data.toString('base64'));
}