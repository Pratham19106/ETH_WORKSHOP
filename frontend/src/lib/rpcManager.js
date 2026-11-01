/**
 * ============================================================================
 * RESILIENT RUNTIME-SWITCHABLE RPC MANAGER FOR BASE SEPOLIA
 * ============================================================================
 * 
 * Capabilities:
 * 1. Runtime switching between Public Base Sepolia and Alchemy endpoints.
 * 2. Automatic mode: dynamic routing based on real-time health, error rates, and latency.
 * 3. Robust error recovery: retry with exponential backoff on 429 / 5xx / timeouts.
 * 4. Transparent failover to secondary endpoint if primary fails.
 * 5. In-flight request deduplication (coalescing) to eliminate redundant concurrent calls.
 * 6. Short-lived TTL response caching for high-concurrency read scenarios (~80 users).
 * 7. Active health check and metrics tracking (latency, 429s, errors).
 * 8. Network configuration provider for wallet_addEthereumChain with lock-in protection.
 */

// Environment RPC URLs
const ENV_PUBLIC_RPC = (typeof import.meta !== "undefined" && import.meta.env?.VITE_PUBLIC_RPC_URL) || "https://sepolia.base.org";
const ENV_ALCHEMY_RPC = (typeof import.meta !== "undefined" && import.meta.env?.VITE_ALCHEMY_RPC_URL) || "";

export const RPC_ENDPOINTS = {
  public: {
    id: "public",
    name: "Base Sepolia (Public)",
    url: ENV_PUBLIC_RPC,
    isAvailable: Boolean(ENV_PUBLIC_RPC),
  },
  alchemy: {
    id: "alchemy",
    name: "Alchemy Base Sepolia",
    url: ENV_ALCHEMY_RPC,
    isAvailable: Boolean(ENV_ALCHEMY_RPC),
  },
};

/**
 * Resolves fetch URL for local development Vite proxy to prevent CORS blocks
 */
export function resolveFetchUrl(url) {
  if (typeof window !== "undefined" && import.meta.env?.DEV) {
    if (url && url.includes("base-sepolia.g.alchemy.com")) {
      return url.replace("https://base-sepolia.g.alchemy.com", "/alchemy-rpc");
    }
    if (url && url.includes("sepolia.base.org")) {
      return url.replace("https://sepolia.base.org", "/public-base-rpc");
    }
  }
  return url;
}

class RpcManager {
  constructor() {
    this.mode = "auto"; // 'auto' | 'public' | 'alchemy'
    this.isLocked = false;
    this.lockedEndpoint = null; // 'public' | 'alchemy' | null

    // Real-time health and diagnostics state
    this.health = {
      public: {
        id: "public",
        name: "Base Sepolia (Public)",
        url: RPC_ENDPOINTS.public.url,
        isConfigured: RPC_ENDPOINTS.public.isAvailable,
        status: RPC_ENDPOINTS.public.isAvailable ? "healthy" : "unconfigured", // healthy | degraded | down | unconfigured
        latencyMs: 0,
        errorCount: 0,
        rateLimitCount: 0,
        successCount: 0,
        totalRequests: 0,
        lastCheck: 0,
        lastError: null,
      },
      alchemy: {
        id: "alchemy",
        name: "Alchemy Base Sepolia",
        url: RPC_ENDPOINTS.alchemy.url,
        isConfigured: RPC_ENDPOINTS.alchemy.isAvailable,
        status: RPC_ENDPOINTS.alchemy.isAvailable ? "healthy" : "unconfigured",
        latencyMs: 0,
        errorCount: 0,
        rateLimitCount: 0,
        successCount: 0,
        totalRequests: 0,
        lastCheck: 0,
        lastError: null,
      },
    };

    // Listeners for UI state updates
    this.listeners = new Set();

    // In-flight request deduplication map: key -> Promise
    this.inFlightRequests = new Map();

    // Read cache map: key -> { data, expiresAt }
    this.cache = new Map();

    // Cache TTL configuration (in milliseconds)
    this.cacheTTL = {
      eth_chainId: 60000,
      eth_blockNumber: 4000,
      eth_call_hasMinted: 8000,
      eth_call_totalSupply: 5000,
      eth_call_tokenURI: 60000,
      eth_call_tokenTier: 60000,
      eth_call_tierURIs: 60000,
      eth_call_default: 5000,
      eth_getBalance: 5000,
    };

    // Start background health polling in browser
    if (typeof window !== "undefined") {
      this.initFromLocalStorage();
      this.startHealthMonitor();
    }
  }

  // Restore cached settings from localStorage for instant boot
  initFromLocalStorage() {
    try {
      const stored = localStorage.getItem("vjti_eth_rpc_config");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.mode) this.mode = parsed.mode;
        if (typeof parsed.isLocked === "boolean") this.isLocked = parsed.isLocked;
        if (parsed.lockedEndpoint) this.lockedEndpoint = parsed.lockedEndpoint;
      }
    } catch (e) {
      console.warn("Failed to read RPC config from localStorage:", e);
    }
  }

  // Save current settings to localStorage
  saveToLocalStorage() {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem(
        "vjti_eth_rpc_config",
        JSON.stringify({
          mode: this.mode,
          isLocked: this.isLocked,
          lockedEndpoint: this.lockedEndpoint,
        })
      );
    } catch (e) {
      console.warn("Failed to save RPC config to localStorage:", e);
    }
  }

  // Subscribe to health/state changes (for React hooks & Admin UI)
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  notifyListeners() {
    for (const listener of this.listeners) {
      try {
        listener(this.getState());
      } catch (err) {
        console.error("Error in RpcManager listener:", err);
      }
    }
  }

  // Sync settings from Supabase event_settings table
  syncFromSettings(settings) {
    if (!settings) return;
    let changed = false;

    if (settings.rpc_mode && settings.rpc_mode !== this.mode) {
      this.mode = settings.rpc_mode;
      changed = true;
    }
    if (typeof settings.rpc_locked === "boolean" && settings.rpc_locked !== this.isLocked) {
      this.isLocked = settings.rpc_locked;
      changed = true;
    }
    if (settings.rpc_locked_endpoint !== undefined && settings.rpc_locked_endpoint !== this.lockedEndpoint) {
      this.lockedEndpoint = settings.rpc_locked_endpoint;
      changed = true;
    }

    if (changed) {
      this.saveToLocalStorage();
      this.notifyListeners();
    }
  }

  // Set active mode ('auto' | 'public' | 'alchemy')
  setMode(mode) {
    if (!["auto", "public", "alchemy"].includes(mode)) return;
    this.mode = mode;
    this.saveToLocalStorage();
    this.notifyListeners();
  }

  // Set lock-in state
  setLocked(locked, endpoint = null) {
    this.isLocked = Boolean(locked);
    this.lockedEndpoint = locked ? endpoint || this.getActiveEndpointId() : null;
    this.saveToLocalStorage();
    this.notifyListeners();
  }

  // Determine active endpoint ID based on mode, lock-in, and health
  getActiveEndpointId() {
    // 1. If locked in, strictly use the locked endpoint if available
    if (this.isLocked && this.lockedEndpoint) {
      if (RPC_ENDPOINTS[this.lockedEndpoint]?.isAvailable) {
        return this.lockedEndpoint;
      }
    }

    // 2. Specific manual override: 'public'
    if (this.mode === "public") {
      return "public";
    }

    // 3. Specific manual override: 'alchemy'
    if (this.mode === "alchemy") {
      if (RPC_ENDPOINTS.alchemy.isAvailable) {
        return "alchemy";
      }
      return "public"; // Fallback to public if alchemy not configured
    }

    // 4. 'auto' mode: Smart routing based on health, rate limits, and latency
    const publicHealth = this.health.public;
    const alchemyHealth = this.health.alchemy;

    // If Alchemy is not configured, must use public
    if (!RPC_ENDPOINTS.alchemy.isAvailable) {
      return "public";
    }

    // If one is down or actively 429'd, use the other
    const publicDown = publicHealth.status === "down" || (publicHealth.rateLimitCount > 0 && Date.now() - publicHealth.lastCheck < 15000);
    const alchemyDown = alchemyHealth.status === "down" || (alchemyHealth.rateLimitCount > 0 && Date.now() - alchemyHealth.lastCheck < 15000);

    if (publicDown && !alchemyDown) return "alchemy";
    if (alchemyDown && !publicDown) return "public";

    // If both are healthy, pick based on latency or prefer Alchemy (dedicated) unless throttled
    if (alchemyHealth.status === "healthy" && publicHealth.status === "healthy") {
      // If public latency is substantially better (>250ms faster), use public; else use alchemy
      if (publicHealth.latencyMs > 0 && alchemyHealth.latencyMs > 0) {
        return alchemyHealth.latencyMs <= publicHealth.latencyMs + 250 ? "alchemy" : "public";
      }
      return "alchemy";
    }

    // Degraded comparison
    if (alchemyHealth.status === "healthy") return "alchemy";
    if (publicHealth.status === "healthy") return "public";

    // Default to public
    return "public";
  }

  // Get active RPC URL for read calls
  getActiveRpcUrl() {
    const id = this.getActiveEndpointId();
    return RPC_ENDPOINTS[id]?.url || RPC_ENDPOINTS.public.url;
  }

  // Get the RPC URL that should be registered in attendee wallets (for wallet_addEthereumChain)
  getNetworkRpcUrl() {
    // If locked in, always return locked URL
    if (this.isLocked && this.lockedEndpoint && RPC_ENDPOINTS[this.lockedEndpoint]?.url) {
      return RPC_ENDPOINTS[this.lockedEndpoint].url;
    }
    // Otherwise return the active endpoint URL
    return this.getActiveRpcUrl();
  }

  // Get fallback endpoint ID if current one fails
  getFallbackEndpointId(currentId) {
    if (currentId === "public" && RPC_ENDPOINTS.alchemy.isAvailable && this.health.alchemy.status !== "down") {
      return "alchemy";
    }
    if (currentId === "alchemy" && RPC_ENDPOINTS.public.isAvailable && this.health.public.status !== "down") {
      return "public";
    }
    return null;
  }

  // Compute cache TTL for a given JSON-RPC call
  getCacheTTL(method, params) {
    if (method === "eth_chainId") return this.cacheTTL.eth_chainId;
    if (method === "eth_blockNumber") return this.cacheTTL.eth_blockNumber;
    if (method === "eth_getBalance") return this.cacheTTL.eth_getBalance;

    if (method === "eth_call" && params && params[0]) {
      const data = params[0].data || "";
      // hasMinted: 0x478c0ae6
      if (data.startsWith("0x478c0ae6")) return this.cacheTTL.eth_call_hasMinted;
      // totalSupply: 0x18160ddd
      if (data.startsWith("0x18160ddd")) return this.cacheTTL.eth_call_totalSupply;
      // tokenTier: 0x649e705f
      if (data.startsWith("0x649e705f")) return this.cacheTTL.eth_call_tokenTier;
      // tierURIs: 0xc0f52dcd
      if (data.startsWith("0xc0f52dcd")) return this.cacheTTL.eth_call_tierURIs;
      // tokenURI: 0xc87b56dd
      if (data.startsWith("0xc87b56dd")) return this.cacheTTL.eth_call_tokenURI;
      return this.cacheTTL.eth_call_default;
    }

    return 0; // Don't cache other calls
  }

  /**
   * Resilient JSON-RPC fetch wrapper with:
   * - In-flight deduplication
   * - Cache checking & population
   * - Exponential backoff on 429 / 5xx
   * - Automatic fallback to secondary provider
   */
  async sendRpcCall(method, params = [], options = {}) {
    const { bypassCache = false, timeoutMs = 7000 } = options;

    // 1. Generate unique request cache key
    const cacheKey = `${method}:${JSON.stringify(params)}`;

    // 2. Check read cache
    if (!bypassCache) {
      const cached = this.cache.get(cacheKey);
      if (cached && Date.now() < cached.expiresAt) {
        return cached.data;
      }
    }

    // 3. Deduplicate in-flight identical calls
    if (this.inFlightRequests.has(cacheKey)) {
      return this.inFlightRequests.get(cacheKey);
    }

    // 4. Create in-flight execution promise
    const executionPromise = (async () => {
      let activeId = this.getActiveEndpointId();
      let lastError = null;

      // Try primary endpoint, then fallback endpoint if needed
      const endpointsToTry = [activeId];
      const fallbackId = this.getFallbackEndpointId(activeId);
      if (fallbackId && !endpointsToTry.includes(fallbackId)) {
        endpointsToTry.push(fallbackId);
      }

      for (let attemptIdx = 0; attemptIdx < endpointsToTry.length; attemptIdx++) {
        const endpointId = endpointsToTry[attemptIdx];
        const endpointUrl = RPC_ENDPOINTS[endpointId]?.url;
        if (!endpointUrl) continue;

        const maxRetries = 2; // Retry on 429/timeout up to 2 times with backoff
        for (let retry = 0; retry <= maxRetries; retry++) {
          const startTime = Date.now();
          const targetHealth = this.health[endpointId];
          targetHealth.totalRequests++;

          try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);

            const response = await fetch(resolveFetchUrl(endpointUrl), {
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

            clearTimeout(timer);
            const latency = Date.now() - startTime;
            targetHealth.latencyMs = latency;
            targetHealth.lastCheck = Date.now();

            // Handle HTTP 429 (Rate Limit)
            if (response.status === 429) {
              targetHealth.rateLimitCount++;
              targetHealth.status = "degraded";
              targetHealth.lastError = "HTTP 429 (Rate Limit Exceeded)";
              this.notifyListeners();

              if (retry < maxRetries) {
                // Exponential backoff with jitter: 300ms, 700ms
                const backoff = (retry + 1) * 300 + Math.floor(Math.random() * 150);
                await new Promise((r) => setTimeout(r, backoff));
                continue;
              }
              // Exhausted retries for this endpoint, break to fallback endpoint
              break;
            }

            // Handle HTTP 5xx Server Error
            if (!response.ok) {
              targetHealth.errorCount++;
              targetHealth.lastError = `HTTP ${response.status}: ${response.statusText}`;
              targetHealth.status = targetHealth.errorCount > 2 ? "down" : "degraded";
              this.notifyListeners();
              break; // Try fallback endpoint
            }

            const json = await response.json();

            // Handle JSON-RPC error response
            if (json.error) {
              // Rate limit code inside JSON-RPC (-32005 or message)
              if (json.error.code === -32005 || json.error.message?.toLowerCase().includes("rate limit")) {
                targetHealth.rateLimitCount++;
                targetHealth.status = "degraded";
                targetHealth.lastError = json.error.message;
                this.notifyListeners();
                break;
              }
              throw new Error(json.error.message || "JSON-RPC returned error");
            }

            // Success!
            targetHealth.successCount++;
            targetHealth.status = "healthy";
            targetHealth.lastError = null;

            const result = json.result;

            // Cache result if TTL > 0
            const ttl = this.getCacheTTL(method, params);
            if (ttl > 0 && result !== undefined) {
              this.cache.set(cacheKey, {
                data: result,
                expiresAt: Date.now() + ttl,
              });
            }

            return result;
          } catch (err) {
            const isTimeout = err.name === "AbortError" || err.message?.includes("aborted");
            targetHealth.errorCount++;
            targetHealth.lastError = isTimeout ? "Request Timeout (>7s)" : err.message;
            targetHealth.status = targetHealth.errorCount > 2 ? "down" : "degraded";
            this.notifyListeners();

            lastError = err;
            if (retry < maxRetries && isTimeout) {
              await new Promise((r) => setTimeout(r, 200));
              continue;
            }
            break; // Try fallback endpoint
          }
        }
      }

      throw lastError || new Error(`RPC call failed across all endpoints for ${method}`);
    })();

    // Store in-flight promise and cleanup when done
    this.inFlightRequests.set(cacheKey, executionPromise);
    try {
      return await executionPromise;
    } finally {
      this.inFlightRequests.delete(cacheKey);
    }
  }

  // Periodic background health monitor
  startHealthMonitor() {
    const checkEndpoint = async (id) => {
      const endpoint = RPC_ENDPOINTS[id];
      if (!endpoint || !endpoint.isAvailable) return;
      const targetHealth = this.health[id];

      const t0 = Date.now();
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 4000);

        const res = await fetch(resolveFetchUrl(endpoint.url), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 99999,
            method: "eth_blockNumber",
            params: [],
          }),
          signal: controller.signal,
        });

        clearTimeout(timeout);
        const latency = Date.now() - t0;
        targetHealth.latencyMs = latency;
        targetHealth.lastCheck = Date.now();

        if (res.status === 429) {
          targetHealth.rateLimitCount++;
          targetHealth.status = "degraded";
          targetHealth.lastError = "429 Rate Limit";
        } else if (res.ok) {
          const json = await res.json();
          if (json.result) {
            targetHealth.status = latency > 1500 ? "degraded" : "healthy";
            targetHealth.lastError = null;
          } else {
            targetHealth.status = "degraded";
            targetHealth.lastError = json.error?.message || "Invalid response";
          }
        } else {
          targetHealth.status = "down";
          targetHealth.lastError = `HTTP ${res.status}`;
        }
      } catch (err) {
        targetHealth.latencyMs = Date.now() - t0;
        targetHealth.lastCheck = Date.now();
        targetHealth.status = "down";
        targetHealth.lastError = err.message;
      }
    };

    const runChecks = async () => {
      await Promise.all([
        RPC_ENDPOINTS.public.isAvailable ? checkEndpoint("public") : Promise.resolve(),
        RPC_ENDPOINTS.alchemy.isAvailable ? checkEndpoint("alchemy") : Promise.resolve(),
      ]);
      this.notifyListeners();
    };

    // Initial check
    runChecks();
    // Re-check every 8 seconds
    setInterval(runChecks, 8000);
  }

  // Clear internal cache
  clearCache() {
    this.cache.clear();
  }

  // Return snapshot of manager state
  getState() {
    return {
      mode: this.mode,
      isLocked: this.isLocked,
      lockedEndpoint: this.lockedEndpoint,
      activeEndpointId: this.getActiveEndpointId(),
      activeRpcUrl: this.getActiveRpcUrl(),
      networkRpcUrl: this.getNetworkRpcUrl(),
      health: {
        public: { ...this.health.public },
        alchemy: { ...this.health.alchemy },
      },
    };
  }
}

// Export singleton instance
export const rpcManager = new RpcManager();

