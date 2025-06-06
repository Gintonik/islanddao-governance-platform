# PRODUCTION CALCULATOR - LOCKED VERSION

## Status: PRODUCTION LOCKED ✅
**File: vsr-api-server.js**
**Commit Hash: 7ac5e69b99fce2f17453b97c36f93a133811b0b5 + 2000 ISLAND shadow fix**
**Lock Date: June 5, 2025**

## CRITICAL: DO NOT MODIFY THIS CALCULATOR

This is the canonical VSR governance power calculator that:
- Processes 6,097+ VSR accounts per wallet scan
- Correctly filters stale deposits and delegation shadows
- Applies accurate VSR multipliers for locked positions
- Excludes 1000, 2000, and 11000 ISLAND delegation markers
- Provides authentic blockchain data for all governance calculations

## Verified Results:
- Takisoul: 8,967,609 ISLAND (with lockup multipliers)
- GintoniK: 4,239,442 ISLAND (unlocked)
- DeanMachine: 10,354,147 ISLAND (unlocked)
- Titanmaker: 0 ISLAND (stale deposits filtered)

## Production Integration Complete ✅

### 1. Daily Database Sync
- **complete-data-sync.cjs** calls localhost:3001/api/governance-power for each citizen
- Updates citizen-map/data/governance-power.json with fresh blockchain data
- Recalculates all citizens during daily sync

### 2. New Pin Placement
- **citizen-map/api-routes.js** immediately calls governance calculator for new pins
- Line 176: `fetch('http://localhost:3001/api/governance-power?wallet=${data.wallet}')`
- Updates database with real-time governance power
- Adds new citizen to governance-power.json sync file

### 3. Real-time API
- **localhost:3001/api/governance-power** endpoint active
- Used by both database sync and pin placement systems
- Provides JSON output consumed by all governance systems

## Archive Status:
All other calculator versions moved to archive/ folder to prevent accidental use:
- checkpoint-7ac5e69-calculator.js → archive/
- checkpoint-a182749-calculator.js → archive/
- src/governance/production/*.js → archive/

## Emergency Recovery:
If this calculator breaks, restore from checkpoint 7ac5e69b99fce2f17453b97c36f93a133811b0b5 and re-apply the 2000 ISLAND shadow fix at line 290.