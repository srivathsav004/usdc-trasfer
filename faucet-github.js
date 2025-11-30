require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const FAUCET_API = "https://faucet.circle.com/claim";
const LOG_FILE = './faucet.log';

// Chain-specific configurations
const CHAINS = {
  avalanche_fuji: {
    name: "Avalanche Fuji Testnet",
    chainId: "43113",
    token: "USDC"
  },
  ethereum_sepolia: {
    name: "Ethereum Sepolia Testnet", 
    chainId: "11155111",
    token: "USDC"
  },
  base_sepolia: {
    name: "Base Sepolia Testnet",
    chainId: "84532", 
    token: "USDC"
  }
};

// Colors for console output (GitHub Actions compatible)
const colors = {
  green: msg => console.log(`✅ ${msg}`),
  red: msg => console.log(`❌ ${msg}`),
  yellow: msg => console.log(`⚠️ ${msg}`),
  blue: msg => console.log(`🔄 ${msg}`)
};

// Logging function
async function log(message) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  try {
    await fs.appendFile(LOG_FILE, logMessage + '\n');
  } catch (error) {
    colors.red(`Failed to write to log file: ${error.message}`);
  }
}

// Load wallet addresses from file
async function loadWallets() {
  try {
    const data = await fs.readFile('./wallets.json', 'utf8');
    return JSON.parse(data);
  } catch (error) {
    colors.red(`Failed to load wallets: ${error.message}`);
    throw error;
  }
}

// Claim USDC from faucet for a specific wallet
async function claimUSDC(walletAddress, chain) {
  const chainConfig = CHAINS[chain];
  
  try {
    colors.blue(`Claiming USDC for ${walletAddress} on ${chainConfig.name}...`);
    
    const response = await fetch(FAUCET_API, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        address: walletAddress,
        chainId: chainConfig.chainId,
        token: chainConfig.token
      })
    });

    const result = await response.json();
    
    if (response.ok) {
      colors.green(`Success: ${result.message || 'USDC claimed successfully'}`);
      await log(`SUCCESS: Claimed USDC for ${walletAddress} on ${chainConfig.name}`);
      return { success: true, message: result.message };
    } else {
      colors.red(`Failed: ${result.error || 'Unknown error'}`);
      await log(`FAILED: ${result.error || 'Unknown error'} for ${walletAddress} on ${chainConfig.name}`);
      return { success: false, error: result.error };
    }
    
  } catch (error) {
    colors.red(`Network error: ${error.message}`);
    await log(`ERROR: Network error for ${walletAddress} on ${chainConfig.name}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Process all wallets for a specific chain
async function processChain(chain, wallets) {
  if (!wallets || wallets.length === 0) {
    colors.yellow(`No wallets configured for ${CHAINS[chain].name}`);
    return;
  }

  colors.blue(`Processing ${wallets.length} wallet(s) for ${CHAINS[chain].name}...`);
  
  const results = [];
  for (const wallet of wallets) {
    const result = await claimUSDC(wallet, chain);
    results.push({ wallet, ...result });
    
    // Add delay between requests to avoid rate limiting
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Summary for this chain
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  colors.green(`${CHAINS[chain].name}: ${successful} successful, ${failed} failed`);
  await log(`SUMMARY ${CHAINS[chain].name}: ${successful} successful, ${failed} failed`);
  
  return results;
}

// Main faucet automation
async function runFaucet() {
  const startTime = new Date();
  colors.green(`🚰 Circle USDC Faucet Automation - ${startTime.toISOString()}`);
  
  try {
    const wallets = await loadWallets();
    
    const allResults = {};
    
    // Process each chain
    for (const chain of Object.keys(CHAINS)) {
      const results = await processChain(chain, wallets[chain]);
      allResults[chain] = results;
    }
    
    const endTime = new Date();
    const duration = Math.round((endTime - startTime) / 1000);
    
    colors.green(`🎉 Cycle completed in ${duration} seconds`);
    
    // Calculate total stats
    let totalSuccess = 0;
    let totalFailed = 0;
    
    for (const chainResults of Object.values(allResults)) {
      totalSuccess += chainResults.filter(r => r.success).length;
      totalFailed += chainResults.filter(r => !r.success).length;
    }
    
    colors.green(`📊 Final Summary: ${totalSuccess} successful, ${totalFailed} failed claims`);
    await log(`FINAL SUMMARY: ${totalSuccess} successful, ${totalFailed} failed claims. Duration: ${duration}s`);
    
  } catch (error) {
    colors.red(`Fatal error: ${error.message}`);
    await log(`FATAL ERROR: ${error.message}`);
    process.exit(1);
  }
}

// Run the automation
if (require.main === module) {
  runFaucet();
}

module.exports = { runFaucet, claimUSDC, loadWallets };
