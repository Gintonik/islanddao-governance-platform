/**
 * Analyze the current lockup detection logic to understand the issue
 * Test with Takisoul's specific deposits to see what's happening
 */

// Simulate the current lockup detection logic
function simulateCurrentLogic() {
  const currentTime = Math.floor(Date.now() / 1000);
  console.log(`Current timestamp: ${currentTime} (${new Date().toISOString()})\n`);
  
  // Takisoul's deposits based on investigation
  const deposits = [
    {
      amount: 1500000,
      offset: 184,
      lockups: [
        { kind: 3, startTs: 1718755200, endTs: 1718841600, name: "Vesting 2024-06-19 → 2025-06-19" },
        { kind: 3, startTs: 1719993600, endTs: 1727740800, name: "Vesting 2024-07-03 → 2024-10-01 (EXPIRED)" }
      ]
    },
    {
      amount: 2000000,
      offset: 264, 
      lockups: [
        { kind: 3, startTs: 1719993600, endTs: 1727740800, name: "Vesting 2024-07-03 → 2024-10-01 (EXPIRED)" },
        { kind: 3, startTs: 1715644800, endTs: 1721347200, name: "Vesting 2025-05-14 → 2025-07-13" }
      ]
    },
    {
      amount: 3682784.632,
      offset: 344,
      lockups: [
        { kind: 3, startTs: 1715644800, endTs: 1721347200, name: "Vesting 2025-05-14 → 2025-07-13" }
      ]
    }
  ];
  
  // VSR multiplier calculation (same as in calculator)
  function calculateVSRMultiplier(lockup, now = currentTime) {
    const BASE = 1_000_000_000;
    const MAX_EXTRA = 3_000_000_000;
    const SATURATION_SECS = 31_536_000;

    const { kind, startTs, endTs } = lockup;
    if (kind === 0) return 1.0;

    const duration = Math.max(endTs - startTs, 1);
    const remaining = Math.max(endTs - now, 0);

    let bonus = 0;

    if (kind === 1 || kind === 4) { // Cliff, Monthly
      const ratio = Math.min(1, remaining / SATURATION_SECS);
      bonus = MAX_EXTRA * ratio;
    } else if (kind === 2 || kind === 3) { // Constant, Vesting
      const unlockedRatio = Math.min(1, Math.max(0, (now - startTs) / duration));
      const lockedRatio = 1 - unlockedRatio;
      const ratio = Math.min(1, (lockedRatio * duration) / SATURATION_SECS);
      bonus = MAX_EXTRA * ratio;
    }

    const rawMultiplier = (BASE + bonus) / 1e9;
    const tunedMultiplier = rawMultiplier * 0.985;
    return Math.round(tunedMultiplier * 1000) / 1000;
  }
  
  // Simulate current "best multiplier" logic
  for (const deposit of deposits) {
    console.log(`=== Deposit: ${deposit.amount.toLocaleString()} ISLAND (offset ${deposit.offset}) ===`);
    
    let bestMultiplier = 1.0;
    let bestLockup = null;
    
    for (const lockup of deposit.lockups) {
      const multiplier = calculateVSRMultiplier(lockup, currentTime);
      const isExpired = lockup.endTs <= currentTime;
      
      console.log(`Lockup: ${lockup.name}`);
      console.log(`  Start: ${lockup.startTs} (${new Date(lockup.startTs * 1000).toISOString()})`);
      console.log(`  End: ${lockup.endTs} (${new Date(lockup.endTs * 1000).toISOString()})`);
      console.log(`  Expired: ${isExpired}`);
      console.log(`  Calculated multiplier: ${multiplier}x`);
      
      if (multiplier > bestMultiplier) {
        bestMultiplier = multiplier;
        bestLockup = lockup;
        console.log(`  *** NEW BEST MULTIPLIER: ${multiplier}x ***`);
      }
      console.log('');
    }
    
    const power = deposit.amount * bestMultiplier;
    console.log(`Final: ${deposit.amount.toLocaleString()} × ${bestMultiplier}x = ${power.toLocaleString()} power`);
    console.log(`Selected lockup: ${bestLockup ? bestLockup.name : 'None'}\n`);
  }
  
  console.log('=== ANALYSIS ===');
  console.log('The issue is that the current logic always takes the HIGHEST multiplier found,');
  console.log('even if that lockup has expired. It should ignore expired lockups entirely');
  console.log('or only consider active lockups for multiplier calculation.');
}

simulateCurrentLogic();