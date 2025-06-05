/**
 * Quick check of all citizens - get complete list for manual verification
 */

const allCitizens = [
  "7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA", // Takisoul
  "CinHb6Xt2PnqKUkmhRo9hwUkixCcsH1uviuQqaTxwT9i", // GintoniK
  "Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG", // legend
  "kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC",  // KO3
  "CLcXVZpCwF9QH2aNjFhPSzyeUVifkP9W88WHwfe6sMww", // scientistjoe
  "37TGrYNu56AxaeojgtAok8tQAsBSxGhvFKXqCYFAbBrA", // Moxie
  "6aJo6zRiC5CFnuE7cqw4sTtHHknrr69NE7LKxPAfFY9U", // nurtan
  "2qYMBZwJhu8zpyEK29Dy5Hf9WrWWe1LkDzrUDiuVzBnk", // Yamparala Rahul
  "Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1", // Titanmaker
  "GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh", // Anonymous Citizen
  "9RSpFWGntExNNa6puTVtynmrNAJZRso6w4gFWuMr1o3n", // Portor
  "9WW4oiMyW6A9oP4R8jvxJLMZ3RUss18qsM4yBBHJPj94", // Alex Perts
  "3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt", // DeanMachine
  "BPmVp1b4vbT2YUHfcFrtErA67nNsJ5LGAJ2BLg5ds9kz", // SoCal
  "4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4", // noclue
  "ADjG92YTwGUxTB3r9SY6Gip4q4xoUQdKq3DA1actaDUd", // Reijo
  "6vJrtBwoDTWnNGmMsGQyptwagB9oEVntfpK7yTctZ3Sy", // Kegomaz
  "B93csAjDr4sbgLvYmY1iNcHQ1wLe9abEiodJDcn8K7ST", // Mila
  "EXRBCP2MX6hRAt4oh61k5mhL6WhmUXPemfzNssUpM4S6", // Icoder
  "DraTvYwqwySZ4kvzxsiYtKF2K6mp4FE3VbjTdPsJzpXt", // Kornel
  "3s6VUe21HFVEC6j12bPXLcrBHMkTZ66847853pXWXspr", // Funcracker
  "CdCAQnq13hTUiBxganRXYKw418uUTfZdmosqef2vu1bM", // Canfly
  "EViz4YGrY6GZtfu35Y1Q3PoFWAhoXY6YMHFrcneMbdCF"  // Moviendome
];

const citizenNames = [
  "Takisoul", "GintoniK", "legend", "KO3", "scientistjoe", "Moxie", "nurtan", 
  "Yamparala Rahul", "Titanmaker", "Anonymous Citizen", "Portor", "Alex Perts", 
  "DeanMachine", "SoCal", "noclue", "Reijo", "Kegomaz", "Mila", "Icoder", 
  "Kornel", "Funcracker", "Canfly", "Moviendome"
];

async function checkCitizen(wallet, index) {
  try {
    const response = await fetch(`http://localhost:3001/api/governance-power?wallet=${wallet}`);
    const data = await response.json();
    return {
      name: citizenNames[index],
      wallet: wallet.substring(0, 8),
      power: data.nativeGovernancePower || 0
    };
  } catch (error) {
    return {
      name: citizenNames[index],
      wallet: wallet.substring(0, 8),
      power: 0
    };
  }
}

async function getAllResults() {
  console.log('COMPLETE CITIZEN GOVERNANCE POWER LIST');
  console.log('=====================================\n');
  
  const results = [];
  
  // Process in smaller batches
  for (let i = 0; i < allCitizens.length; i += 3) {
    const batch = allCitizens.slice(i, i + 3);
    const batchPromises = batch.map((wallet, batchIndex) => checkCitizen(wallet, i + batchIndex));
    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);
    
    // Print batch results immediately
    batchResults.forEach(result => {
      console.log(`${result.name.padEnd(20)} | ${result.power.toLocaleString().padStart(15)} ISLAND | ${result.wallet}`);
    });
    
    // Small delay between batches
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n=====================================');
  const withPower = results.filter(r => r.power > 0);
  console.log(`TOTAL WITH GOVERNANCE POWER: ${withPower.length} of ${results.length}`);
  
  return results;
}

getAllResults().catch(console.error);