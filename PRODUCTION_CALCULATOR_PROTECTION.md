# PRODUCTION CALCULATOR PROTECTION

## CRITICAL: DO NOT MODIFY vsr-api-server.js

## INTEGRATION POINTS SECURED:

✅ **Daily Sync Process:** `citizen-map/simple-server.cjs` line 253
   - Uses: `http://localhost:3001/api/governance-power`
   - Scheduled: Daily at 00:00 UTC

✅ **Citizen Map Data:** `sync-governance-to-map.js` line 21
   - Uses: `http://localhost:3001/api/governance-power`
   - Updates: `citizen-map/data/governance-power.json`

✅ **Database Updates:** Citizen map server line 267
   - Syncs authentic values to PostgreSQL database
   - Updates: native_governance_power, total_governance_power

## EXPERIMENTAL FILES ARCHIVED:
All experimental calculator files moved to: `archive/experimental-calculators/`

## WARNING:
Any modification to `vsr-api-server.js` will break authentic governance calculations.
All governance power must flow through this single source of truth.
