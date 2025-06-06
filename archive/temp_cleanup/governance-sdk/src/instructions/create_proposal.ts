import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { GovernanceIdl } from "../idl/idl";
import ixFilter from "../ix_filter";
import { PdaClient } from "../pda";
import { VoteType } from "../types";

export default async function _createProposalContext(
    name: string,
    descriptionLink: string,
    voteType: VoteType,
    options: [string],
    useDenyOption: boolean,
    realmAccount: PublicKey,
    governanceAccount: PublicKey,
    tokenOwnerRecord: PublicKey,
    governingTokenMint: PublicKey,
    governanceAuthority: PublicKey,
    payer: PublicKey,
    program: Program<GovernanceIdl>,
    pda: PdaClient,
    proposalSeed?: PublicKey,
    voterWeightRecord?: PublicKey
) {

    const seed = proposalSeed ?? Keypair.generate().publicKey
    const proposalAccount = pda.proposalAccount({governanceAccount, governingTokenMint, proposalSeed: seed}).publicKey
    const realmConfig = pda.realmConfigAccount({realmAccount}).publicKey

    const proposalDepositAccount = pda.proposalDepositAccount({
        proposal: proposalAccount, 
        depositPayer: payer
    }).publicKey

    const voteTypeMod = voteType.choiceType === "single" ? 
        {singleChoice: {}}
    :
        {multiChoice: {
            ...voteType.multiChoiceOptions!,
            choiceType: voteType.multiChoiceOptions!.choiceType === "fullWeight" ? {fullWeight: {}} : {weighted: {}},
        }}


    const defaultIx = await program.methods.createProposal(
        name,
        descriptionLink,
        voteTypeMod,
        options,
        useDenyOption,
        seed
    )
    .accounts({
        realmAccount,
        proposalAccount,
        governanceAccount,
        tokenOwnerRecord,
        governingTokenMint,
        governanceAuthority,
        voterWeightRecord: voterWeightRecord ?? null,
        realmConfig,
        proposalDepositAccount,
        payer
    })
    .instruction();

    return ixFilter(defaultIx, "createProposal", program);
}
