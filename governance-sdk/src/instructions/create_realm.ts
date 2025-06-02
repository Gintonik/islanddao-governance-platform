import { PublicKey } from "@solana/web3.js";
import {Program} from "@coral-xyz/anchor";
import BN from "bn.js";
import { MintMaxVoteWeightSource } from "../types";
import { PdaClient } from "../pda";
import { GovernanceIdl } from "../idl/idl";
import ixFilter from "../ix_filter";

export default async function _createRealmContext(
    name: string, 
    communityTokenMint: PublicKey,
    minCommunityWeightToCreateGovernance: BN | number,
    communityMintMaxVoterWeightSource: MintMaxVoteWeightSource,
    communityTokenType: "liquid" | "membership" | "dormant",
    councilTokenType: "liquid" | "membership" | "dormant",
    program: Program<GovernanceIdl>,
    payer: PublicKey,
    pda: PdaClient,
    councilTokenMint?: PublicKey,
    communityVoterWeightAddinProgramId?: PublicKey,
    maxCommunityVoterWeightAddinProgramId?: PublicKey,
    councilVoterWeightAddinProgramId?: PublicKey,
    maxCouncilVoterWeightAddinProgramId?: PublicKey,
) {    
    const commuintyGoverningTokenType = communityTokenType === "liquid" ? { liquid: {}}
    : communityTokenType === "membership" ? { membership: {}}
    : { dormant: {}}

    const councilGoverningTokenType = councilTokenType === "liquid" ? { liquid: {}}
    : councilTokenType === "membership" ? { membership: {}}
    : { dormant: {}}

    const realmAccount = pda.realmAccount({name}).publicKey

    const communityTokenHoldingAccount = pda.communityTokenHoldingAccount({
        realmAccount: realmAccount, 
        communityMint: communityTokenMint
    }).publicKey

    const councilTokenHoldingAccount = councilTokenMint ? 
        pda.councilTokenHoldingAccount({
            realmAccount: realmAccount, 
            councilMint: councilTokenMint ? councilTokenMint : communityTokenMint
        }).publicKey
    :   null;

    const realmConfigAccount = pda.realmConfigAccount({realmAccount}).publicKey

    const minCommunityWeight = typeof minCommunityWeightToCreateGovernance === "number" ?
        new BN(minCommunityWeightToCreateGovernance) :
        minCommunityWeightToCreateGovernance

    const defaultIx = await program.methods.createRealm(name, {
        useCouncilMint: councilTokenMint !== undefined,
        minCommunityWeightToCreateGovernance: minCommunityWeight,
        communityMintMaxVoterWeightSource: communityMintMaxVoterWeightSource.type === "absolute" ? 
            {absolute: [communityMintMaxVoterWeightSource.amount]} : 
            {supplyFraction: [communityMintMaxVoterWeightSource.amount]}
        ,
        communityTokenConfigArgs: {
            useVoterWeightAddin: communityVoterWeightAddinProgramId !== undefined,
            useMaxVoterWeightAddin: maxCommunityVoterWeightAddinProgramId !== undefined,
            tokenType: commuintyGoverningTokenType
        },
        councilTokenConfigArgs: {
            useVoterWeightAddin: councilVoterWeightAddinProgramId !== undefined,
            useMaxVoterWeightAddin: maxCouncilVoterWeightAddinProgramId !== undefined,
            tokenType: councilGoverningTokenType
        }
    }).accounts({
        realmAccount,
        realmAuthority: payer,
        payer,
        communityTokenMint,
        communityTokenHoldingAccount,
        councilTokenMint: councilTokenMint ?? null,
        councilTokenHoldingAccount,
        realmConfig: realmConfigAccount,
        communityVoterWeightAddin: communityVoterWeightAddinProgramId ?? null,
        maxCommunityVoterWeightAddin: maxCommunityVoterWeightAddinProgramId ?? null,
        councilVoterWeightAddin: councilVoterWeightAddinProgramId ?? null,
        maxCouncilVoterWeightAddin: maxCouncilVoterWeightAddinProgramId ?? null
    }).instruction();

    return ixFilter(defaultIx, "createRealm", program);
}
