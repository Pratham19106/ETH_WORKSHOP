import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Wallet,
  ShieldCheck,
  Award,
  Lock,
  ExternalLink,
  Loader2,
  Sparkles,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Vote,
  UserCheck,
  ChevronRight,
  Network,
  LogOut,
  Trophy,
  Crown,
  Clock
} from "lucide-react";
import { useWeb3 } from "../hooks/useWeb3";
import { dbService, getCandidateWave, isCandidateEligibleForTier } from "../lib/supabase";
import { BADGE_TIERS, NETWORK_CONFIG, CONTRACT_ADDRESS } from "../config/network";
import BlockchainBackgroundAccents from "../components/BlockchainBackgroundAccents";

export default function AttendeeHub() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    account,
    shortenAddress,
    balance,
    connect,
    isCorrectNetwork,
    switchNetwork,
    mintBadgeTx,
    checkHasMintedTierOnChain,
    checkHasFullSetOnChain
  } = useWeb3();

  // Active Candidate Session state
  const [candidate, setCandidate] = useState(null);

  // Mint Tx Flow State: 'Idle' | 'Connecting Wallet...' | 'Validating Network...' | 'Awaiting Signature...' | 'Mining on-chain...' | 'Mint Confirmed!' | 'Failed'
  const [mintStatus, setMintStatus] = useState("Idle");
  const [activeMintTier, setActiveMintTier] = useState(null);
  const [txHash, setTxHash] = useState(null);
  const [mintError, setMintError] = useState(null);

  // Load candidate session from localStorage
  useEffect(() => {
    const sessionUserStr = localStorage.getItem("vjti_eth_user");
    if (sessionUserStr) {
      try {
        setCandidate(JSON.parse(sessionUserStr));
      } catch (err) {
        console.warn("Failed to parse user session:", err);
      }
    }
  }, []);

  // TanStack Query 1: Fetch Event Settings (badge_claim_active, voting_active, phases, active_wave)
  const { data: settings = { voting_active: false, badge_claim_active: true, phase1_active: true, phase2_active: false, phase3_active: false, active_wave: 99 } } = useQuery({
    queryKey: ["event_settings"],
    queryFn: () => dbService.getEventSettings(),
    refetchInterval: 4000,
  });

  // TanStack Query 2: Fetch Current Candidate Profile & Level
  const targetWallet = account || candidate?.wallet_address;
  const { data: currentCandidate = candidate, refetch: refetchCandidate } = useQuery({
    queryKey: ["candidate", targetWallet],
    queryFn: () => dbService.getCandidate(targetWallet),
    enabled: Boolean(targetWallet),
    initialData: candidate,
    refetchInterval: 4000,
  });

  // TanStack Query 3: On-Chain Mint Status for all 3 Tiers
  const { data: onChainClaims = { 1: false, 2: false, 3: false }, refetch: refetchOnChainClaims } = useQuery({
    queryKey: ["on_chain_claims", targetWallet],
    queryFn: async () => {
      if (!targetWallet) return { 1: false, 2: false, 3: false };
      try {
        const [t1, t2, t3] = await Promise.all([
          checkHasMintedTierOnChain(1, targetWallet),
          checkHasMintedTierOnChain(2, targetWallet),
          checkHasMintedTierOnChain(3, targetWallet),
        ]);
        return { 1: t1, 2: t2, 3: t3 };
      } catch (e) {
        return { 1: false, 2: false, 3: false };
      }
    },
    enabled: Boolean(targetWallet),
    refetchInterval: 5000,
  });

  // Anti-throttling wave for Phase 1
  const attendeeWave = getCandidateWave(currentCandidate);
  const activeWave = typeof settings.active_wave === "number" ? settings.active_wave : 99;
  const isWave1Ready = activeWave === 99 || activeWave >= attendeeWave;

  // Calculation of collected badges
  const isTier1Claimed = Boolean(onChainClaims[1] || currentCandidate?.has_claimed_badge);
  const isTier2Claimed = Boolean(onChainClaims[2]);
  const isTier3Claimed = Boolean(onChainClaims[3]);

  const claimedCount = (isTier1Claimed ? 1 : 0) + (isTier2Claimed ? 1 : 0) + (isTier3Claimed ? 1 : 0);
  const isFullSetWinner = claimedCount === 3;

  // Handle Badge Mint Action for a specific Tier
  const handleClaimBadge = async (tierId) => {
    setActiveMintTier(tierId);
    setMintError(null);
    setTxHash(null);

    // 1. Global pause validation
    if (settings.badge_claim_active === false) {
      setMintError("Badge claiming is currently paused globally by administrator.");
      return;
    }

    // 2. Phase-specific validations
    if (tierId === 1) {
      if (settings.phase1_active === false) {
        setMintError("Phase 1 claiming is temporarily paused by administrator.");
        return;
      }
      if (!isWave1Ready) {
        setMintError(`Your wave (Wave ${attendeeWave}) is not active yet. Currently minting: Wave ${activeWave}. Please wait for your wave!`);
        return;
      }
    } else if (tierId === 2) {
      if (!settings.phase2_active) {
        setMintError("Phase 2 (Synced Node) has not been rolled out yet. Stay tuned!");
        return;
      }
      if (!isCandidateEligibleForTier(currentCandidate, 2)) {
        setMintError("You have not unlocked Tier 2 yet. Complete the workshop challenge to qualify!");
        return;
      }
    } else if (tierId === 3) {
      if (!settings.phase3_active) {
        setMintError("Phase 3 (Validator) has not been rolled out yet. Stay tuned!");
        return;
      }
      if (!isCandidateEligibleForTier(currentCandidate, 3)) {
        setMintError("Tier 3 is reserved for Top Hackathon Winners and exceptional contributors!");
        return;
      }
    }

    try {
      // 3. Execute Web3 mint transaction for specified tier
      const result = await mintBadgeTx(tierId, (status, hash, err) => {
        setMintStatus(status);
        if (hash) setTxHash(hash);
        if (err) setMintError(err);
      });

      // 4. Update candidate in Supabase
      const activeAddress = result.account || targetWallet;
      await dbService.updateCandidate(activeAddress, {
        has_claimed_badge: true,
        tx_hash: result.hash,
      });

      // 5. Invalidate queries for instant UI sync
      queryClient.invalidateQueries(["candidate", targetWallet]);
      queryClient.invalidateQueries(["on_chain_claims", targetWallet]);
      await Promise.all([refetchCandidate(), refetchOnChainClaims()]);
    } catch (err) {
      console.error(`Tier ${tierId} badge minting failed:`, err);
    }
  };

  // Add NFT asset to MetaMask wallet
  const handleWatchAsset = async (tierId = 1) => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_watchAsset",
        params: {
          type: "ERC721",
          options: {
            address: CONTRACT_ADDRESS,
            tokenId: String(tierId),
          },
        },
      });
    } catch (err) {
      console.warn("wallet_watchAsset not supported or dismissed:", err);
    }
  };

  // Handle Logout / Account Switch
  const handleLogout = () => {
    localStorage.removeItem("vjti_eth_user");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-cyber-void text-slate-100 cyber-grid-bg flex flex-col justify-between relative overflow-hidden font-mono">

      {/* Atmospheric Neon Accents */}
      <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-neon-magenta/15 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[700px] h-[700px] bg-neon-cyan/15 rounded-full blur-[180px] pointer-events-none" />
      <div className="absolute top-[40%] left-[30%] w-[450px] h-[450px] bg-eth-purple/20 rounded-full blur-[150px] pointer-events-none" />

      <BlockchainBackgroundAccents />

      {/* Header Bar */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-cyber-void/80 border-b border-cyber-border/40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 sm:h-[84px] flex items-center justify-between">

          <div className="flex items-center space-x-2.5 sm:space-x-3.5">
            <img
              src="/ETH_VJTI.jpg"
              alt="ETH VJTI Logo"
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl object-cover border border-neon-cyan/40 shadow-md shadow-neon-cyan/20 ring-2 ring-neon-cyan/30 shrink-0"
            />
            <div>
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <span className="font-heading font-extrabold text-lg sm:text-[1.35rem] tracking-tight text-white glow-cyan">
                  Attendee Hub
                </span>
                <span className="text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-full bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30 font-bold">
                  Base Sepolia
                </span>
              </div>
              <p className="text-[11px] sm:text-[0.8rem] text-slate-400 max-w-[130px] sm:max-w-none truncate">
                {currentCandidate ? `${currentCandidate.name} (${currentCandidate.reg_no})` : "Candidate Session Active"}
              </p>
            </div>
          </div>

          {/* Activity Navigation Pills */}
          <div className="hidden md:flex items-center space-x-2 bg-slate-950/80 p-1 rounded-2xl border border-slate-800">
            <div className="px-4 py-2 rounded-xl text-xs font-black transition-all bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/40 flex items-center space-x-2 shadow-sm">
              <Award className="w-4 h-4 text-neon-cyan" />
              <span>NFT Badges Hub</span>
            </div>
            <Link
              to="/vote"
              className="px-4 py-2 rounded-xl text-xs font-bold transition-all text-slate-400 hover:text-white flex items-center space-x-2"
            >
              <Vote className="w-4 h-4 text-eth-purple" />
              <span>Voting Arena</span>
            </Link>
          </div>

          {/* Connected Account & Actions */}
          <div className="flex items-center space-x-2 sm:space-x-3">
            {account ? (
              <div className="flex items-center space-x-1.5 sm:space-x-2 bg-slate-900/90 border border-cyber-border/60 rounded-full p-1 sm:p-1.5 pl-2.5 sm:pl-4 text-[11px] sm:text-xs">
                <button
                  onClick={switchNetwork}
                  className={`flex items-center space-x-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full font-medium ${isCorrectNetwork
                    ? "bg-neon-green/10 text-neon-green border border-neon-green/30"
                    : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                    }`}
                >
                  <Network className="w-3 h-3 shrink-0" />
                  <span className="hidden xs:inline sm:inline">{isCorrectNetwork ? `● ${NETWORK_CONFIG.chainName}` : "Switch Net"}</span>
                  <span className="xs:hidden sm:hidden">{isCorrectNetwork ? "● Base" : "Switch"}</span>
                </button>
                <span className="font-mono text-slate-300 font-bold">{shortenAddress(account)}</span>
                <span className="hidden sm:inline bg-slate-950 border border-slate-800 px-2.5 py-1 rounded-full text-slate-400 font-mono text-[11px]">
                  {balance} ETH
                </span>
              </div>
            ) : (
              <button
                onClick={connect}
                className="flex items-center space-x-1.5 sm:space-x-2 bg-gradient-to-r from-neon-cyan to-eth-purple text-slate-950 font-bold px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs shadow-lg shadow-neon-cyan/20 transition-all hover:scale-105 active:scale-95"
              >
                <Wallet className="w-3.5 h-3.5 shrink-0" />
                <span>Connect Wallet</span>
              </button>
            )}

            <button
              onClick={handleLogout}
              title="Logout Candidate"
              className="p-2 sm:p-2.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400 hover:text-rose-400 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-3 sm:px-6 pt-24 sm:pt-20 pb-10 w-full flex-1 space-y-6 sm:space-y-8 relative z-10">

        {/* Absolute Top-Right Badges Score Counter (Always on top) */}
        <div className="absolute top-3 right-3 sm:top-4 sm:right-6 z-30 flex items-center space-x-2 sm:space-x-3 bg-slate-950/90 border border-slate-800 px-3 py-1.5 sm:px-4 sm:py-2.5 rounded-xl sm:rounded-2xl shadow-xl backdrop-blur-md">
          <Trophy className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400 shrink-0" />
          <div>
            <div className="text-[9px] sm:text-[10px] uppercase font-bold text-slate-500 tracking-wider">Node Badges Collected</div>
            <div className="text-sm sm:text-base font-black text-white font-mono flex items-center space-x-1.5">
              <span className={claimedCount > 0 ? "text-neon-cyan" : "text-slate-400"}>{claimedCount}</span>
              <span className="text-slate-600">/</span>
              <span className="text-slate-300">3 Badges</span>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Pill */}
        <div className="flex md:hidden items-center justify-center space-x-2 bg-slate-950/90 p-1 rounded-xl border border-slate-800 max-w-xs mx-auto shadow-md mb-2">
          <div className="flex-1 text-center py-2 rounded-lg text-xs font-black bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/40">
            NFT Badges
          </div>
          <Link
            to="/vote"
            className="flex-1 text-center py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-white"
          >
            Voting
          </Link>
        </div>

        {/* Absolute Winner Banner (Unlocked when 3/3 Badges Collected) */}
        {isFullSetWinner && (
          <div className="p-4 sm:p-6 rounded-2xl sm:rounded-3xl bg-gradient-to-r from-amber-500/20 via-purple-600/30 to-neon-magenta/20 border-2 border-amber-400/60 shadow-2xl shadow-amber-500/20 text-center space-y-2 relative overflow-hidden animate-pulse">
            <div className="flex items-center justify-center space-x-2 text-amber-300 font-black text-base sm:text-xl tracking-tight">
              <Crown className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400 shrink-0" />
              <span>🏆 ABSOLUTE WINNER: FULL NODE SET (3/3)!</span>
              <Crown className="w-5 h-5 sm:w-6 sm:h-6 text-amber-400 shrink-0" />
            </div>
            <p className="text-xs text-amber-200/90 max-w-2xl mx-auto font-mono">
              Congratulations {currentCandidate?.name || "Candidate"}! You hold the Light Node, Synced Node, and Validator badges. You have achieved maximum decentralized mastery in the ETH VJTI Workshop!
            </p>
          </div>
        )}

        {/* 2. Gamified 3-Phase Node Badge Quest Grid */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1.5 sm:gap-4">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-neon-cyan shrink-0" />
              <h3 className="font-heading text-lg sm:text-xl font-bold text-white">Workshop 3-Phase Node Quests</h3>
            </div>
            <span className="text-xs text-slate-400 font-mono leading-relaxed">
              Show your enthusiastic participation and unlock exclusive NFT badges for each phase of the workshop!
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">

            {/* ============================================================= */}
            {/* TIER 1: LIGHT NODE (PHASE 1 - ALL ATTENDEES, WAVE CONTROLLED) */}
            {/* ============================================================= */}
            <div className={`cyber-glass rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl relative border flex flex-col justify-between transition-all ${isTier1Claimed ? "border-amber-500/50 bg-amber-950/10" : "border-cyber-border/60 hover:border-amber-500/30"
              }`}>
              <div className="space-y-4">
                {/* Artwork */}
                <div className="relative group rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 aspect-square flex items-center justify-center p-3 sm:p-4 shadow-xl max-h-[300px] sm:max-h-none mx-auto w-full">
                  <div className="absolute inset-0 bg-gradient-to-br from-amber-700/20 to-amber-900/30 pointer-events-none" />
                  <img
                    src={BADGE_TIERS[1].image}
                    alt={BADGE_TIERS[1].name}
                    className="w-full h-full object-contain rounded-xl transform group-hover:scale-105 transition-transform duration-500 drop-shadow-[0_10px_25px_rgba(245,158,11,0.25)]"
                  />
                  <div className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3 bg-slate-950/90 backdrop-blur-md border border-slate-700 text-amber-400 px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-bold shadow-md">
                    Phase 1: {BADGE_TIERS[1].name}
                  </div>
                  {isTier1Claimed && (
                    <div className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 bg-neon-green/90 text-slate-950 px-2 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black flex items-center space-x-1 shadow-md">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>CLAIMED</span>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div>
                  <span className="text-[11px] uppercase font-bold text-amber-400 tracking-wider block">
                    {BADGE_TIERS[1].subtitle}
                  </span>
                  <h4 className="font-heading text-lg font-bold text-white mt-0.5">
                    {BADGE_TIERS[1].title}
                  </h4>

                </div>

                {/* Pacing Info */}

              </div>

              {/* Action Button */}
              <div className="pt-5">
                {isTier1Claimed ? (
                  <div className="space-y-2">
                    <button
                      disabled
                      className="w-full bg-slate-900/90 border border-amber-500/40 text-amber-300 font-bold py-3.5 px-4 rounded-xl flex items-center justify-center space-x-2 cursor-not-allowed"
                    >
                      <CheckCircle2 className="w-4 h-4 text-neon-green" />
                      <span>Tier 1 Claimed</span>
                    </button>
                    <button
                      onClick={() => handleWatchAsset(1)}
                      className="w-full text-center text-[10px] text-amber-400 hover:underline font-bold"
                    >
                      + Import to MetaMask
                    </button>
                  </div>
                ) : !settings.badge_claim_active || settings.phase1_active === false ? (
                  <button
                    disabled
                    className="w-full bg-slate-900 border border-slate-800 text-slate-500 font-bold py-3.5 px-4 rounded-xl flex items-center justify-center space-x-1.5 cursor-not-allowed text-xs"
                  >
                    <Clock className="w-4 h-4 text-slate-600" />
                    <span>Light Node Paused</span>
                  </button>
                ) : !isWave1Ready ? (
                  <button
                    disabled
                    className="w-full bg-slate-900/90 border border-amber-500/40 text-amber-300 font-bold py-3.5 px-4 rounded-xl flex items-center justify-center space-x-1.5 cursor-not-allowed shadow-lg shadow-amber-500/10 text-xs"
                  >
                    <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                    <span>Wave {attendeeWave} in Queue (Active: W{activeWave})</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleClaimBadge(1)}
                    disabled={activeMintTier === 1 && mintStatus.includes("...")}
                    className="w-full bg-gradient-to-r from-amber-600 via-amber-500 to-yellow-500 hover:opacity-95 text-slate-950 font-black py-3.5 px-4 rounded-xl shadow-lg shadow-amber-500/25 flex items-center justify-center space-x-2 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                  >
                    {activeMintTier === 1 && mintStatus.includes("...") ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{mintStatus}</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Claim Light Node Badge</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* ============================================================= */}
            {/* TIER 2: SYNCED NODE (PHASE 2 - ACTIVE BUILDERS, NO WAVES)     */}
            {/* ============================================================= */}
            <div className={`cyber-glass rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl relative border flex flex-col justify-between transition-all ${isTier2Claimed ? "border-cyan-500/50 bg-cyan-950/10" : "border-cyber-border/60 hover:border-cyan-500/30"
              }`}>
              <div className="space-y-4">
                {/* Artwork */}
                <div className="relative group rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 aspect-square flex items-center justify-center p-3 sm:p-4 shadow-xl max-h-[300px] sm:max-h-none mx-auto w-full">
                  <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-blue-900/30 pointer-events-none" />
                  <img
                    src={BADGE_TIERS[2].image}
                    alt={BADGE_TIERS[2].name}
                    className="w-full h-full object-contain rounded-xl transform group-hover:scale-105 transition-transform duration-500 drop-shadow-[0_10px_25px_rgba(0,240,255,0.25)]"
                  />
                  <div className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3 bg-slate-950/90 backdrop-blur-md border border-slate-700 text-neon-cyan px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-bold shadow-md">
                    Phase 2: {BADGE_TIERS[2].name}
                  </div>
                  {isTier2Claimed && (
                    <div className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 bg-neon-green/90 text-slate-950 px-2 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black flex items-center space-x-1 shadow-md">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>CLAIMED</span>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div>
                  <span className="text-[11px] uppercase font-bold text-neon-cyan tracking-wider block">
                    {BADGE_TIERS[2].subtitle}
                  </span>
                  <h4 className="font-heading text-lg font-bold text-white mt-0.5">
                    {BADGE_TIERS[2].title}
                  </h4>

                </div>

                {/* Pacing Info */}
              </div>

              {/* Action Button */}
              <div className="pt-5">
                {isTier2Claimed ? (
                  <div className="space-y-2">
                    <button
                      disabled
                      className="w-full bg-slate-900/90 border border-cyan-500/40 text-cyan-300 font-bold py-3.5 px-4 rounded-xl flex items-center justify-center space-x-2 cursor-not-allowed"
                    >
                      <CheckCircle2 className="w-4 h-4 text-neon-green" />
                      <span>Tier 2 Claimed</span>
                    </button>
                    <button
                      onClick={() => handleWatchAsset(2)}
                      className="w-full text-center text-[10px] text-neon-cyan hover:underline font-bold"
                    >
                      + Import to MetaMask
                    </button>
                  </div>
                ) : !settings.phase2_active ? (
                  <button
                    disabled
                    className="w-full bg-slate-900 border border-slate-800 text-slate-500 font-bold py-3.5 px-4 rounded-xl flex items-center justify-center space-x-1.5 cursor-not-allowed text-xs"
                  >
                    <Clock className="w-4 h-4 text-slate-600" />
                    <span>You can be a Synced Node</span>
                  </button>
                ) : !isCandidateEligibleForTier(currentCandidate, 2) ? (
                  <button
                    disabled
                    className="w-full bg-slate-900/80 border border-slate-800 text-slate-400 font-bold py-3.5 px-4 rounded-xl flex items-center justify-center space-x-1.5 cursor-not-allowed text-xs"
                  >
                    <Lock className="w-4 h-4 text-slate-500" />
                    <span>Awaiting Qualification</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleClaimBadge(2)}
                    disabled={activeMintTier === 2 && mintStatus.includes("...")}
                    className="w-full bg-gradient-to-r from-neon-cyan via-teal-400 to-indigo-500 hover:opacity-95 text-slate-950 font-black py-3.5 px-4 rounded-xl shadow-lg shadow-neon-cyan/25 flex items-center justify-center space-x-2 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                  >
                    {activeMintTier === 2 && mintStatus.includes("...") ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{mintStatus}</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Claim Synced Node Badge</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* ============================================================= */}
            {/* TIER 3: VALIDATOR (PHASE 3 - TOP WINNERS, NO WAVES)           */}
            {/* ============================================================= */}
            <div className={`cyber-glass rounded-2xl sm:rounded-3xl p-4 sm:p-6 shadow-2xl relative border flex flex-col justify-between transition-all ${isTier3Claimed ? "border-neon-magenta/50 bg-pink-950/10" : "border-cyber-border/60 hover:border-neon-magenta/30"
              }`}>
              <div className="space-y-4">
                {/* Artwork */}
                <div className="relative group rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 aspect-square flex items-center justify-center p-3 sm:p-4 shadow-xl max-h-[300px] sm:max-h-none mx-auto w-full">
                  <div className="absolute inset-0 bg-gradient-to-br from-pink-500/20 to-purple-900/30 pointer-events-none" />
                  <img
                    src={BADGE_TIERS[3].image}
                    alt={BADGE_TIERS[3].name}
                    className="w-full h-full object-contain rounded-xl transform group-hover:scale-105 transition-transform duration-500 drop-shadow-[0_10px_25px_rgba(255,0,122,0.25)]"
                  />
                  <div className="absolute top-2.5 left-2.5 sm:top-3 sm:left-3 bg-slate-950/90 backdrop-blur-md border border-slate-700 text-neon-magenta px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-[11px] font-bold shadow-md">
                    Phase 3: {BADGE_TIERS[3].name}
                  </div>
                  {isTier3Claimed && (
                    <div className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 bg-neon-green/90 text-slate-950 px-2 sm:px-2.5 py-0.5 rounded-full text-[9px] sm:text-[10px] font-black flex items-center space-x-1 shadow-md">
                      <CheckCircle2 className="w-3 h-3" />
                      <span>CLAIMED</span>
                    </div>
                  )}
                </div>

                {/* Details */}
                <div>
                  <span className="text-[11px] uppercase font-bold text-neon-magenta tracking-wider block">
                    {BADGE_TIERS[3].subtitle}
                  </span>
                  <h4 className="font-heading text-lg font-bold text-white mt-0.5">
                    {BADGE_TIERS[3].title}
                  </h4>
                </div>

                {/* Pacing Info */}

              </div>

              {/* Action Button */}
              <div className="pt-5">
                {isTier3Claimed ? (
                  <div className="space-y-2">
                    <button
                      disabled
                      className="w-full bg-slate-900/90 border border-neon-magenta/40 text-pink-300 font-bold py-3.5 px-4 rounded-xl flex items-center justify-center space-x-2 cursor-not-allowed"
                    >
                      <CheckCircle2 className="w-4 h-4 text-neon-green" />
                      <span>Tier 3 Claimed</span>
                    </button>
                    <button
                      onClick={() => handleWatchAsset(3)}
                      className="w-full text-center text-[10px] text-neon-magenta hover:underline font-bold"
                    >
                      + Import to MetaMask
                    </button>
                  </div>
                ) : !settings.phase3_active ? (
                  <button
                    disabled
                    className="w-full bg-slate-900 border border-slate-800 text-slate-500 font-bold py-3.5 px-4 rounded-xl flex items-center justify-center space-x-1.5 cursor-not-allowed text-xs"
                  >
                    <Clock className="w-4 h-4 text-slate-600" />
                    <span>Only The Best Become Validators</span>
                  </button>
                ) : !isCandidateEligibleForTier(currentCandidate, 3) ? (
                  <button
                    disabled
                    className="w-full bg-slate-900/80 border border-slate-800 text-slate-400 font-bold py-3.5 px-4 rounded-xl flex items-center justify-center space-x-1.5 cursor-not-allowed text-xs"
                  >
                    <Lock className="w-4 h-4 text-slate-500" />
                    <span>Winners & Finalists Only</span>
                  </button>
                ) : (
                  <button
                    onClick={() => handleClaimBadge(3)}
                    disabled={activeMintTier === 3 && mintStatus.includes("...")}
                    className="w-full bg-gradient-to-r from-neon-magenta via-purple-600 to-amber-400 hover:opacity-95 text-white font-black py-3.5 px-4 rounded-xl shadow-lg shadow-neon-magenta/25 flex items-center justify-center space-x-2 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                  >
                    {activeMintTier === 3 && mintStatus.includes("...") ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>{mintStatus}</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>Claim Validator Badge</span>
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

          </div>
        </div>

        {/* 4. Real-time Mint State Status Box */}
        {mintStatus !== "Idle" && (
          <div className="p-5 rounded-2xl bg-slate-950/90 border border-slate-800 max-w-xl mx-auto">
            <h4 className="text-xs uppercase font-bold text-slate-400 tracking-wider mb-3">
              Minting Tier {activeMintTier} Badge Progress
            </h4>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center space-x-2">
                {mintStatus === "Awaiting Signature..." ? (
                  <Loader2 className="w-4 h-4 animate-spin text-amber-400 shrink-0" />
                ) : mintStatus === "Mining on-chain..." || mintStatus === "Mint Confirmed!" ? (
                  <CheckCircle2 className="w-4 h-4 text-neon-green shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-slate-700 shrink-0" />
                )}
                <span className={mintStatus === "Awaiting Signature..." ? "text-amber-300 font-bold" : "text-slate-300"}>
                  1. MetaMask Signature Request
                </span>
              </div>

              <div className="flex items-center space-x-2">
                {mintStatus === "Mining on-chain..." ? (
                  <Loader2 className="w-4 h-4 animate-spin text-neon-cyan shrink-0" />
                ) : mintStatus === "Mint Confirmed!" ? (
                  <CheckCircle2 className="w-4 h-4 text-neon-green shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-slate-700 shrink-0" />
                )}
                <span className={mintStatus === "Mining on-chain..." ? "text-neon-cyan font-bold" : "text-slate-400"}>
                  2. Submitting Transaction on {NETWORK_CONFIG.chainName}
                </span>
              </div>

              <div className="flex items-center space-x-2">
                {mintStatus === "Mint Confirmed!" ? (
                  <CheckCircle2 className="w-4 h-4 text-neon-green shrink-0" />
                ) : mintStatus === "Failed" ? (
                  <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-slate-700 shrink-0" />
                )}
                <span className={mintStatus === "Mint Confirmed!" ? "text-neon-green font-bold" : mintStatus === "Failed" ? "text-rose-400 font-bold" : "text-slate-400"}>
                  3. {mintStatus === "Mint Confirmed!" ? "Mint Confirmed on-chain!" : mintStatus === "Failed" ? "Transaction Failed" : "Confirmation"}
                </span>
              </div>
            </div>

            {/* Confirmed Tx Hash Link */}
            {txHash && (
              <div className="mt-4 pt-3 border-t border-slate-800 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
                <span className="text-slate-400">Confirmed Tx Hash:</span>
                <a
                  href={`${NETWORK_CONFIG.blockExplorerUrl}/tx/${txHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-neon-cyan hover:underline flex items-center space-x-1.5 truncate max-w-full sm:max-w-xs"
                >
                  <span className="truncate">{shortenAddress(txHash)}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              </div>
            )}
          </div>
        )}

        {/* Error Notification */}
        {mintError && (
          <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/30 flex items-start space-x-2 text-xs text-rose-200 max-w-xl mx-auto">
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{mintError}</span>
          </div>
        )}

        {/* 5. MetaMask NFT Import Instructions Card */}


      </main>

      {/* Footer */}
      <footer className="border-t border-cyber-border/40 bg-cyber-void/90 py-6 relative z-10">
        <div className="max-w-6xl mx-auto px-4 text-center text-xs text-slate-500">
          <p>© 2026 EthVJTI.Web3 Genesis.</p>
        </div>
      </footer>

    </div>
  );
}
