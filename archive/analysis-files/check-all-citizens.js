/**
 * Check all citizens through working calculator
 * Show native governance power and VSR account counts
 */

const allCitizens = [
  { nickname: "Takisoul", wallet: "7pPJt2xoEoPy8x8Hf2D6U6oLfNa5uKmHHRwkENVoaxmA" },
  { nickname: "GintoniK", wallet: "CinHb6Xt2PnqKUkmhRo9hwUkixCcsH1uviuQqaTxwT9i" },
  { nickname: "legend", wallet: "Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG" },
  { nickname: "KO3", wallet: "kruHL3zJ1Mcbdibsna5xM6yMp7PZZ4BsNTpj2UMgvZC" },
  { nickname: "scientistjoe", wallet: "CLcXVZpCwF9QH2aNjFhPSzyeUVifkP9W88WHwfe6sMww" },
  { nickname: "Moxie", wallet: "37TGrYNu56AxaeojgtAok8tQAsBSxGhvFKXqCYFAbBrA" },
  { nickname: "nurtan", wallet: "6aJo6zRiC5CFnuE7cqw4sTtHHknrr69NE7LKxPAfFY9U" },
  { nickname: "Yamparala Rahul", wallet: "2qYMBZwJhu8zpyEK29Dy5Hf9WrWWe1LkDzrUDiuVzBnk" },
  { nickname: "Titanmaker", wallet: "Fgv1zrwB6VF3jc45PaNT5t9AnSsJrwb8r7aMNip5fRY1" },
  { nickname: "Anonymous Citizen", wallet: "GJdRQcsyz49FMM4LvPqpaM2QA3yWFr8WamJ95hkwCBAh" },
  { nickname: "Portor", wallet: "9RSpFWGntExNNa6puTVtynmrNAJZRso6w4gFWuMr1o3n" },
  { nickname: "Alex Perts", wallet: "9WW4oiMyW6A9oP4R8jvxJLMZ3RUss18qsM4yBBHJPj94" },
  { nickname: "DeanMachine", wallet: "3PKhzE9wuEkGPHHu2sNCvG86xNtDJduAcyBPXpE6cSNt" },
  { nickname: "SoCal", wallet: "BPmVp1b4vbT2YUHfcFrtErA67nNsJ5LGAJ2BLg5ds9kz" },
  { nickname: "noclue", wallet: "4pT6ESaMQTgpMs2ZZ81pFF8BieGtY9x4CCK2z6aoYoe4" },
  { nickname: "Reijo", wallet: "ADjG92YTwGUxTB3r9SY6Gip4q4xoUQdKq3DA1actaDUd" },
  { nickname: "Kegomaz", wallet: "6vJrtBwoDTWnNGmMsGQyptwagB9oEVntfpK7yTctZ3Sy" },
  { nickname: "Mila", wallet: "B93csAjDr4sbgLvYmY1iNcHQ1wLe9abEiodJDcn8K7ST" },
  { nickname: "Icoder", wallet: "EXRBCP2MX6hRAt4oh61k5mhL6WhmUXPemfzNssUpM4S6" },
  { nickname: "Kornel", wallet: "DraTvYwqwySZ4kvzxsiYtKF2K6mp4FE3VbjTdPsJzpXt" },
  { nickname: "Funcracker", wallet: "3s6VUe21HFVEC6j12bPXLcrBHMkTZ66847853pXWXspr" },
  { nickname: "Canfly", wallet: "CdCAQnq13hTUiBxganRXYKw418uUTfZdmosqef2vu1bM" },
  { nickname: "Moviendome", wallet: "EViz4YGrY6GZtfu35Y1Q3PoFWAhoXY6YMHFrcneMbdCF" },
  { nickname: "Fywb7YDC", wallet: "Fywb7YDCXxtD7pNKThJ36CAtVe23dEeEPf7HqKzJs1VG" }
];

async function checkAllCitizens() {
  console.log('=== CHECKING ALL CITIZENS THROUGH WORKING CALCULATOR ===\n');
  console.log('| # | Citizen Name        | Native Gov Power   | VSR Accounts | Wallet (First 8) |');
  console.log('|---|---------------------|-------------------|--------------|------------------|');
  
  const results = [];
  
  for (let i = 0; i < allCitizens.length; i++) {
    const citizen = allCitizens[i];
    
    try {
      const response = await fetch(`http://localhost:3001/api/governance-power?wallet=${citizen.wallet}`);
      const data = await response.json();
      
      // Extract VSR account count from logs if available
      let vsrAccountCount = 'N/A';
      
      const result = {
        index: i + 1,
        nickname: citizen.nickname,
        wallet: citizen.wallet,
        nativeGovernancePower: data.nativeGovernancePower || 0,
        vsrAccountCount: vsrAccountCount
      };
      
      results.push(result);
      
      const num = result.index.toString().padStart(2, ' ');
      const name = result.nickname.padEnd(19, ' ').substring(0, 19);
      const power = result.nativeGovernancePower.toLocaleString().padStart(17, ' ');
      const accounts = result.vsrAccountCount.toString().padStart(12, ' ');
      const wallet = citizen.wallet.substring(0, 16);
      
      console.log(`| ${num} | ${name} | ${power} | ${accounts} | ${wallet} |`);
      
      // Small delay to allow log processing
      await new Promise(resolve => setTimeout(resolve, 100));
      
    } catch (error) {
      console.log(`| ${(i+1).toString().padStart(2, ' ')} | ${citizen.nickname.padEnd(19, ' ').substring(0, 19)} | ERROR: ${error.message.padEnd(10, ' ')} | N/A          | ${citizen.wallet.substring(0, 16)} |`);
    }
  }
  
  console.log('\n=== SUMMARY ===');
  const citizensWithPower = results.filter(r => r.nativeGovernancePower > 0);
  console.log(`Citizens with Native Governance Power: ${citizensWithPower.length} of ${results.length}`);
  
  console.log('\n=== CITIZENS WITH GOVERNANCE POWER ===');
  citizensWithPower
    .sort((a, b) => b.nativeGovernancePower - a.nativeGovernancePower)
    .forEach((citizen, index) => {
      console.log(`${index + 1}. ${citizen.nickname}: ${citizen.nativeGovernancePower.toLocaleString()} ISLAND`);
    });
  
  return results;
}

checkAllCitizens().catch(console.error);