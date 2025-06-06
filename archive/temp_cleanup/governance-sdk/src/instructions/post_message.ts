import { AnchorProvider, Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey } from "@solana/web3.js";
import { GovernanceIdl } from "../idl/idl";
import ixFilter from "../ix_filter";
import idl from "../idl/chat.json";
import { ChatIdl } from "../idl/idl";
import { MessageBody } from "../types";
import { PdaClient } from "../pda";

export default async function _postMessageContext(
    isReply: boolean,
    messageBody: string,
    messageType: "text" | "reaction",
    chatMessageAccount: PublicKey,
    governanceProgramId: PublicKey,
    realmAccount: PublicKey,
    governanceAccount: PublicKey,
    proposalAccount: PublicKey,
    tokenOwnerRecord: PublicKey,
    governanceAuthority: PublicKey,
    provider: AnchorProvider,
    pda: PdaClient,
    payer: PublicKey,
    replyTo?: PublicKey,
    voterWeightRecord?: PublicKey
) {
    const chatProgramId = new PublicKey(idl.metadata.address);
    const chatProgram = new Program<ChatIdl>(idl as ChatIdl, chatProgramId, provider);

    const message: MessageBody = messageType === "text" ?
        {text: [messageBody]} :
        {reaction: [messageBody]}

    const realmConfigAccount = pda.realmConfigAccount({realmAccount}).publicKey

    const defaultIx = await chatProgram.methods.postMessage(
        message,
        isReply
    ). accounts({
        governanceProgramId,
        realmAccount,
        governanceAccount,
        proposalAccount,
        tokenOwnerRecord,
        governanceAuthority,
        chatMessage: chatMessageAccount,
        payer,
        realmConfigAccount,
        replyToMessage: replyTo ?? null,
        voterWeightRecord: voterWeightRecord ?? null
    })
    .instruction()

    return ixFilter(defaultIx, "postMessage", chatProgram);

}