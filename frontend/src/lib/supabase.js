import { createClient } from "@supabase/supabase-js";

// Read Supabase credentials from environment variables (supports anon key or publishable key)
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "";

// Direct Supabase client instance
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Direct Database Service interacting strictly with Supabase PostgreSQL
 */
export const dbService = {
  // Fetch event settings (badge_claim_active, voting_active, admin_password_hash)
  getEventSettings: async () => {
    const { data, error } = await supabase
      .from("event_settings")
      .select("id, voting_active, badge_claim_active, admin_password_hash, updated_at")
      .eq("id", 1)
      .single();

    if (error) {
      console.error("Error fetching event_settings from Supabase:", error.message);
      throw error;
    }
    return data;
  },

  // Update event settings
  updateEventSettings: async (updates) => {
    const { data, error } = await supabase
      .from("event_settings")
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq("id", 1)
      .select()
      .single();

    if (error) {
      console.error("Error updating event_settings in Supabase:", error.message);
      throw error;
    }
    return data;
  },

  // Get candidate profile by wallet address
  getCandidate: async (walletAddress) => {
    if (!walletAddress) return null;

    const { data, error } = await supabase
      .from("candidates")
      .select("id, name, reg_no, branch, wallet_address, tier, has_claimed_badge, tx_hash, created_at")
      .ilike("wallet_address", walletAddress.toLowerCase())
      .maybeSingle();

    if (error) {
      console.error("Error fetching candidate from Supabase:", error.message);
      throw error;
    }
    return data;
  },

  // Get candidate profile by registration number
  getCandidateByRegNo: async (regNo) => {
    if (!regNo) return null;

    const { data, error } = await supabase
      .from("candidates")
      .select("id, name, reg_no, branch, wallet_address, tier, has_claimed_badge, tx_hash, created_at")
      .ilike("reg_no", regNo.trim())
      .maybeSingle();

    if (error) {
      console.error("Error fetching candidate by reg_no from Supabase:", error.message);
      throw error;
    }
    return data;
  },

  // Register or save new candidate
  saveCandidate: async (candidateData) => {
    const payload = {
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
    const { data, error } = await supabase
      .from("candidates")
      .update(updates)
      .ilike("wallet_address", walletAddress.toLowerCase())
      .select()
      .single();

    if (error) {
      console.error("Error updating candidate in Supabase:", error.message);
      throw error;
    }
    return data;
  },

  // Fetch all candidates for Admin Dashboard
  getAllCandidates: async () => {
    const { data, error } = await supabase
      .from("candidates")
      .select("id, name, reg_no, branch, wallet_address, tier, has_claimed_badge, tx_hash, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching all candidates from Supabase:", error.message);
      throw error;
    }
    return data || [];
  }
};
