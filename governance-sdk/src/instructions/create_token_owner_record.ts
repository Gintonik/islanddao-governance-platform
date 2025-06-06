import { Program } from "@coral-xyz/anchor";
import {PublicKey } from "@solana/web3.js";
import { GovernanceIdl } from "../idl/idl";
import ixFilter from "../ix_filter";
import { PdaClient } from "../pda";

export default async function _createTokenOwnerRecordContext(
    realmAccount: PublicKey,
    governingTokenOwner: PublicKey,
    governingTokenMint: PublicKey,
    payer: PublicKey,
    program: Program<GovernanceIdl>,
    pda: PdaClient,
) {
    const tokenOwnerRecord = pda.tokenOwnerRecordAccount({realmAccount, governingTokenMintAccount: governingTokenMint, 
    governingTokenOwner}).publicKey

    const defaultIx = await program.methods.createTokenOwnerRecord()
    .accounts({
        realmAccount,
        payer,
        governingTokenOwnerAccount: governingTokenOwner,
        governingTokenMint,
        tokenOwnerRecord
    })
    .instruction()

    return ixFilter(defaultIx, "createTokenOwnerRecord", program);

}