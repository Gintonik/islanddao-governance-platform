
# SPL Governance IDL SDK

The **Governance SDK** is a TypeScript-based library enabling developers to create, manage, and interact with the SPL Governance program on the Solana blockchain. It simplifies building governance applications by abstracting low-level blockchain operations into intuitive APIs.

---

## **Setup Instructions**

### **1. Install the package**
```bash
npm i governance-idl-sdk
```

### 2. Working with the SDK:

i. Create an spl-governance instance:
```
import { SplGovernance } from "governance-idl-sdk";
import { Connection } from "@solana/web3.js";

const connection = new Connection("RPC_ENDPOINT");
const splGovernance = new SplGovernance(
   connection,
   optionalProgramId // if custom governance program is used
);
```

ii. Fetch spl-governance data:
```
// Fetch all Realms accounts (v2)
const realms = await splGovernance.getAllRealms()

// Fetch proposal from its public key
const proposalAddress = new PublicKey("4HxrP3R6A6GcUv62VHG331gwJKNhrqHKF438oRztzz2r")
const proposal = await splGovernance.getProposalByPubkey(proposalAddress)
```

iii. Create spl-governance instructions:
```
// Create a new Realm instruction
 const createRealmIx = await splGovernance.createRealmInstruction(
    realmName,
    communityToken, // mint of the community token
    1, // minimum community tokens required to create the governance
    signer.publicKey, // realm authority
    undefined, // optional weight source
    councilToken, // mint of the council token
    "liquid", // community token type
    "membership" // council token type
)

// Deposit governing tokens instruction
const depositForSignerTwoIx = await splGovernance.depositGoverningTokensInstruction(
    realmAddress,
    communityToken,
    depositorAta,
    depositor,
    depositor,
    depositor,
    1
)
```
iv. Working with spl-governance PDAs
```
// Derive Realm Address
const realmAddress = splGovernance.pda.realmAccount({name: multisigName}).publicKey

// Derive Governance address
const governanceAddress = splGovernance.pda.governanceAccount({realmAccount: realmAddress, seed: governanceSeed}).publicKey
```

---

## **Repository Structure**


### **Files in `src/`**

1. **`account.ts`**  
   - **Description**: Contains logic for managing accounts related to the governance system. This may include creating, updating, or querying accounts on the Solana blockchain.

2. **`constant.ts`**  
   - **Description**: Stores constants used throughout the SDK, such as program IDs, default configurations, and common values shared across modules.

3. **`index.ts`**  
   - **Description**: Serves as the entry point for the `src` directory, exporting functionalities from other files like `account.ts`, `constant.ts`, and others for easy use.

4. **`ix_filter.ts`**  
   - **Description**: Implements filtering logic for instructions, likely used to parse or validate specific instructions in governance-related transactions.

5. **`pda.ts`**  
   - **Description**: Contains logic for Program Derived Addresses (PDAs) used in Solana, likely for managing unique accounts or identifying governance-related entities.

6. **`types.ts`**  
   - **Description**: Defines TypeScript types and interfaces used throughout the SDK to ensure type safety and consistent data structures.


### **Files in `src/instructions/`**

1. **`add_signatory.ts`**  
  - **Description**: Adds a signatory to a proposal. This allows specific users to sign off on or approve actions related to governance.

2. **`cancel_proposal.ts`**  
   - **Description**: Implements the functionality for canceling an active proposal. This might be used when a proposal is no longer valid or necessary.

3. **`cast_vote.ts`**  
   - **Description**: Enables members of the governance system to cast votes on proposals.

4. **`complete_proposal.ts`**  
   - **Description**: Marks a proposal as completed after it has been executed or resolved.

5. **`create_governance.ts`**  
   - **Description**: Creates a governance account, defining its parameters and rules.

6. **`create_native_treasury.ts`**  
  - **Description**: Sets up a native treasury account to manage funds for governance.

7. **`create_proposal.ts`**  
   - **Description**:Defines the logic for creating new proposals within the governance system.

8. **`create_realm.ts`**  
   - **Description**: Initializes a realm, which is a central component of governance, grouping members and proposals.

9. **`create_token_owner_record.ts`**  
   - **Description**: Establishes a record for token owners, linking them to their governance rights and privileges.

10. **`deposit_governing_tokens.ts`**  
    - **Description**: Handles depositing governance tokens into the system, allowing token holders to participate in governance.

11. **`execute_transaction.ts`**  
    - **Description**: Executes a transaction that has been approved via governance voting.

12. **`finalize_vote.ts`**  
    - **Description**: Finalizes a vote on a proposal, determining whether it passes or fails based on the voting results.

13. **`insert_transaction.ts`**  
    - **Description**: Inserts a transaction into a proposal, enabling the execution of specific actions upon proposal approval.

14. **`post_message.ts`**  
    - **Description**: Posts a message related to governance, such as proposal updates or community notifications.

15. **`refund_proposal_deposit.ts`**  
    - **Description**: Handles refunding the deposit required to create a proposal if the proposal is canceled or rejected.

16. **`relinquish_vote.ts`**  
    - **Description**: Allows a voter to relinquish their vote before a proposal is finalized.

17. **`remove_transaction.ts`**  
    - **Description**: Removes a transaction from a proposal, usually before the proposal is executed.

18. **`revoke_governing_tokens.ts`**  
    - **Description**: Handles revoking governance tokens, often in situations where members leave or lose their privileges.

19. **`set_governance_config.ts`**  
    - **Description**: Updates the configuration of a governance account.

20. **`set_governance_delegate.ts`**  
    - **Description**: Assigns or updates a delegate for governance, allowing another user to act on behalf of the token owner.

21. **`set_realm_authority.ts`**  
    - **Description**: Sets the authority for a realm, giving specific rights to manage and configure governance settings.

22. **`set_realm_config.ts`**  
    - **Description**: Updates the configuration of a realm, adjusting parameters like membership rules.

23. **`sign_off_proposal.ts`**  
    - **Description**: Allows a user to sign off on a proposal, completing one step of the approval process.

24. **`withdraw_governing_tokens.ts`**  
    - **Description**: Enables users to withdraw their governance tokens from the system, potentially relinquishing their governance rights.

25. **`index.ts`**  
    - **Description**: Acts as an aggregator, exporting all the instructions in this directory for external use.

### **Files in `src/idl/`**

1. **`addin.json`**  
   - **Description**: Likely contains the Interface Definition Language (IDL) for an add-in program or module related to the governance system. This file defines the structure, accounts, and methods supported by the add-in program.

2. **`chat.json`**  
   - **Description**: Represents the IDL for a chat-related program or functionality. It specifies the schema for accounts and instructions to handle governance-related discussions or messages.

3. **`gov.json`**  
   - **Description**: Contains the IDL for the primary governance program. This file outlines the structure of governance accounts, instructions, and methods critical to managing proposals, votes, and realms.

4. **`idl.ts`**  
   - **Description**: A TypeScript file that likely provides utility functions or type definitions for working with the JSON IDL files. It might include methods for parsing, validating, or using the IDL files within the SDK.

### **Purpose of `dist/`**
The `dist/` directory contains the compiled and bundled output of the SDK. It provides various formats (`.js`, `.mjs`, `.d.ts`) to support different environments, including:
- CommonJS (`index.js`)
- ES Modules (`index.mjs`)
- TypeScript projects (`index.d.ts` and `index.d.mts`)

### **Files in `dist/`**

1. **`index.d.mts`**  
   - **Description**: The `.d.mts` file is a type declaration file generated for use in projects that support ES Modules (`.mjs`). It provides TypeScript type information for the SDK when using ES module syntax.

2. **`index.d.ts`**  
   - **Description**: A TypeScript declaration file providing type definitions for the SDK. This file enables developers to use the SDK with full type support in TypeScript projects.

3. **`index.js`**  
   - **Description**: The compiled JavaScript file containing the main logic of the SDK. This file is used in CommonJS module systems (`require` syntax) for projects that do not support ES Modules.

4. **`index.js.map`**  
   - **Description**: A source map file for `index.js`. It maps the compiled JavaScript code back to the original TypeScript source code, making debugging easier.

5. **`index.mjs`**  
   - **Description**: The compiled JavaScript file in ES Module format (`import/export` syntax). This is used in modern JavaScript environments that support ES Modules.

6. **`index.mjs.map`**  
   - **Description**: A source map file for `index.mjs`. It provides a mapping to the original TypeScript source code, useful for debugging in environments that support ES Modules.


### **Purpose of `tests/`**
The `tests/` directory provides unit and integration tests to validate the SDK’s functionality, ensuring:
- Governance instructions are properly implemented.
- RPC calls function as expected and return valid responses.
  
### **Files in `tests/`**

1. **`instructions.ts`**  
   - **Description**: Contains test cases for the instruction-related functionality of the SDK. Likely verifies that instructions (e.g., `createProposal`, `castVote`) are constructed correctly and behave as expected.

2. **`rpc.ts`**  
   - **Description**: Includes tests related to Remote Procedure Calls (RPCs) used by the SDK. Likely tests interactions with Solana RPC endpoints, such as submitting transactions or fetching account data.


---

## **Usage**

This SDK provides an intuitive API to interact with the SPL Governance program. Import the SDK and use the provided `SplGovernance` client for all operations, including creating proposals, casting votes, and initializing governance configurations.

---

## **Contributing**

We welcome contributions to enhance the SDK. Please follow these steps:

### **How to Contribute**
1. Fork the repository.
2. Create a feature branch.
3. Implement your changes, ensuring all tests pass. (if applicable)
4. Submit a pull request with a clear description.

### **Contribution Guidelines**
- Follow the existing code style and structure.
- Write tests for any new features or modifications.
- Include detailed comments and documentation.

---

## **Contact**

For support, feature requests, or bug reports, open an issue on the [GitHub repository](https://github.com/Mythic-Project/governance-sdk/issues).
