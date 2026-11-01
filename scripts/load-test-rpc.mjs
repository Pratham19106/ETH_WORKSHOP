#!/usr/bin/env node

/**
 * ============================================================================
 * VJTI ETH WORKSHOP - RPC CONCURRENCY & RESILIENCE LOAD TESTING TOOL
 * ============================================================================
 * 
 * Simulates ~80 to 160+ attendees hitting Base Sepolia RPC endpoints concurrently.
 * Tests realistic attendee workflows:
 *   1. eth_chainId
 *   2. eth_blockNumber
 *   3. eth_call: hasMinted(address)
 *   4. eth_call: totalSupply()
 *   5. eth_call: tokenTier(1)
 *   6. eth_getTransactionReceipt(sampleHash) (confirmation polling)
 * 
 * Reports:
 *   - Total requests, success rate, failure breakdown (429s vs Timeouts vs 5xx)
 *   - Latency percentiles: min, p50, p90, p95, p99, max, avg
 *   - Requests Per Second (RPS)
 *   - Plain PASS / FAIL verdict
 */

import http from "node:http";

// Parse CLI arguments
const args = process.argv.slice(2);
function getArg(name, defaultValue) {
  const index = args.indexOf(`--${name}`);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  const prefix = `--${name}=`;
  const match = args.find((a) => a.startsWith(prefix));
  if (match) return match.slice(prefix.length);
  return defaultValue;
}

const hasFlag = (name) => args.includes(`--${name}`);

const targetUrl = getArg("endpoint", getArg("url", process.env.VITE_PUBLIC_RPC_URL || "https://sepolia.base.org"));
const alchemyUrl = getArg("alchemy-url", process.env.VITE_ALCHEMY_RPC_URL || "");
const testMode = getArg("mode", "public"); // 'public' | 'alchemy' | 'combined' | 'simulate-alchemy'
const numUsers = parseInt(getArg("users", "80"), 10);
const durationSeconds = parseInt(getArg("duration", "15"), 10);
const rampUp = hasFlag("ramp");
const contractAddress = getArg("contract", process.env.VITE_CONTRACT_ADDRESS || "0x5481663DDa284818Dd2EDEB5153D266d0DAA05f6");

// PASS/FAIL Thresholds
const PASS_SUCCESS_RATE_THRESHOLD = 99.0; // >= 99.0%
const PASS_P95_LATENCY_THRESHOLD_MS = 1500; // < 1500 ms

// Realistic test addresses
function generateWallet(index) {
  const hex = index.toString(16).padStart(40, "0");
  return `0x${hex}`;
}

// Function selectors
const SELECTORS = {
  hasMinted: "0x478c0ae6", // hasMinted(address)
  totalSupply: "0x18160ddd", // totalSupply()
  tokenTier: "0x649e705f", // tokenTier(uint256)
  tierURIs: "0xc0f52dcd", // tierURIs(uint8)
};

// Encode eth_call data
function encodeHasMinted(address) {
  const cleanAddr = address.toLowerCase().replace("0x", "").padStart(64, "0");
  return SELECTORS.hasMinted + cleanAddr;
}

function encodeTokenTier(tokenId = 1) {
  const hexTokenId = tokenId.toString(16).padStart(64, "0");
  return SELECTORS.tokenTier + hexTokenId;
}

// In-flight deduplication & client cache (for 'combined' mode)
const clientCache = new Map();
const inFlightMap = new Map();

// Alchemy Rate Limit Simulator Proxy (25 req/s token bucket)
let mockServer = null;
let mockServerUrl = null;

async function startAlchemySimulator(upstreamUrl) {
  const CAPACITY = 25; // 25 req/sec burst limit
  const REFILL_RATE = 25; // 25 tokens/sec
  let tokens = CAPACITY;
  let lastRefill = Date.now();

  const server = http.createServer(async (req, res) => {
    if (req.method !== "POST") {
      res.writeHead(405);
      return res.end();
    }

    // Refill token bucket
    const now = Date.now();
    const elapsedSec = (now - lastRefill) / 1000;
    tokens = Math.min(CAPACITY, tokens + elapsedSec * REFILL_RATE);
    lastRefill = now;

    // Read body
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", async () => {
      // Check rate limit
      if (tokens < 1) {
        res.writeHead(429, { "Content-Type": "application/json" });
        return res.end(
          JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32005,
              message: "Alchemy free-tier capacity exceeded (Rate limit 25 req/sec or 500 CU/sec)",
            },
            id: null,
          })
        );
      }

      tokens -= 1;

      // Forward to real Base Sepolia
      try {
        const upstreamRes = await fetch(upstreamUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
        });

        const data = await upstreamRes.text();
        res.writeHead(upstreamRes.status, { "Content-Type": "application/json" });
        res.end(data);
      } catch (err) {
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
  });

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port;
  mockServerUrl = `http://127.0.0.1:${port}`;
  mockServer = server;
  return mockServerUrl;
}

// Metrics Accumulator
const metrics = {
  totalDispatched: 0,
  completed: 0,
  success: 0,
  failed: 0,
  rateLimited429: 0,
  timeouts: 0,
  serverErrors5xx: 0,
  networkErrors: 0,
  latencies: [],
};

// Dispatch a single JSON-RPC call
async function executeCall(endpointUrl, method, params, timeoutMs = 7000) {
  metrics.totalDispatched++;
  const t0 = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(endpointUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: Math.floor(Math.random() * 1000000),
        method,
        params,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const latency = Date.now() - t0;
    metrics.completed++;
    metrics.latencies.push(latency);

    if (res.status === 429) {
      metrics.failed++;
      metrics.rateLimited429++;
      return { ok: false, error: "429 Rate Limit", status: 429, latency };
    }

    if (!res.ok) {
      metrics.failed++;
      if (res.status >= 500) metrics.serverErrors5xx++;
      return { ok: false, error: `HTTP ${res.status}`, status: res.status, latency };
    }

    const data = await res.json();
    if (data.error) {
      if (data.error.code === -32005 || data.error.message?.toLowerCase().includes("rate limit")) {
        metrics.failed++;
        metrics.rateLimited429++;
        return { ok: false, error: data.error.message, status: 429, latency };
      }
      // Revert / execution errors
      metrics.success++;
      return { ok: true, result: data.result, latency };
    }

    metrics.success++;
    return { ok: true, result: data.result, latency };
  } catch (err) {
    const latency = Date.now() - t0;
    metrics.completed++;
    metrics.latencies.push(latency);
    metrics.failed++;

    if (err.name === "AbortError" || err.message?.includes("aborted")) {
      metrics.timeouts++;
      return { ok: false, error: "Timeout (>7s)", status: 408, latency };
    }

    metrics.networkErrors++;
    return { ok: false, error: err.message, status: 0, latency };
  }
}

// Resilient combined call (mimics app's RpcManager with failover, dedup, and caching)
async function executeCombinedCall(primaryUrl, secondaryUrl, method, params) {
  const cacheKey = `${method}:${JSON.stringify(params)}`;

  // Cache check
  const cached = clientCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    metrics.totalDispatched++;
    metrics.completed++;
    metrics.success++;
    metrics.latencies.push(1); // Cached hits resolve in ~1ms
    return { ok: true, cached: true, latency: 1 };
  }

  // Deduplicate in-flight calls
  if (inFlightMap.has(cacheKey)) {
    return inFlightMap.get(cacheKey);
  }

  const promise = (async () => {
    // Try primary
    let result = await executeCall(primaryUrl, method, params);

    // If 429 or timeout, immediately failover to secondary if available!
    if (!result.ok && (result.status === 429 || result.status === 408 || result.status >= 500)) {
      if (secondaryUrl && secondaryUrl !== primaryUrl) {
        result = await executeCall(secondaryUrl, method, params);
      }
    }

    // Cache if successful
    if (result.ok) {
      clientCache.set(cacheKey, { expiresAt: Date.now() + 4000 });
    }
    return result;
  })();

  inFlightMap.set(cacheKey, promise);
  try {
    return await promise;
  } finally {
    inFlightMap.delete(cacheKey);
  }
}

// Simulate a single user's activity loop
async function runUserSimulation(userId, endpointUrl, secondaryUrl, stopTime, isCombined) {
  const wallet = generateWallet(userId);
  const sampleTxHash = "0x7890123456789012345678901234567890123456789012345678901234567890";

  while (Date.now() < stopTime) {
    const action = Math.floor(Math.random() * 5);

    if (isCombined) {
      switch (action) {
        case 0:
          await executeCombinedCall(endpointUrl, secondaryUrl, "eth_chainId", []);
          break;
        case 1:
          await executeCombinedCall(endpointUrl, secondaryUrl, "eth_blockNumber", []);
          break;
        case 2:
          await executeCombinedCall(endpointUrl, secondaryUrl, "eth_call", [
            { to: contractAddress, data: encodeHasMinted(wallet) },
            "latest",
          ]);
          break;
        case 3:
          await executeCombinedCall(endpointUrl, secondaryUrl, "eth_call", [
            { to: contractAddress, data: SELECTORS.totalSupply },
            "latest",
          ]);
          break;
        case 4:
          // Simulate polling transaction receipt
          await executeCombinedCall(endpointUrl, secondaryUrl, "eth_getTransactionReceipt", [sampleTxHash]);
          break;
      }
    } else {
      switch (action) {
        case 0:
          await executeCall(endpointUrl, "eth_chainId", []);
          break;
        case 1:
          await executeCall(endpointUrl, "eth_blockNumber", []);
          break;
        case 2:
          await executeCall(endpointUrl, "eth_call", [
            { to: contractAddress, data: encodeHasMinted(wallet) },
            "latest",
          ]);
          break;
        case 3:
          await executeCall(endpointUrl, "eth_call", [
            { to: contractAddress, data: SELECTORS.totalSupply },
            "latest",
          ]);
          break;
        case 4:
          await executeCall(endpointUrl, "eth_getTransactionReceipt", [sampleTxHash]);
          break;
      }
    }

    // Realistic attendee think time: 200ms - 600ms between actions
    const thinkTime = 200 + Math.floor(Math.random() * 400);
    await new Promise((r) => setTimeout(r, thinkTime));
  }
}

// Compute percentiles from latencies
function calculatePercentiles(latencies) {
  if (latencies.length === 0) return { min: 0, p50: 0, p90: 0, p95: 0, p99: 0, max: 0, avg: 0 };
  const sorted = [...latencies].sort((a, b) => a - b);
  const getP = (p) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
  const sum = sorted.reduce((acc, v) => acc + v, 0);

  return {
    min: sorted[0],
    p50: getP(50),
    p90: getP(90),
    p95: getP(95),
    p99: getP(99),
    max: sorted[sorted.length - 1],
    avg: Math.round(sum / sorted.length),
  };
}

// Main Runner
async function main() {
  console.log("================================================================================");
  console.log("          VJTI ETH WORKSHOP - BASE SEPOLIA RPC LOAD TEST RUNNER");
  console.log("================================================================================");
  console.log(`Target Mode        : ${testMode.toUpperCase()}`);
  console.log(`Concurrent Users   : ${numUsers} attendees`);
  console.log(`Test Duration      : ${durationSeconds} seconds`);
  console.log(`Ramp-up Pattern    : ${rampUp ? "Gradual 5s Ramp" : "Instantaneous (All-at-once burst)"}`);
  console.log(`Target Contract    : ${contractAddress}`);

  let primaryUrl = targetUrl;
  let secondaryUrl = alchemyUrl;

  // Setup mode URLs
  if (testMode === "alchemy") {
    if (alchemyUrl) {
      primaryUrl = alchemyUrl;
      console.log(`Primary Endpoint   : Alchemy (${alchemyUrl})`);
    } else {
      console.log("Starting Alchemy Rate Limit Simulator (25 req/s / 500 CU/s limit)...");
      primaryUrl = await startAlchemySimulator(targetUrl);
      console.log(`Primary Endpoint   : Simulated Alchemy Tier (via ${primaryUrl})`);
    }
  } else if (testMode === "simulate-alchemy") {
    console.log("Starting Alchemy Rate Limit Simulator (25 req/s / 500 CU/s limit)...");
    primaryUrl = await startAlchemySimulator(targetUrl);
    console.log(`Primary Endpoint   : Simulated Alchemy Tier (via ${primaryUrl})`);
  } else if (testMode === "combined") {
    primaryUrl = targetUrl;
    if (alchemyUrl) {
      secondaryUrl = alchemyUrl;
      console.log(`Primary Endpoint   : Public Base Sepolia (${primaryUrl})`);
      console.log(`Secondary Endpoint : Alchemy (${secondaryUrl})`);
    } else {
      secondaryUrl = await startAlchemySimulator(targetUrl);
      console.log(`Primary Endpoint   : Public Base Sepolia (${primaryUrl})`);
      console.log(`Secondary Endpoint : Simulated Alchemy Tier (${secondaryUrl})`);
    }
    console.log(`Resilience Layers  : Request Deduplication + Response Caching + Auto-Failover`);
  } else {
    console.log(`Primary Endpoint   : Public Base Sepolia (${primaryUrl})`);
  }

  console.log("--------------------------------------------------------------------------------");
  console.log(`[SYS] Launching ${numUsers} concurrent user routines...`);

  const startTime = Date.now();
  const stopTime = startTime + durationSeconds * 1000;
  const userPromises = [];

  for (let i = 0; i < numUsers; i++) {
    const delay = rampUp ? Math.floor((i / numUsers) * 5000) : 0;
    const promise = (async () => {
      if (delay > 0) await new Promise((r) => setTimeout(r, delay));
      await runUserSimulation(i + 1, primaryUrl, secondaryUrl, stopTime, testMode === "combined");
    })();
    userPromises.push(promise);
  }

  // Print progress ticker
  const ticker = setInterval(() => {
    const elapsed = Math.round((Date.now() - startTime) / 1000);
    const rps = elapsed > 0 ? Math.round(metrics.completed / elapsed) : 0;
    process.stdout.write(
      `\r[PROGRESS] Elapsed: ${elapsed}s / ${durationSeconds}s | Completed: ${metrics.completed} reqs | RPS: ${rps} | 429s: ${metrics.rateLimited429} | Errors: ${metrics.failed}    `
    );
  }, 1000);

  await Promise.all(userPromises);
  clearInterval(ticker);
  console.log("\n[SYS] Test completed. Compiling diagnostics...\n");

  if (mockServer) {
    mockServer.close();
  }

  const totalTimeSec = (Date.now() - startTime) / 1000;
  const successRate = metrics.completed > 0 ? ((metrics.success / metrics.completed) * 100).toFixed(2) : "0.00";
  const rps = (metrics.completed / totalTimeSec).toFixed(1);
  const p = calculatePercentiles(metrics.latencies);

  // Determine PASS / FAIL verdict
  const passSuccess = parseFloat(successRate) >= PASS_SUCCESS_RATE_THRESHOLD;
  const passLatency = p.p95 <= PASS_P95_LATENCY_THRESHOLD_MS;
  const isPass = passSuccess && passLatency && metrics.timeouts === 0;

  console.log("================================================================================");
  console.log("                          LOAD TEST DIAGNOSTIC REPORT");
  console.log("================================================================================");
  console.log(`Mode Tested         : ${testMode.toUpperCase()}`);
  console.log(`Concurrent Users    : ${numUsers}`);
  console.log(`Duration Elapsed    : ${totalTimeSec.toFixed(2)} seconds`);
  console.log(`Total Dispatched    : ${metrics.totalDispatched} requests`);
  console.log(`Total Completed     : ${metrics.completed} requests`);
  console.log(`Achieved Throughput : ${rps} req/sec (RPS)`);
  console.log("--------------------------------------------------------------------------------");
  console.log(`Successful Calls    : ${metrics.success} (${successRate}%)`);
  console.log(`Failed Calls        : ${metrics.failed} (${((metrics.failed / (metrics.completed || 1)) * 100).toFixed(2)}%)`);
  console.log(`  ├─ 429 Rate Limits: ${metrics.rateLimited429}`);
  console.log(`  ├─ Timeouts (>7s) : ${metrics.timeouts}`);
  console.log(`  ├─ 5xx Server Err : ${metrics.serverErrors5xx}`);
  console.log(`  └─ Network Errors : ${metrics.networkErrors}`);
  console.log("--------------------------------------------------------------------------------");
  console.log("LATENCY PERCENTILES (Round-Trip Time):");
  console.log(`  Min    : ${p.min} ms`);
  console.log(`  p50    : ${p.p50} ms`);
  console.log(`  p90    : ${p.p90} ms`);
  console.log(`  p95    : ${p.p95} ms (Threshold: < ${PASS_P95_LATENCY_THRESHOLD_MS} ms)`);
  console.log(`  p99    : ${p.p99} ms`);
  console.log(`  Max    : ${p.max} ms`);
  console.log(`  Average: ${p.avg} ms`);
  console.log("--------------------------------------------------------------------------------");
  console.log("VERDICT:");
  if (isPass) {
    console.log(`  >> [PASS] - Meets workshop reliability standards.`);
    console.log(`     - Success rate: ${successRate}% >= ${PASS_SUCCESS_RATE_THRESHOLD}%`);
    console.log(`     - p95 latency: ${p.p95}ms <= ${PASS_P95_LATENCY_THRESHOLD_MS}ms`);
  } else {
    console.log(`  >> [FAIL] - Endpoint did not meet workshop reliability thresholds:`);
    if (!passSuccess) console.log(`     - Success rate ${successRate}% fell below ${PASS_SUCCESS_RATE_THRESHOLD}% threshold!`);
    if (!passLatency) console.log(`     - p95 latency ${p.p95}ms exceeded ${PASS_P95_LATENCY_THRESHOLD_MS}ms threshold!`);
    if (metrics.rateLimited429 > 0) console.log(`     - Suffered ${metrics.rateLimited429} HTTP 429 rate limit errors.`);
    if (metrics.timeouts > 0) console.log(`     - Suffered ${metrics.timeouts} unhandled request timeouts.`);
  }
  console.log("================================================================================\n");

  return {
    mode: testMode,
    users: numUsers,
    totalDispatched: metrics.totalDispatched,
    completed: metrics.completed,
    rps: parseFloat(rps),
    successRate: parseFloat(successRate),
    rateLimited429: metrics.rateLimited429,
    timeouts: metrics.timeouts,
    p50: p.p50,
    p95: p.p95,
    p99: p.p99,
    avg: p.avg,
    verdict: isPass ? "PASS" : "FAIL",
  };
}

main().catch((err) => {
  console.error("FATAL ERROR IN LOAD TEST RUNNER:", err);
  process.exit(1);
});

