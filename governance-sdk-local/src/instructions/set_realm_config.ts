import { Program } from "@coral-xyz/anchor";
import {PublicKey } from "@solana/web3.js";
import { GovernanceIdl } from "../idl/idl";
import ixFilter from "../ix_filter";
import { RealmConfigArgs, SetRealmAuthorityAction } from "../types";
import { PdaClient } from "../pda";

export default async function _setRealmConfigContext(
    config: RealmConfigArgs,
    realmAccount: PublicKey,
    realmAuthority: PublicKey,
    payer: PublicKey,
    program: Program<GovernanceIdl>,
    pda: PdaClient,
    councilTokenMint?: PublicKey,
    communityVoterWeightAddinProgramId?: PublicKey,
    maxCommunityVoterWeightAddinProgramId?: PublicKey,
    councilVoterWeightAddinProgramId?: PublicKey,
    maxCouncilVoterWeightAddinProgramId?: PublicKey,
) {
    const realmConfig = pda.realmConfigAccount({realmAccount}).publicKey

    const councilTokenHoldingAccount = councilTokenMint ? 
        pda.councilTokenHoldingAccount({
            realmAccount: realmAccount, 
            councilMint: councilTokenMint
        }).publicKey
    :   null;

    const defaultIx = await program.methods.setRealmConfig(config)
    .accounts({
        realmAccount,
        realmAuthority,
        payer,
        realmConfig,
        councilTokenMint: councilTokenMint ?? null,
        councilTokenHoldingAccount,
        communityVoterWeightAddinProgramId: communityVoterWeightAddinProgramId ?? null,
        maxCommunityVoterWeightAddinProgramId: maxCommunityVoterWeightAddinProgramId ?? null,
        councilVoterWeightAddinProgramId: councilVoterWeightAddinProgramId ?? null,
        maxCouncilVoterWeightAddinProgramId: maxCouncilVoterWeightAddinProgramId ?? null
    })
    .instruction()

    return ixFilter(defaultIx, "setRealmConfig", program);

}