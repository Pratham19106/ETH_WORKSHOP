import { createClient } from "@supabase/supabase-js";
import { rpcManager } from "./rpcManager";

// Read Supabase credentials from environment variables (supports anon key or publishable key)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

// Direct Supabase client instance
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Fallback in-memory and localStorage defaults for event settings
const DEFAULT_EVENT_SETTINGS = {
  id: 1,
  voting_active: false,
  badge_claim_active: true,
  phase1_active: true,  // Phase 1: Light Node (Workshop Attendance, 80 attendees, wave-throttled)
  phase2_active: false, // Phase 2: Synced Node (Active Builders, under free limits, instant)
  phase3_active: false, // Phase 3: Validator (Top Winners, under free limits, instant)
  rpc_mode: "auto",
  rpc_locked: false,
  rpc_locked_endpoint: null,
  active_wave: 99, // 99 = all open, 0 = paused, 1-4 = active wave threshold
  voting_active_wave: 99, // 99 = all open, 0 = paused, 1-4 = active voting wave threshold
};

/**
 * Deterministically computes or retrieves the attendee's assigned mint wave (1, 2, 3, or 4).
 * If explicitly set in candidate record, uses that; otherwise partitions evenly into 4 waves.
 */
export function getCandidateWave(candidate, index = 0, total = 80) {
  if (candidate?.wave && Number(candidate.wave) >= 1 && Number(candidate.wave) <= 4) {
    return Number(candidate.wave);
  }
  if (typeof index === "number" && total > 0) {
    const waveSize = Math.max(1, Math.ceil(total / 4));
    return Math.min(4, Math.floor(index / waveSize) + 1);
  }
  if (candidate?.reg_no) {
    let hash = 0;
    for (let i = 0; i < candidate.reg_no.length; i++) {
      hash = (hash << 5) - hash + candidate.reg_no.charCodeAt(i);
    }
    return (Math.abs(hash) % 4) + 1;
  }
  return 1;
}

/**
 * Helper to check if a candidate is eligible to claim a given tier.
 * Candidate `tier` represents their highest unlocked level:
 * tier 1: Light Node only
 * tier 2: Light Node & Synced Node
 * tier 3: Light Node, Synced Node & Validator (Full Set eligible)
 */
export function isCandidateEligibleForTier(candidate, tier) {
  const candidateMaxTier = Number(candidate?.tier || 1);
  return candidateMaxTier >= Number(tier);
}

const getLocalSettings = () => {
  try {
    const raw = localStorage.getItem("vjti_eth_event_settings");
    if (raw) return { ...DEFAULT_EVENT_SETTINGS, ...JSON.parse(raw) };
  } catch (e) {
    // Ignore localStorage parse errors
  }
  return { ...DEFAULT_EVENT_SETTINGS };
};

const saveLocalSettings = (settings) => {
  try {
    localStorage.setItem("vjti_eth_event_settings", JSON.stringify(settings));
  } catch (e) {
    // Ignore localStorage write errors
  }
};

/**
 * Direct Database Service interacting strictly with Supabase PostgreSQL,
 * with local resilience to protect the workshop against backend network blips.
 */
export const dbService = {
  // Fetch event settings (badge_claim_active, voting_active, rpc_mode, rpc_locked, active_wave, etc.)
  getEventSettings: async () => {
    try {
      const { data, error } = await supabase
        .from("event_settings")
        .select("*")
        .eq("id", 1)
        .single();

      if (error) {
        console.warn("Could not fetch event_settings from Supabase, using local fallback:", error.message);
        const fallback = getLocalSettings();
        rpcManager.syncFromSettings(fallback);
        return fallback;
      }

      const merged = { ...getLocalSettings(), ...data };

      // Parse active_wave from native column or fallback rpc_locked_endpoint encoding ("WAVE:2")
      if (typeof data.active_wave === "number") {
        merged.active_wave = data.active_wave;
      } else if (typeof data.rpc_locked_endpoint === "string" && data.rpc_locked_endpoint.startsWith("WAVE:")) {
        const parsed = parseInt(data.rpc_locked_endpoint.replace("WAVE:", ""), 10);
        if (!isNaN(parsed)) {
          merged.active_wave = parsed;
        }
      }

      if (typeof data.voting_active_wave === "number") {
        merged.voting_active_wave = data.voting_active_wave;
      }

      saveLocalSettings(merged);
      rpcManager.syncFromSettings(merged);
      return merged;
    } catch (err) {
      console.warn("Network error reaching Supabase, using local fallback settings:", err.message);
      const fallback = getLocalSettings();
      rpcManager.syncFromSettings(fallback);
      return fallback;
    }
  },

  // Update event settings
  updateEventSettings: async (updates) => {
    // Update local cache and rpcManager immediately for instant UI feedback
    const currentLocal = getLocalSettings();
    const updatedLocal = { ...currentLocal, ...updates, updated_at: new Date().toISOString() };
    saveLocalSettings(updatedLocal);
    rpcManager.syncFromSettings(updatedLocal);

    // Prepare remote payload with dual encoding for active_wave
    const payload = { ...updates, updated_at: new Date().toISOString() };
    if (typeof updates.active_wave !== "undefined") {
      // If rpc is not locked, store WAVE:<n> in rpc_locked_endpoint as universally compatible sync
      if (!updates.rpc_locked && !currentLocal.rpc_locked) {
        payload.rpc_locked_endpoint = `WAVE:${updates.active_wave}`;
      }
    }

    try {
      const { data, error } = await supabase
        .from("event_settings")
        .update(payload)
        .eq("id", 1)
        .select()
        .single();

      if (error) {
        // If active_wave, voting_active_wave or phase columns don't exist yet, omit and retry
        if (error.message?.includes("active_wave") || error.message?.includes("phase") || error.message?.includes("voting_active_wave")) {
          const safePayload = { ...payload };
          delete safePayload.active_wave;
          delete safePayload.voting_active_wave;
          delete safePayload.phase1_active;
          delete safePayload.phase2_active;
          delete safePayload.phase3_active;
          const retry = await supabase
            .from("event_settings")
            .update(safePayload)
            .eq("id", 1)
            .select()
            .single();
          if (!retry.error) {
            return { ...updatedLocal, ...retry.data };
          }
        }
        console.warn("Supabase update error (retained local update):", error.message);
        return updatedLocal;
      }

      const res = { ...updatedLocal, ...data };
      if (typeof updates.active_wave !== "undefined") {
        res.active_wave = updates.active_wave;
      }
      if (typeof updates.voting_active_wave !== "undefined") {
        res.voting_active_wave = updates.voting_active_wave;
      }
      return res;
    } catch (err) {
      console.warn("Network error during updateEventSettings (retained local update):", err.message);
      return updatedLocal;
    }
  },

  // Get candidate profile by wallet address
  getCandidate: async (walletAddress) => {
    if (!walletAddress) return null;

    try {
      const { data, error } = await supabase
        .from("candidates")
        .select("*")
        .ilike("wallet_address", walletAddress.toLowerCase())
        .maybeSingle();

      if (error) {
        console.error("Error fetching candidate from Supabase:", error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.warn("Network error fetching candidate:", err.message);
      return null;
    }
  },

  // Get candidate profile by registration number
  getCandidateByRegNo: async (regNo) => {
    if (!regNo) return null;

    try {
      const { data, error } = await supabase
        .from("candidates")
        .select("*")
        .ilike("reg_no", regNo.trim())
        .maybeSingle();

      if (error) {
        console.error("Error fetching candidate by reg_no from Supabase:", error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.warn("Network error fetching candidate by reg_no:", err.message);
      return null;
    }
  },

  // Register or save new candidate
  saveCandidate: async (candidateData) => {
    const payload = {
      has_claimed_badge: false,
      tx_hash: null,
      tier: 1,
      ...candidateData,
      wallet_address: candidateData.wallet_address.toLowerCase(),
    };

    const { data, error } = await supabase
      .from("candidates")
      .upsert([payload], { onConflict: "reg_no" })
      .select()
      .single();

    if (error) {
      console.error("Error saving candidate to Supabase:", error.message);
      throw error;
    }
    return data;
  },

  // Update candidate tier or claim status
  updateCandidate: async (walletAddress, updates) => {
    if (!walletAddress) return null;
    const cleanAddr = walletAddress.toLowerCase();

    // Cache vote details locally so client state is always preserved
    if (updates.voted_option || updates.vote_tx_hash) {
      try {
        localStorage.setItem(`vjti_vote_data_${cleanAddr}`, JSON.stringify({
          voted_option: updates.voted_option,
          vote_tx_hash: updates.vote_tx_hash,
          updated_at: new Date().toISOString()
        }));
      } catch (e) {
        // Ignore localStorage quota errors
      }
    }

    try {
      let { data, error } = await supabase
        .from("candidates")
        .update(updates)
        .ilike("wallet_address", cleanAddr)
        .select()
        .single();

      // If update fails due to schema difference (e.g. voted_option or vote_tx_hash not yet migrated)
      if (error && (error.code === "PGRST204" || error.message?.includes("column") || error.message?.includes("schema cache"))) {
        console.warn("Schema difference in candidates table, retrying with core columns:", error.message);
        const safeUpdates = { ...updates };
        delete safeUpdates.voted_option;
        delete safeUpdates.vote_tx_hash;
        delete safeUpdates.wave;
        delete safeUpdates.claimed_tiers;

        if (Object.keys(safeUpdates).length > 0) {
          const retry = await supabase
            .from("candidates")
            .update(safeUpdates)
            .ilike("wallet_address", cleanAddr)
            .select()
            .single();
          if (!retry.error) {
            return { ...retry.data, ...updates };
          }
        }
        return { wallet_address: cleanAddr, ...updates };
      }

      if (error) {
        console.warn("Error updating candidate in Supabase (retaining local state):", error.message);
        return { wallet_address: cleanAddr, ...updates };
      }
      return data;
    } catch (err) {
      console.warn("Network error updating candidate:", err.message);
      return { wallet_address: cleanAddr, ...updates };
    }
  },

  // Fetch all candidates for Admin Dashboard
  getAllCandidates: async () => {
    try {
      const { data, error } = await supabase
        .from("candidates")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching all candidates from Supabase:", error.message);
        return [];
      }
      return data || [];
    } catch (err) {
      console.warn("Network error fetching all candidates:", err.message);
      return [];
    }
  }
};
