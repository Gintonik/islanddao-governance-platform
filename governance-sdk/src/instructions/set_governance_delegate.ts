import { PublicKey } from "@solana/web3.js";
import { Program } from "@coral-xyz/anchor";
import ixFilter from "../ix_filter";
import { GovernanceIdl } from "../idl/idl";

export default async function _setGovernanceDelegateContext(
    tokenOwnerRecord: PublicKey,
    currentDelegateOrOwner: PublicKey,
    newGovernanceDelegate: PublicKey | null,
    program: Program<GovernanceIdl>,
) {
    const defaultIx = await program.methods.setGovernanceDelegate(newGovernanceDelegate)
    .accounts({
        currentDelegateOrOwner,
        tokenOwnerRecord
    })
    .instruction();

    return ixFilter(defaultIx, "setGovernanceDelegate", program);
}