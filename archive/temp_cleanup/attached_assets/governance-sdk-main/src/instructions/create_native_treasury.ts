import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { GovernanceIdl } from "../idl/idl";
import ixFilter from "../ix_filter";
import { PdaClient } from "../pda";

export default async function _createNativeTreasuryContext(
    governanceAccount: PublicKey,
    payer: PublicKey,
    program: Program<GovernanceIdl>,
    pda: PdaClient
) {
    const nativeTreasuryAccount = pda.nativeTreasuryAccount({governanceAccount}).publicKey

    const defaultIx = await program.methods.createNativeTreasury()
    .accounts({
        governanceAccount,
        nativeTreasuryAccount,
        payer
    })
    .instruction()

    return ixFilter(defaultIx, "createNativeTreasury", program);

}