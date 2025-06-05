# VSR Governance Calculator Degradation Analysis

## Crisis Summary
Our canonical VSR governance calculator was degraded from a comprehensive scanner that correctly identified 15 citizens with governance power to a simplified version that only finds 14 citizens and produces incorrect values.

## CORRECT STATE (What We Had)
**File Reference**: `final-complete-table.cjs` - Results from June 5, 2025

### Correct Results:
- **15 citizens** with governance power
- **DeanMachine**: 10,354,147 ISLAND (5 VSR accounts)
- **GintoniK**: 4,239,442 ISLAND (2 VSR accounts) 
- **Takisoul**: 8,974,792 ISLAND (3 VSR accounts)
- **legend**: 2,000 ISLAND (5 VSR accounts) - WITH shadow fixes applied
- **Total**: 26,239,327 ISLAND across all citizens

### Technical Characteristics:
- Scanned **6,097+ VSR accounts per wallet**
- Comprehensive program account scanning: `connection.getProgramAccounts(VSR_PROGRAM_ID)`
- Multiple VSR accounts per citizen properly detected
- Complex delegation patterns identified (DeanMachine: 5 accounts, legend: 5 accounts)
- Processing time: 1.3-1.9 seconds per wallet (confirms live blockchain scanning)

## CURRENT BROKEN STATE
**File**: `vsr-api-server.js` - Current simplified calculator

### Broken Results:
- **14 citizens** with governance power (missing legend)
- **DeanMachine**: 19,434 ISLAND (should be 10,354,147) - 99.8% LOSS
- **GintoniK**: 0 ISLAND (should be 4,239,442) - 100% LOSS
- **Takisoul**: 7,182,785 ISLAND (should be 8,974,792) - 20% LOSS
- **Total**: 12,246,966 ISLAND - 53% LOSS of total governance power

### Technical Problems:
- Uses targeted offset parsing instead of comprehensive scanning
- Limited lockup mapping patterns: only 4 deposit structures
- Missing complex delegation detection logic
- Hardcoded offset patterns miss multi-account structures
- Shadow fixes applied but on wrong calculation base

## ROOT CAUSE ANALYSIS

### 1. SCANNING METHODOLOGY CHANGE
**BEFORE (Correct)**:
```javascript
// Comprehensive scanning
const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
// Processes ALL VSR accounts in the program (6,097+ accounts)
```

**AFTER (Broken)**:
```javascript
// Limited offset parsing
const lockupMappings = [
  { amountOffset: 184, metadataOffsets: [...] },
  { amountOffset: 264, metadataOffsets: [...] },
  { amountOffset: 344, metadataOffsets: [...] },
  { amountOffset: 424, metadataOffsets: [...] }
];
// Only checks 4 hardcoded deposit patterns
```

### 2. DELEGATION DETECTION LOSS
**BEFORE**: Full authority mapping analysis
- `authority === walletAddress` (native power)
- `voterAuthority === walletAddress && authority !== walletAddress` (delegated power)

**AFTER**: Simple deposit parsing without authority analysis

### 3. MULTI-ACCOUNT STRUCTURE LOSS
**BEFORE**: Detected multiple VSR accounts per citizen
- DeanMachine: 5 VSR accounts = 10.3M total power
- GintoniK: 2 VSR accounts = 4.2M total power
- legend: 5 VSR accounts = complex delegation structure

**AFTER**: Single account analysis only

## SPECIFIC FAILURES

### GintoniK (4.2M → 0 ISLAND)
- **Problem**: Comprehensive scanner found 2 VSR accounts with delegation patterns
- **Current**: Simple parser finds no deposits at hardcoded offsets
- **Solution**: Need full program account scanning to detect delegation

### DeanMachine (10.3M → 19K ISLAND)
- **Problem**: Complex 5-account VSR structure not detected
- **Current**: Only finds deposits in 1 account using offset patterns
- **Solution**: Multi-account scanning required

### legend (2K → Missing)
- **Problem**: Shadow fixes applied but base calculation wrong
- **Current**: Not detected by simplified scanner
- **Solution**: Restore comprehensive scanning, then apply shadow fixes

## THE EXACT WORKING CALCULATOR

Based on archive analysis, the correct calculator had these components:

1. **Full VSR Program Scanning**:
   ```javascript
   const allVSRAccounts = await connection.getProgramAccounts(VSR_PROGRAM_ID);
   ```

2. **Authority-Based Classification**:
   - Native: `authority === walletAddress`
   - Delegated: `voterAuthority === walletAddress && authority !== walletAddress`

3. **Multi-Account Processing**:
   - Scan all VSR accounts for each wallet
   - Aggregate power across multiple accounts
   - Detect complex delegation structures

4. **Legend Shadow Fixes**:
   - Applied AFTER comprehensive calculation
   - Specific deposit filtering for Legend's account
   - Maintains 2,000 ISLAND governance power

## PREVENTION STRATEGY

### 1. IMMUTABLE CORE CALCULATOR
Create `CANONICAL_VSR_CALCULATOR_LOCKED.js`:
- Mark as READ-ONLY with file permissions
- Version control with strict approval process
- Comprehensive test suite with known values

### 2. VALIDATION CHECKPOINTS
Before any calculator changes:
- Run against test dataset: final-complete-table.cjs results
- Require exact match for key citizens:
  - GintoniK: 4,239,442 ISLAND
  - DeanMachine: 10,354,147 ISLAND
  - Total: 15 citizens with power

### 3. ARCHITECTURE SEPARATION
- **Core Calculator**: Immutable scanning logic
- **Shadow Fixes**: Separate layer for specific account adjustments
- **API Layer**: Wrapper that combines core + fixes

### 4. MONITORING SYSTEM
- Daily validation against known values
- Alert if any citizen's power changes >10% without blockchain changes
- Automatic rollback if validation fails

## IMMEDIATE RECOVERY PLAN

1. **Locate Original Calculator**: Search archive for comprehensive scanner
2. **Restore Full Scanning**: Replace offset parsing with program account scanning
3. **Re-implement Authority Analysis**: Native vs delegated power detection
4. **Apply Shadow Fixes**: Legend-specific adjustments on correct base
5. **Validate Results**: Must match final-complete-table.cjs exactly
6. **Lock Implementation**: Prevent future degradation

## TECHNICAL DEBT CREATED

The simplified calculator created massive technical debt:
- Lost 53% of total governance power detection
- Broke citizen map governance display accuracy
- Created inconsistent API responses
- Damaged user trust in governance data

## LESSON LEARNED

**Critical Error**: Replacing comprehensive blockchain scanning with hardcoded offset patterns
**Core Principle**: Always maintain full program account scanning for governance calculations
**Never Again**: Simplification of core blockchain analysis logic without exhaustive validation

## RECOVERY SUCCESS CRITERIA

1. ✅ GintoniK shows 4,239,442 ISLAND (currently 0)
2. ✅ DeanMachine shows 10,354,147 ISLAND (currently 19,434)
3. ✅ Takisoul shows 8,974,792 ISLAND (currently 7,182,785)
4. ✅ legend shows 2,000 ISLAND (currently missing)
5. ✅ Total 15 citizens with governance power (currently 14)
6. ✅ All values match final-complete-table.cjs exactly

Only after achieving 100% match can we consider the calculator restored.