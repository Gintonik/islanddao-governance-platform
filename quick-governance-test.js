/**
 * Quick governance power test for key citizens
 */

const citizens = [
  { name: "Takisoul", wallet: "7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA" },
  { name: "GintoniK", wallet: "CinHb6Xt2PnqKUkmhRo9hwUkixCcsH1uviuQqaTxwT9i" },
  { name: "Moxie", wallet: "37TGrYNu56AxaeojgtAok8tQAsBSxGhvFKXqCYFAbBrA" },
  { name: "nurtan", wallet: "6aJo6zRiC5CFnuE7cqw4sTtHHknrr69NE7LKxPAfFY9U" },
  { name: "KO3", wallet: "kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC" },
  { name: "Portor", wallet: "9RSpFWGntExNNa6puTVtynmrNAJZRso6w4gFWuMr1o3n" },
  { name: "Alex Perts", wallet: "9WW4oiMyW6A9oP4R8jvxJLMZ3RUss18qsM4yBBHJPj94" },
  { name: "Yamparala Rahul", wallet: "2qYMBZwJhu8zpyEK29Dy5Hf9WrWWe1LkDzrUDiuVzBnk" },
  { name: "Anonymous Citizen", wallet: "GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh" },
  { name: "legend", wallet: "Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG" },
  { name: "SoCal", wallet: "BPmVp1b4vbT2YUHfcFrtErA67nNsJ5LGAJ2BLg5ds9kz" },
  { name: "noclue", wallet: "4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4" },
  { name: "Reijo", wallet: "ADjG92YTwGUxTB3r9SY6Gip4q4xoUQdKq3DA1actaDUd" },
  { name: "DeanMachine", wallet: "3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt" }
];

async function testGovernancePower() {
  console.log("=== FINAL GOVERNANCE POWER RESULTS ===\n");
  
  const results = [];
  
  for (const citizen of citizens) {
    try {
      const response = await fetch(`http://localhost:3001/api/governance-power?wallet=${citizen.wallet}`);
      const data = await response.json();
      
      const nativePower = data.nativeGovernancePower || 0;
      
      if (nativePower > 0) {
        results.push({
          name: citizen.name,
          nativePower,
          deposits: data.deposits ? data.deposits.length : 0
        });
      }
    } catch (error) {
      console.log(`Error processing ${citizen.name}: ${error.message}`);
    }
  }
  
  // Sort by governance power descending
  results.sort((a, b) => b.nativePower - a.nativePower);
  
  console.log("Citizens with Governance Power:\n");
  
  let totalPower = 0;
  
  for (const [index, result] of results.entries()) {
    const rank = index + 1;
    totalPower += result.nativePower;
    
    console.log(`${rank.toString().padStart(2)}. ${result.name.padEnd(20)} ${result.nativePower.toLocaleString().padStart(15)} ISLAND (${result.deposits} deposits)`);
  }
  
  console.log(`\nTotal DAO Power: ${totalPower.toLocaleString()} ISLAND`);
  console.log(`Citizens with Power: ${results.length}`);
  
  return results;
}

testGovernancePower().catch(console.error);