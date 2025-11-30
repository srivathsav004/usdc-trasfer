require('dotenv').config();
const fetch = require('node-fetch');
const fs = require('fs').promises;
const path = require('path');

// Configuration
const FAUCET_API = "https://faucet.circle.com/claim";
const CLAIM_INTERVAL = 60 * 60 * 1000; // 60 minutes in milliseconds
const WALLET_FILE = './wallets.json';
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

// Colors for console output
const colors = {
  green: msg => console.log("\x1b[32m%s\x1b[0m", msg),
  red: msg => console.log("\x1b[31m%s\x1b[0m", msg),
  yellow: msg => console.log("\x1b[33m%s\x1b[0m", msg),
  blue: msg => console.log("\x1b[34m%s\x1b[0m", msg),
  gray: msg => console.log("\x1b[90m%s\x1b[0m", msg)
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
    const data = await fs.readFile(WALLET_FILE, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Create sample wallets file if it doesn't exist
      const sampleWallets = {
        avalanche_fuji: [
          "0x6021e09E8Cd947701E2368D60239C04486118f18"
        ],
        ethereum_sepolia: [
          "0x6021e09E8Cd947701E2368D60239C04486118f18"
        ],
        base_sepolia: [
          "0x6021e09E8Cd947701E2368D60239C04486118f18"
        ]
      };
      await fs.writeFile(WALLET_FILE, JSON.stringify(sampleWallets, null, 2));
      colors.green(`Created sample ${WALLET_FILE} - please edit with your wallet addresses`);
      return sampleWallets;
    }
    throw error;
  }
}

// Claim USDC from faucet for a specific wallet
async function claimUSDC(walletAddress, chain) {
  const chainConfig = CHAINS[chain];
  
  try {
    colors.blue(`🚰 Claiming USDC for ${walletAddress} on ${chainConfig.name}...`);
    
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
      colors.green(`✅ Success: ${result.message || 'USDC claimed successfully'}`);
      await log(`SUCCESS: Claimed USDC for ${walletAddress} on ${chainConfig.name}`);
      return { success: true, message: result.message };
    } else {
      colors.red(`❌ Failed: ${result.error || 'Unknown error'}`);
      await log(`FAILED: ${result.error || 'Unknown error'} for ${walletAddress} on ${chainConfig.name}`);
      return { success: false, error: result.error };
    }
    
  } catch (error) {
    colors.red(`❌ Network error: ${error.message}`);
    await log(`ERROR: Network error for ${walletAddress} on ${chainConfig.name}: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// Process all wallets for a specific chain
async function processChain(chain, wallets) {
  if (!wallets || wallets.length === 0) {
    colors.yellow(`⚠️  No wallets configured for ${CHAINS[chain].name}`);
    return;
  }

  colors.blue(`\n🔄 Processing ${wallets.length} wallet(s) for ${CHAINS[chain].name}...`);
  
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
  
  colors.green(`✅ ${CHAINS[chain].name}: ${successful} successful, ${failed} failed`);
  await log(`SUMMARY ${CHAINS[chain].name}: ${successful} successful, ${failed} failed`);
}

// Main faucet loop
async function runFaucet() {
  const startTime = new Date();
  colors.green(`\n${'='.repeat(60)}`);
  colors.green(`🚰 Circle USDC Faucet Automation - ${startTime.toISOString()}`);
  colors.green(`${'='.repeat(60)}`);
  
  try {
    const wallets = await loadWallets();
    
    // Process each chain
    for (const chain of Object.keys(CHAINS)) {
      await processChain(chain, wallets[chain]);
    }
    
  } catch (error) {
    colors.red(`❌ Fatal error: ${error.message}`);
    await log(`FATAL ERROR: ${error.message}`);
  }
  
  const endTime = new Date();
  const duration = Math.round((endTime - startTime) / 1000);
  colors.green(`\n⏰ Cycle completed in ${duration} seconds`);
  colors.blue(`\n⏳ Next run scheduled for: ${new Date(Date.now() + CLAIM_INTERVAL).toLocaleString()}`);
  
  await log(`Cycle completed in ${duration} seconds. Next run: ${new Date(Date.now() + CLAIM_INTERVAL).toISOString()}`);
}

// Graceful shutdown
process.on('SIGINT', () => {
  colors.yellow('\n🛑 Received SIGINT. Shutting down gracefully...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  colors.yellow('\n🛑 Received SIGTERM. Shutting down gracefully...');
  process.exit(0);
});

// Start the faucet automation
if (require.main === module) {
  colors.green('🚀 Starting Circle USDC Faucet Automation...');
  
  // Run immediately on start
  runFaucet().then(() => {
    // Then run every 60 minutes
    setInterval(runFaucet, CLAIM_INTERVAL);
  }).catch(error => {
    colors.red(`❌ Failed to start: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { runFaucet, claimUSDC, loadWallets };
