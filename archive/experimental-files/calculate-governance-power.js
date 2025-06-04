import { AnchorProvider, Program, setProvider } from "@coral-xyz/anchor";
import { Connection, PublicKey } from "@solana/web3.js";
import vsrIdl from "./vsr-idl.json" assert { type: "json" };

const VSR_PROGRAM_ID = new PublicKey("vsr2nfGVNHmSY8uxoBGqq8AQbwz3jwaEaHqGbsTPXqQ");
const RPC_URL = "https://mainnet.helius-rpc.com/?api-key=088dfd59-6d2e-4695-a42a-2e0c257c2d00"

const connection = new Connection(RPC_URL);
const provider = new AnchorProvider(connection, {}, AnchorProvider.defaultOptions());
setProvider(provider);

const program = new Program(vsrIdl, VSR_PROGRAM_ID, provider);

/**
 * Canonically calculates native governance power for a wallet.
 */
export async function calculateGovernancePower(walletAddress) {
  const wallet = new PublicKey(walletAddress);
  let nativePower = 0;

  const voterAccounts = await program.account.voter.all([
    {
      memcmp: {
        offset: 8, // authority field
        bytes: wallet.toBase58(),
      },
    },
  ]);

  for (const { account: voter } of voterAccounts) {
    for (const entry of voter.depositEntries) {
      if (!entry.isUsed || entry.amountDepositedNative.toNumber() === 0) continue;

      const now = Math.floor(Date.now() / 1000);
      const endTs = entry.lockup.endTs.toNumber();
      const startTs = entry.lockup.startTs.toNumber();
      const kind = entry.lockup.kind.lockupKind;

      // Skip unlocked
      if (endTs <= now) continue;

      let multiplier = 0;

      switch (kind) {
        case { cliff: {} }:
          multiplier = 2.0;
          break;
        case { linear: {} }:
          multiplier = 1.5;
          break;
        case { constant: {} }:
          multiplier = 1.25;
          break;
        default:
          multiplier = 1.0;
      }

      const amount = entry.amountDepositedNative.toNumber();
      nativePower += Math.floor(amount * multiplier);
    }
  }

  return {
    wallet: walletAddress,
    nativePower,
    delegatedPower: 0,
    totalPower: nativePower,
  };
}

// To test:
calculateGovernancePower("3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt").then(console.log);
