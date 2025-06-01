import express from 'express';
import { Connection, PublicKey } from '@solana/web3.js';

const app = express();
const port = process.env.PORT || 3000;

// Replace with your Helius RPC endpoint
const HELIUS_RPC = 'https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00';

app.get('/health', (req, res) => {
  res.send('VSR Governance API is live');
});

app.get('/power', async (req, res) => {
  const { wallet } = req.query;
  if (!wallet) return res.status(400).json({ error: 'Missing wallet address' });

  try {
    const connection = new Connection(HELIUS_RPC, 'confirmed');
    const walletKey = new PublicKey(wallet);

    // Placeholder logic
    res.json({ wallet, governancePower: 'TBD - integrate VSR logic here' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.listen(port, () => {
  console.log(`VSR API running on port ${port}`);
});