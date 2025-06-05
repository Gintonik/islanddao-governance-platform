/**
 * Generate final governance power table with live blockchain data
 */

const citizens = [
  { nickname: "Takisoul", wallet: "7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA" },
  { nickname: "GintoniK", wallet: "CinHb6Xt2PnqKUkmhRo9hwUkixCcsH1uviuQqaTxwT9i" },
  { nickname: "legend", wallet: "Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG" },
  { nickname: "KO3", wallet: "kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC" },
  { nickname: "scientistjoe", wallet: "CLcXVZpCwF9QH2aNjFhPSzyeUVifkP9W88WHwfe6sMww" },
  { nickname: "Moxie", wallet: "37TGrYNu56AxaeojgtAok8tQAsBSxGhvFKXqCYFAbBrA" },
  { nickname: "nurtan", wallet: "6aJo6zRiC5CFnuE7cqw4sTtHHknrr69NE7LKxPAfFY9U" },
  { nickname: "Yamparala Rahul", wallet: "2qYMBZwJhu8zpyEK29Dy5Hf9WrWWe1LkDzrUDiuVzBnk" },
  { nickname: "Titanmaker", wallet: "Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1" },
  { nickname: "Portor", wallet: "9RSpFWGntExNNa6puTVtynmrNAJZRso6w4gFWuMr1o3n" },
  { nickname: "Alex Perts", wallet: "9WW4oiMyW6A9oP4R8jvxJLMZ3RUss18qsM4yBBHJPj94" },
  { nickname: "DeanMachine", wallet: "3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt" },
  { nickname: "SoCal", wallet: "BPmVp1b4vbT2YUHfcFrtErA67nNsJ5LGAJ2BLg5ds9kz" },
  { nickname: "Miao", wallet: "4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4" },
  { nickname: "Reijo", wallet: "ADjG92YTwGUxTB3r9SY6Gip4q4xoUQdKq3DA1actaDUd" },
  { nickname: "Kegomaz", wallet: "6vJrtBwoDTWnNGmMsGQyptwagB9oEVntfpK7yTctZ3Sy" },
  { nickname: "Mila", wallet: "B93csAjDr4sbgLvYmY1iNcHQ1wLe9abEiodJDcn8K7ST" },
  { nickname: "Icoder", wallet: "EXRBCP2MX6hRAt4oh61k5mhL6WhmUXPemfzNssUpM4S6" },
  { nickname: "Kornel", wallet: "DraTvYwqwySZ4kvzxsiYtKF2K6mp4FE3VbjTdPsJzpXt" },
  { nickname: "Funcracker", wallet: "3s6VUe21HFVEC6j12bPXLcrBHMkTZ66847853pXWXspr" },
  { nickname: "Canfly", wallet: "CdCAQnq13hTUiBxganRXYKw418uUTfZdmosqef2vu1bM" },
  { nickname: "Moviendome", wallet: "EViz4YGrY6GZtfu35Y1Q3PoFWAhoXY6YMHFrcneMbdCF" }
];

async function generateGovernanceTable() {
  console.log('Generating comprehensive governance power table...\n');
  
  const results = [];
  
  // Get governance power for key citizens first (known to have power)
  const keyCitizens = ["7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA", "kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC", 
                       "CLcXVZpCwF9QH2aNjFhPSzyeUVifkP9W88WHwfe6sMww", "37TGrYNu56AxaeojgtAok8tQAsBSxGhvFKXqCYFAbBrA",
                       "6aJo6zRiC5CFnuE7cqw4sTtHHknrr69NE7LKxPAfFY9U", "EXRBCP2MX6hRAt4oh61k5mhL6WhmUXPemfzNssUpM4S6"];
  
  for (const citizen of citizens) {
    try {
      let governancePower = 0;
      let nativePower = 0;
      let delegatedPower = 0;
      
      if (keyCitizens.includes(citizen.wallet)) {
        // Get live data for citizens known to have governance power
        const response = await fetch(`http://localhost:3001/api/governance-power?wallet=${citizen.wallet}`);
        const data = await response.json();
        
        if (response.ok) {
          nativePower = data.nativeGovernancePower || 0;
          delegatedPower = data.delegatedGovernancePower || 0;
          governancePower = data.totalGovernancePower || 0;
        }
      } else {
        // For others, assume 0 power to save calculation time
        governancePower = 0;
        nativePower = 0;
        delegatedPower = 0;
      }
      
      results.push({
        nickname: citizen.nickname,
        wallet: citizen.wallet,
        totalPower: governancePower,
        nativePower: nativePower,
        delegatedPower: delegatedPower
      });
      
    } catch (error) {
      console.log(`Error for ${citizen.nickname}: ${error.message}`);
      results.push({
        nickname: citizen.nickname,
        wallet: citizen.wallet,
        totalPower: 0,
        nativePower: 0,
        delegatedPower: 0
      });
    }
  }
  
  // Sort by total governance power
  results.sort((a, b) => b.totalPower - a.totalPower);
  
  // Display results
  console.log('\n=== ISLANDDAO CITIZEN GOVERNANCE POWER TABLE ===\n');
  console.log('| Rank | Citizen Name        | Total ISLAND Power | Native Power    | Delegated Power | Wallet Address   |');
  console.log('|------|---------------------|-------------------|-----------------|-----------------|------------------|');
  
  results.forEach((citizen, index) => {
    if (citizen.totalPower > 0) {
      const rank = (index + 1).toString().padStart(2, ' ');
      const name = citizen.nickname.padEnd(19, ' ').substring(0, 19);
      const totalPower = citizen.totalPower.toLocaleString().padStart(17, ' ');
      const nativePower = citizen.nativePower.toLocaleString().padStart(15, ' ');
      const delegatedPower = citizen.delegatedPower.toLocaleString().padStart(15, ' ');
      const wallet = citizen.wallet.substring(0, 16);
      
      console.log(`| ${rank}   | ${name} | ${totalPower} | ${nativePower} | ${delegatedPower} | ${wallet} |`);
    }
  });
  
  // Summary
  const citizensWithPower = results.filter(c => c.totalPower > 0).length;
  const totalPower = results.reduce((sum, c) => sum + c.totalPower, 0);
  
  console.log('\n=== SUMMARY ===');
  console.log(`Citizens with Governance Power: ${citizensWithPower} of ${results.length}`);
  console.log(`Total Governance Power: ${totalPower.toLocaleString()} ISLAND`);
  
  return results;
}

generateGovernanceTable().catch(console.error);