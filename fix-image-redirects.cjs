/**
 * Fix Image Redirects - Follow redirect chains and update stored URLs
 * Ensures all citizen profile pictures load without redirect issues
 */

const { Pool } = require('pg');
const fetch = require('node-fetch');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function followRedirect(url, maxRedirects = 5) {
  let currentUrl = url;
  let redirectCount = 0;
  
  while (redirectCount < maxRedirects) {
    try {
      const response = await fetch(currentUrl, {
        method: 'HEAD',
        redirect: 'manual'
      });
      
      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (location) {
          console.log(`    Redirect ${redirectCount + 1}: ${location}`);
          currentUrl = location;
          redirectCount++;
        } else {
          break;
        }
      } else if (response.status === 200) {
        console.log(`    Final URL: ${currentUrl}`);
        return currentUrl;
      } else {
        console.log(`    Error status: ${response.status}`);
        return null;
      }
    } catch (error) {
      console.log(`    Fetch error: ${error.message}`);
      return null;
    }
  }
  
  return currentUrl;
}

async function fixImageRedirects() {
  console.log('FIXING IMAGE REDIRECTS');
  console.log('======================');
  
  const client = await pool.connect();
  
  try {
    // Get all citizens with image URLs
    const result = await client.query(`
      SELECT id, wallet, nickname, image_url
      FROM citizens 
      WHERE image_url IS NOT NULL AND image_url != ''
      ORDER BY nickname
    `);
    
    console.log(`Processing ${result.rows.length} citizens with image URLs:`);
    
    let fixed = 0;
    let unchanged = 0;
    let errors = 0;
    
    for (const citizen of result.rows) {
      console.log(`\n${citizen.nickname || 'Anonymous'} (${citizen.wallet.substring(0, 8)}...)`);
      console.log(`  Current URL: ${citizen.image_url}`);
      
      try {
        const finalUrl = await followRedirect(citizen.image_url);
        
        if (finalUrl && finalUrl !== citizen.image_url) {
          console.log(`  ✅ Updated to final URL`);
          
          // Update database with final URL
          await client.query(`
            UPDATE citizens 
            SET image_url = $1, updated_at = NOW()
            WHERE id = $2
          `, [finalUrl, citizen.id]);
          
          fixed++;
        } else if (finalUrl) {
          console.log(`  ✓ URL is already final`);
          unchanged++;
        } else {
          console.log(`  ❌ Could not resolve URL`);
          errors++;
        }
        
        // Rate limiting
        await new Promise(resolve => setTimeout(resolve, 200));
        
      } catch (error) {
        console.error(`  ❌ Error: ${error.message}`);
        errors++;
      }
    }
    
    console.log('\n=== RESULTS ===');
    console.log(`✅ Fixed redirects: ${fixed}`);
    console.log(`✓ Unchanged: ${unchanged}`);
    console.log(`❌ Errors: ${errors}`);
    
  } finally {
    client.release();
  }
}

fixImageRedirects().catch(console.error);