require('dotenv').config();
const express = require("express");
const fetch = require("node-fetch");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 3000;
const IRIS = "https://iris-api-sandbox.circle.com/v1/attestations";

const green = msg => console.log("\x1b[32m%s\x1b[0m", msg);
const gray  = msg => console.log("\x1b[90m%s\x1b[0m", msg);
const red   = msg => console.log("\x1b[31m%s\x1b[0m", msg);
const yellow = msg => console.log("\x1b[33m%s\x1b[0m", msg);

// Poll Circle IRIS until attestation returns
async function pollAttestation(hash) {
  const start = Date.now();
  const timeout = 180000; // 3 minutes max
  const pollInterval = 3000; // Poll every 3 seconds

  gray(`🔍 Starting attestation poll for: ${hash}`);

  while (true) {
    const elapsed = Math.floor((Date.now() - start) / 1000);
    
    try {
      const res = await fetch(`${IRIS}/${hash}`);
      
      if (!res.ok) {
        red(`⚠️  HTTP ${res.status}: ${res.statusText}`);
        if (res.status === 404) {
          gray(`[${elapsed}s] Attestation not found yet, will keep polling...`);
        }
      } else {
        const json = await res.json();
        
        // Log response for debugging (but not the whole attestation)
        if (json.status) {
          yellow(`[${elapsed}s] Status: ${json.status}`);
        }

        // Check if attestation is ready
        if (json.attestation && json.attestation !== "PENDING" && json.attestation !== "pending") {
          green(`✅ Attestation ready after ${elapsed} seconds!`);
          return json;
        }

        // Check various status fields
        if (json.status === "pending_confirmations") {
          gray(`[${elapsed}s] ⏳ Waiting for block confirmations...`);
        } else if (json.status === "complete") {
          // Sometimes status is complete but attestation field is still empty
          if (json.attestation) {
            green(`✅ Attestation ready!`);
            return json;
          }
        }
      }
    } catch (e) {
      red(`❌ Fetch error: ${e.message}`);
      // Continue polling even on errors
    }

    // Check timeout
    if (Date.now() - start > timeout) {
      red(`❌ Timeout after ${Math.floor(timeout/1000)} seconds`);
      throw new Error(
        `Attestation timeout. The transaction may need more confirmations. ` +
        `Try checking https://iris-api-sandbox.circle.com/v1/attestations/${hash} directly.`
      );
    }

    // Wait before next poll
    await new Promise(r => setTimeout(r, pollInterval));
  }
}

// Public endpoint for frontend
app.get("/attestations/:hash", async (req, res) => {
  const hash = req.params.hash;
  green(`\n📨 New attestation request: ${hash}`);
  
  try {
    const result = await pollAttestation(hash);
    green(`📤 Sending attestation response\n`);
    res.json(result);
  } catch (e) {
    red(`❌ Error: ${e.message}\n`);
    res.status(500).json({ error: e.message });
  }
});

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({ status: "ok", iris_api: IRIS });
});

app.listen(PORT, () => {
  green(`\n${"=".repeat(60)}`);
  green(`🚀 CCTP Attestation Proxy Server`);
  green(`${"=".repeat(60)}`);
  gray(`📍 Local:     http://localhost:${PORT}`);
  gray(`🌐 IRIS API:  ${IRIS}`);
  green(`${"=".repeat(60)}\n`);
});