#!/usr/bin/env node

/**
 * ============================================================================
 * VJTI ETH WORKSHOP - REALISTIC & ISOLATED BENCHMARK SUITE
 * ============================================================================
 * 
 * Key Architecture Highlights:
 * 1. Zero shared cache or dedup across users: Every virtual attendee has its own
 *    isolated client instance with its own cache and in-flight map.
 * 2. Realistic pacing: Models initial page mount (5 calls), attendee think time,
 *    wallet mint pre-flight (estimateGas, gasPrice, nonce), and receipt polling (2s).
 * 3. Aggressive pacing: Models worst-case hammer loops.
 * 4. Mint-Wave simulations (80 users):
 *    - Wave A: Flash burst (all 80 within 5 seconds)
 *    - Wave B: Steady stream (all 80 over 30 seconds)
 *    - Wave C: 4 waves of 20 users spaced 8 seconds apart
 */

// Configuration constants
const CONTRACT_ADDRESS = process.env.VITE_CONTRACT_ADDRESS || "0x5481663DDa284818Dd2EDEB5153D266d0DAA05f6";

// Parse CLI flags
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

const targetRpcUrl = getArg("url", process.env.VITE_PUBLIC_RPC_URL || "https://sepolia.base.org");
const alchemyRpcUrl = getArg("alchemy-url", process.env.VITE_ALCHEMY_RPC_URL || "");
const suiteToRun = getArg("suite", "all"); // 'realistic' | 'aggressive' | 'waves' | 'all'

const SELECTORS = {
  hasMinted: "0x478c0ae6",
  totalSupply: "0x18160ddd",
  tokenTier: "0x649e705f",
  tierURIs: "0xc0f52dcd",
  mintBadge: "0x42842e0e", // mintBadge(uint8)
};

function generateWallet(id) {
  return `0x${id.toString(16).padStart(40, "0")}`;
}

function encodeHasMinted(addr) {
  return SELECTORS.hasMinted + addr.toLowerCase().replace("0x", "").padStart(64, "0");
}

function encodeMintBadge(tier = 1) {
  return SELECTORS.mintBadge + tier.toString(16).padStart(64, "0");
}

/**
 * Isolated Attendee Browser Client
 * Each instance models ONE attendee's mobile/laptop browser.
 */
class AttendeeClient {
  constructor(userId, rpcUrl, options = {}) {
    this.userId = userId;
    this.walletAddress = generateWallet(userId);
    this.rpcUrl = rpcUrl;
    this.options = options;

    // ISOLATED CLIENT MEMORY (NO SHARING ACROSS CLIENTS)
    this.cache = new Map();
    this.inFlightRequests = new Map();
  }

  async sendRpc(method, params = [], options = {}) {
    const { bypassCache = false, ttlMs = 4000, timeoutMs = 8000 } = options;
    const cacheKey = `${method}:${JSON.stringify(params)}`;

    if (!bypassCache && this.cache.has(cacheKey)) {
      const entry = this.cache.get(cacheKey);
      if (Date.now() < entry.expiresAt) {
        return { ok: true, cached: true, latency: 1, result: entry.data };
      }
    }

    if (this.inFlightRequests.has(cacheKey)) {
      return this.inFlightRequests.get(cacheKey);
    }

    const t0 = Date.now();
    const promise = (async () => {
      const maxRetries = this.options.retryOn429 ? 2 : 0;
      let lastErr = null;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), timeoutMs);

          const res = await fetch(this.rpcUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              jsonrpc: "2.0",
              id: Math.floor(Math.random() * 10000000),
              method,
              params,
            }),
            signal: controller.signal,
          });

          clearTimeout(timer);
          const latency = Date.now() - t0;

          if (res.status === 429) {
            if (attempt < maxRetries) {
              const backoff = 250 * (attempt + 1) + Math.floor(Math.random() * 200);
              await new Promise((r) => setTimeout(r, backoff));
              continue;
            }
            return { ok: false, status: 429, error: "429 Rate Limit", latency };
          }

          if (!res.ok) {
            return { ok: false, status: res.status, error: `HTTP ${res.status}`, latency };
          }

          const json = await res.json();
          if (json.error) {
            if (json.error.code === -32005 || json.error.message?.toLowerCase().includes("rate limit")) {
              if (attempt < maxRetries) {
                const backoff = 250 * (attempt + 1) + Math.floor(Math.random() * 200);
                await new Promise((r) => setTimeout(r, backoff));
                continue;
              }
              return { ok: false, status: 429, error: json.error.message, latency };
            }
            return { ok: true, result: json.result, error: json.error.message, latency };
          }

          if (ttlMs > 0 && json.result !== undefined) {
            this.cache.set(cacheKey, { data: json.result, expiresAt: Date.now() + ttlMs });
          }

          return { ok: true, status: 200, result: json.result, latency };
        } catch (err) {
          const latency = Date.now() - t0;
          const isTimeout = err.name === "AbortError" || err.message?.includes("aborted");
          lastErr = { ok: false, status: isTimeout ? 408 : 0, error: isTimeout ? "Timeout (>8s)" : err.message, latency };
          if (attempt < maxRetries && isTimeout) {
            await new Promise((r) => setTimeout(r, 200));
            continue;
          }
          return lastErr;
        }
      }
      return lastErr || { ok: false, status: 429, error: "429 Rate Limit (Retries Exhausted)", latency: Date.now() - t0 };
    })();

    this.inFlightRequests.set(cacheKey, promise);
    try {
      return await promise;
    } finally {
      this.inFlightRequests.delete(cacheKey);
    }
  }

  // Realistic Page Load Sequence (~6 calls)
  async runPageLoad() {
    const results = [];
    results.push(await this.sendRpc("eth_chainId", []));
    results.push(await this.sendRpc("eth_blockNumber", []));
    results.push(await this.sendRpc("eth_getBalance", [this.walletAddress, "latest"]));
    results.push(
      await this.sendRpc("eth_call", [{ to: CONTRACT_ADDRESS, data: encodeHasMinted(this.walletAddress) }, "latest"])
    );
    results.push(await this.sendRpc("eth_call", [{ to: CONTRACT_ADDRESS, data: SELECTORS.totalSupply }, "latest"]));
    results.push(await this.sendRpc("eth_call", [{ to: CONTRACT_ADDRESS, data: SELECTORS.tokenTier + "01".padStart(64, "0") }, "latest"]));
    return results;
  }

  // Realistic Mint Sequence (MetaMask wallet call sequence)
  async runWalletMintSequence(options = {}) {
    const { pollCount = 3, pollIntervalMs = 2000 } = options;
    const results = [];
    const sampleHash = "0x" + "a1b2c3d4e5f6".repeat(5) + this.userId.toString(16).padStart(4, "0");

    // 1. Pre-flight check
    results.push(
      await this.sendRpc("eth_call", [{ to: CONTRACT_ADDRESS, data: encodeHasMinted(this.walletAddress) }, "latest"])
    );

    // 2. Gas Estimate
    results.push(
      await this.sendRpc("eth_estimateGas", [
        { from: this.walletAddress, to: CONTRACT_ADDRESS, data: encodeMintBadge(1) },
      ])
    );

    // 3. Gas Price / Base fee
    results.push(await this.sendRpc("eth_gasPrice", []));

    // 4. Nonce
    results.push(await this.sendRpc("eth_getTransactionCount", [this.walletAddress, "pending"]));

    // 5. Polling for confirmation (e.g. 3 polls spaced 2s apart)
    for (let p = 0; p < pollCount; p++) {
      if (p > 0 && pollIntervalMs > 0) {
        await new Promise((r) => setTimeout(r, pollIntervalMs));
      }
      results.push(await this.sendRpc("eth_getTransactionReceipt", [sampleHash]));
    }

    return results;
  }

  // Full User Journey: Load -> Think -> Mint -> Poll
  async runFullUserJourney() {
    const allResults = [];
    // 1. Page Load
    const loadRes = await this.runPageLoad();
    allResults.push(...loadRes);

    // 2. Think Time (1.5 - 3.5 seconds)
    const thinkTime = 1500 + Math.floor(Math.random() * 2000);
    await new Promise((r) => setTimeout(r, thinkTime));

    // 3. Mint Transaction Sequence
    const mintRes = await this.runWalletMintSequence({ pollCount: 3, pollIntervalMs: 2000 });
    allResults.push(...mintRes);

    return allResults;
  }
}

// Compute statistics from an array of call result objects
function computeStats(results, durationSec) {
  const total = results.length;
  const successes = results.filter((r) => r.ok).length;
  const rateLimits = results.filter((r) => r.status === 429).length;
  const timeouts = results.filter((r) => r.status === 408).length;
  const serverErrors = results.filter((r) => r.status >= 500).length;
  const otherErrors = total - successes - rateLimits - timeouts - serverErrors;

  const latencies = results.map((r) => r.latency).sort((a, b) => a - b);
  const getP = (p) => latencies[Math.min(latencies.length - 1, Math.floor((p / 100) * latencies.length))] || 0;
  const sum = latencies.reduce((acc, v) => acc + v, 0);

  const successRate = total > 0 ? (successes / total) * 100 : 0;
  const rps = durationSec > 0 ? total / durationSec : 0;

  return {
    total,
    successes,
    rateLimits,
    timeouts,
    serverErrors,
    otherErrors,
    successRate: parseFloat(successRate.toFixed(2)),
    rps: parseFloat(rps.toFixed(1)),
    min: latencies[0] || 0,
    p50: getP(50),
    p90: getP(90),
    p95: getP(95),
    p99: getP(99),
    max: latencies[latencies.length - 1] || 0,
    avg: latencies.length > 0 ? Math.round(sum / latencies.length) : 0,
    verdict: successRate >= 99.0 && getP(95) < 1500 && rateLimits === 0 ? "PASS" : "FAIL",
  };
}

// ----------------------------------------------------------------------------
// SUITE RUNNERS
// ----------------------------------------------------------------------------

export async function runRealisticBenchmark(endpointUrl, userCount = 80, clientOptions = {}) {
  const retryLabel = clientOptions.retryOn429 ? " (With App 429 Retries)" : " (Raw/No Retry)";
  console.log(`\n>>> RUNNING REALISTIC PACING BENCHMARK: ${userCount} ISOLATED USERS${retryLabel}`);
  console.log(`    Endpoint: ${endpointUrl}`);
  console.log(`    Pacing  : Page Load (6 calls) -> Think Time (2-3s) -> Mint Sequence & Polling (7 calls)`);
  console.log(`    Expected rate: ~0.7 - 0.9 req/sec per user over ~15-18 seconds`);

  const t0 = Date.now();
  const clients = Array.from({ length: userCount }, (_, i) => new AttendeeClient(i + 1, endpointUrl, clientOptions));

  // Stagger user arrival realistically over first 4 seconds (workshop doors open)
  const userPromises = clients.map(async (client, i) => {
    const arrivalDelay = Math.floor((i / userCount) * 4000);
    await new Promise((r) => setTimeout(r, arrivalDelay));
    return await client.runFullUserJourney();
  });

  const rawArrays = await Promise.all(userPromises);
  const durationSec = (Date.now() - t0) / 1000;
  const allResults = rawArrays.flat();

  return computeStats(allResults, durationSec);
}

export async function runAggressiveBenchmark(endpointUrl, userCount = 80, durationSec = 15) {
  console.log(`\n>>> RUNNING AGGRESSIVE HAMMER BENCHMARK: ${userCount} ISOLATED USERS`);
  console.log(`    Endpoint: ${endpointUrl}`);
  console.log(`    Pacing  : Continuous loop with 200ms delay (~2.5 - 3.5 req/sec per user)`);

  const t0 = Date.now();
  const stopTime = t0 + durationSec * 1000;
  const clients = Array.from({ length: userCount }, (_, i) => new AttendeeClient(i + 1, endpointUrl));

  const userPromises = clients.map(async (client) => {
    const results = [];
    while (Date.now() < stopTime) {
      const action = Math.floor(Math.random() * 4);
      if (action === 0) results.push(await client.sendRpc("eth_blockNumber", []));
      else if (action === 1)
        results.push(
          await client.sendRpc("eth_call", [
            { to: CONTRACT_ADDRESS, data: encodeHasMinted(client.walletAddress) },
            "latest",
          ])
        );
      else if (action === 2)
        results.push(await client.sendRpc("eth_call", [{ to: CONTRACT_ADDRESS, data: SELECTORS.totalSupply }, "latest"]));
      else results.push(await client.sendRpc("eth_getTransactionReceipt", ["0x1234567890abcdef"]));

      await new Promise((r) => setTimeout(r, 200 + Math.floor(Math.random() * 150)));
    }
    return results;
  });

  const rawArrays = await Promise.all(userPromises);
  const elapsed = (Date.now() - t0) / 1000;
  return computeStats(rawArrays.flat(), elapsed);
}

export async function runMintWave(endpointUrl, waveName, userCount, arrivalWindowMs, batchSchedule = null) {
  console.log(`\n>>> RUNNING MINT WAVE: ${waveName}`);
  console.log(`    Users: ${userCount} | Window: ${arrivalWindowMs / 1000}s`);

  const t0 = Date.now();
  const clients = Array.from({ length: userCount }, (_, i) => new AttendeeClient(i + 1, endpointUrl));

  const promises = clients.map(async (client, i) => {
    let delay = 0;
    if (batchSchedule) {
      // Find which batch this user belongs to
      for (const batch of batchSchedule) {
        if (i >= batch.startUser && i < batch.endUser) {
          delay = batch.delayMs + Math.floor(Math.random() * (batch.jitterMs || 1000));
          break;
        }
      }
    } else {
      delay = Math.floor((i / userCount) * arrivalWindowMs);
    }

    if (delay > 0) await new Promise((r) => setTimeout(r, delay));
    return await client.runWalletMintSequence({ pollCount: 3, pollIntervalMs: 2000 });
  });

  const rawArrays = await Promise.all(promises);
  const elapsed = (Date.now() - t0) / 1000;
  const stats = computeStats(rawArrays.flat(), elapsed);
  stats.waveName = waveName;
  return stats;
}

// ----------------------------------------------------------------------------
// MAIN EXECUTION
// ----------------------------------------------------------------------------

async function main() {
  console.log("================================================================================");
  console.log("     BASE SEPOLIA ISOLATED CLIENT BENCHMARK SUITE (WORKSHOP AUDIT)");
  console.log("================================================================================");
  console.log(`Target Public Endpoint : ${targetRpcUrl}`);
  console.log(`Target Alchemy Endpoint: ${alchemyRpcUrl || "NOT SET (will be tested if configured)"}`);
  console.log(`Target Contract Address: ${CONTRACT_ADDRESS}`);

  const endpointsToTest = [{ name: "Base Sepolia Public", url: targetRpcUrl }];
  if (alchemyRpcUrl) {
    endpointsToTest.push({ name: "Alchemy Base Sepolia", url: alchemyRpcUrl });
  }

  const allSummaryResults = [];

  for (const ep of endpointsToTest) {
    console.log("\n================================================================================");
    console.log(`  EVALUATING ENDPOINT: ${ep.name.toUpperCase()} (${ep.url})`);
    console.log("================================================================================");

    // 1. Realistic Pacing: 80 Isolated Users (Raw / No Retry)
    const real80Raw = await runRealisticBenchmark(ep.url, 80, { retryOn429: false });
    allSummaryResults.push({ ep: ep.name, scenario: "Realistic Pacing (80 raw)", ...real80Raw });

    // 1b. Realistic Pacing: 80 Isolated Users (With App 429 Retries)
    const real80Retry = await runRealisticBenchmark(ep.url, 80, { retryOn429: true });
    allSummaryResults.push({ ep: ep.name, scenario: "Realistic Pacing (80 + retries)", ...real80Retry });

    // 2. Aggressive Pacing: 80 Isolated Users
    const agg80 = await runAggressiveBenchmark(ep.url, 80, 15);
    allSummaryResults.push({ ep: ep.name, scenario: "Aggressive Pacing (80 users)", ...agg80 });

    // 3. Mint Wave A: 80 users in 5 seconds (Flash Burst)
    const waveA = await runMintWave(ep.url, "Wave A: 80 users in 5s (Flash Burst)", 80, 5000);
    allSummaryResults.push({ ep: ep.name, scenario: "Mint Wave A (80 users / 5s)", ...waveA });

    // 4. Mint Wave B: 80 users in 30 seconds (Steady Stream)
    const waveB = await runMintWave(ep.url, "Wave B: 80 users in 30s (Steady Stream)", 80, 30000);
    allSummaryResults.push({ ep: ep.name, scenario: "Mint Wave B (80 users / 30s)", ...waveB });

    // 5. Mint Wave C: 4 waves of 20 users (8s interval)
    const waveC = await runMintWave(ep.url, "Wave C: 4 waves of 20 users", 80, 0, [
      { startUser: 0, endUser: 20, delayMs: 0, jitterMs: 1500 },
      { startUser: 20, endUser: 40, delayMs: 8000, jitterMs: 1500 },
      { startUser: 40, endUser: 60, delayMs: 16000, jitterMs: 1500 },
      { startUser: 60, endUser: 80, delayMs: 24000, jitterMs: 1500 },
    ]);
    allSummaryResults.push({ ep: ep.name, scenario: "Mint Wave C (4x20 waves)", ...waveC });

    // 6. Realistic Pacing: 160 Isolated Users (Breaking point probe)
    const real160 = await runRealisticBenchmark(ep.url, 160);
    allSummaryResults.push({ ep: ep.name, scenario: "Realistic Pacing (160 users)", ...real160 });
  }

  // Print Complete Diagnostic Summary Table
  console.log("\n========================================================================================================================");
  console.log("                                         FINAL ISOLATED AUDIT RESULTS TABLE");
  console.log("========================================================================================================================");
  console.log(
    "Endpoint             | Scenario                         | Reqs  | RPS   | Success % | 429s | Timeouts | p50 (ms) | p95 (ms) | Verdict"
  );
  console.log("------------------------------------------------------------------------------------------------------------------------");
  for (const s of allSummaryResults) {
    const epStr = s.ep.padEnd(20, " ");
    const scStr = s.scenario.padEnd(32, " ");
    const reqStr = s.total.toString().padStart(5, " ");
    const rpsStr = s.rps.toFixed(1).padStart(5, " ");
    const sucStr = `${s.successRate.toFixed(1)}%`.padStart(9, " ");
    const rateStr = s.rateLimits.toString().padStart(4, " ");
    const toutStr = s.timeouts.toString().padStart(8, " ");
    const p50Str = s.p50.toString().padStart(8, " ");
    const p95Str = s.p95.toString().padStart(8, " ");
    const verdStr = s.verdict.padStart(7, " ");
    console.log(
      `${epStr} | ${scStr} | ${reqStr} | ${rpsStr} | ${sucStr} | ${rateStr} | ${toutStr} | ${p50Str} | ${p95Str} | ${verdStr}`
    );
  }
  console.log("========================================================================================================================\n");
}

main().catch((err) => {
  console.error("FATAL SUITE ERROR:", err);
  process.exit(1);
});
