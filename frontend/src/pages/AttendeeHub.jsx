import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
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
  LogOut
} from "lucide-react";
import { useWeb3 } from "../hooks/useWeb3";
import { dbService } from "../lib/supabase";
import { BADGE_TIERS, NETWORK_CONFIG } from "../config/network";
import BlockchainBackgroundAccents from "../components/BlockchainBackgroundAccents";

export default function AttendeeHub() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { account, shortenAddress, balance, connect, isCorrectNetwork, switchNetwork, mintBadgeTx, checkHasMintedOnChain } = useWeb3();

  // Active Candidate Session state
  const [candidate, setCandidate] = useState(null);

  // Mint Tx Flow State: 'Idle' | 'Connecting Wallet...' | 'Validating Network...' | 'Awaiting Signature...' | 'Mining on-chain...' | 'Mint Confirmed!' | 'Failed'
  const [mintStatus, setMintStatus] = useState("Idle");
  const [txHash, setTxHash] = useState(null);
  const [mintError, setMintError] = useState(null);

  // Load candidate session from localStorage or query by connected wallet
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

  // TanStack Query 1: Fetch Event Settings (badge_claim_active, voting_active)
  const { data: settings = { voting_active: false, badge_claim_active: true } } = useQuery({
    queryKey: ["event_settings"],
    queryFn: () => dbService.getEventSettings(),
    refetchInterval: 5000,
  });

  // TanStack Query 2: Fetch Current Candidate Profile & Tier
  const targetWallet = account || candidate?.wallet_address;
  const { data: currentCandidate = candidate, refetch: refetchCandidate } = useQuery({
    queryKey: ["candidate", targetWallet],
    queryFn: () => dbService.getCandidate(targetWallet),
    enabled: Boolean(targetWallet),
    initialData: candidate,
    refetchInterval: 4000,
  });

  // Determine Assigned Tier (Defaults to 1: Light Node if unassigned)
  const assignedTierId = currentCandidate?.tier || 1;
  const currentTier = BADGE_TIERS[assignedTierId] || BADGE_TIERS[1];
  const hasClaimed = currentCandidate?.has_claimed_badge || false;

  // Handle Badge Mint Action
  const handleClaimBadge = async () => {
    setMintError(null);
    setTxHash(null);

    // 1. Check if badge claiming is globally active
    if (!settings.badge_claim_active) {
      setMintError("Badge claiming is currently paused by the event administrator.");
      return;
    }

    try {
      // 2. Execute Web3 mint transaction for assigned tier
      const result = await mintBadgeTx(assignedTierId, (status, hash, err) => {
        setMintStatus(status);
        if (hash) setTxHash(hash);
        if (err) setMintError(err);
      });

      // 3. Update candidate claim status & tx_hash in Supabase / store
      const activeAddress = result.account || targetWallet;
      await dbService.updateCandidate(activeAddress, {
        has_claimed_badge: true,
        tx_hash: result.hash,
      });

      // Invalidate queries to refresh UI state
      queryClient.invalidateQueries(["candidate", targetWallet]);
      await refetchCandidate();
    } catch (err) {
      console.error("Badge minting failed:", err);
    }
  };

  // Handle Logout / Account Switch
  const handleLogout = () => {
    localStorage.removeItem("vjti_eth_user");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-cyber-void text-slate-100 cyber-grid-bg flex flex-col justify-between relative overflow-hidden font-mono">

      {/* Background Decorative Neon Atmosphere & Blockchain Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-neon-magenta/15 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[700px] h-[700px] bg-neon-cyan/15 rounded-full blur-[180px] pointer-events-none" />
      <div className="absolute top-[40%] left-[30%] w-[450px] h-[450px] bg-eth-purple/20 rounded-full blur-[150px] pointer-events-none" />

      <BlockchainBackgroundAccents />

      {/* Header Bar */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-cyber-void/80 border-b border-cyber-border/40">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-[84px] flex items-center justify-between">

          <div className="flex items-center space-x-3.5">
            <img
              src="/ETH_VJTI.jpg"
              alt="ETH VJTI Logo"
              className="w-11 h-11 rounded-xl object-cover border border-neon-cyan/40 shadow-md shadow-neon-cyan/20 ring-2 ring-neon-cyan/30"
            />
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-heading font-extrabold text-[1.35rem] tracking-tight text-white glow-cyan">
                  Attendee Hub
                </span>
              </div>
              <p className="text-[0.8rem] text-slate-400">
                {currentCandidate ? `${currentCandidate.name} (${currentCandidate.reg_no})` : "Candidate Session Active"}
              </p>
            </div>
          </div>

          {/* Connected Account & Balance Bar */}
          <div className="flex items-center space-x-3">
            {account ? (
              <div className="flex items-center space-x-2 bg-slate-900/90 border border-cyber-border/60 rounded-full p-1.5 pl-4 text-xs">

                {/* Network Indicator Badge */}
                <button
                  onClick={switchNetwork}
                  className={`flex items-center space-x-1 px-2.5 py-1 rounded-full font-bold transition-all ${isCorrectNetwork
                    ? "bg-neon-green/10 text-neon-green border border-neon-green/30 hover:bg-neon-green/20"
                    : "bg-amber-500/10 text-amber-400 border border-amber-500/30 hover:bg-amber-500/20"
                    }`}
                >
                  <Network className="w-3.5 h-3.5" />
                  <span>{isCorrectNetwork ? "● VJTI_NET" : "Switch Net"}</span>
                </button>

                {/* Account Address & Balance */}
                <div className="flex items-center space-x-2 px-2 border-l border-slate-800">
                  <span className="font-mono text-slate-200 font-bold">{shortenAddress(account)}</span>
                  <span className="text-neon-cyan font-bold bg-slate-950 px-2 py-0.5 rounded border border-slate-800">
                    {balance} ETH
                  </span>
                </div>

                <button
                  onClick={handleLogout}
                  className="text-slate-400 hover:text-slate-200 p-1.5 rounded-full hover:bg-slate-800 transition-colors"
                  title="Logout Session"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={connect}
                className="flex items-center space-x-2 bg-gradient-to-r from-neon-cyan via-indigo-600 to-neon-magenta hover:opacity-95 text-slate-950 font-bold px-4 py-2 rounded-full text-xs shadow-lg shadow-neon-cyan/20 transition-all hover:scale-105"
              >
                <Wallet className="w-3.5 h-3.5" />
                <span>Connect Wallet</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Attendee Dashboard Layout */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-10 w-full flex-1 space-y-8 relative z-10">

        {/* Candidate Profile Welcome Ribbon */}
        {currentCandidate && (
          <div className="cyber-glass rounded-2xl p-5 border border-cyber-border/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="flex items-center space-x-3">
              <div className="w-12 h-12 rounded-xl bg-slate-950 border border-neon-cyan/40 flex items-center justify-center text-neon-cyan font-bold text-lg">
                <UserCheck className="w-6 h-6" />
              </div>
              <div>
                <h2 className="font-heading text-lg font-bold text-white flex items-center space-x-2">
                  <span>Welcome, {currentCandidate.name}</span>
                  <span className="text-xs font-mono font-normal text-slate-400">({currentCandidate.branch})</span>
                </h2>
                <p className="text-xs text-slate-400 font-mono mt-0.5">
                  Reg No: <span className="text-neon-magenta font-bold">{currentCandidate.reg_no}</span> | Assigned Tier: <span className="text-neon-cyan font-bold">{currentTier.name}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-2 text-xs">
              <span className="text-slate-400">Claim Status:</span>
              {hasClaimed ? (
                <span className="px-3 py-1 rounded-full bg-neon-green/10 text-neon-green border border-neon-green/30 font-bold flex items-center space-x-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>NFT Badge Claimed</span>
                </span>
              ) : (
                <span className="px-3 py-1 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/30 font-bold flex items-center space-x-1">
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Eligible to Claim</span>
                </span>
              )}
            </div>
          </div>
        )}

        {/* Two Main Content Blocks: Block 1 (Voting Activity) & Block 2 (Claim Badge) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

          {/* ================================================================= */}
          {/* BLOCK 1: VOTING ACTIVITY (4 cols) */}
          {/* ================================================================= */}
          <div className="lg:col-span-4 cyber-glass rounded-3xl p-6 shadow-2xl relative border border-cyber-border/40">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-slate-800">
              <div className="flex items-center space-x-2 text-eth-purple">
                <Vote className="w-5 h-5" />
                <h3 className="font-heading text-base font-bold text-white">Voting Activity</h3>
              </div>
              <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase ${settings.voting_active
                ? "bg-neon-green/20 text-neon-green border border-neon-green/40"
                : "bg-slate-800 text-slate-400 border border-slate-700"
                }`}>
                {settings.voting_active ? "Live" : "Phase Locked"}
              </span>
            </div>

            <div className="py-6 text-center space-y-3 bg-slate-950/60 rounded-2xl border border-slate-800/80 p-4">
              <div className="w-14 h-14 rounded-2xl bg-eth-purple/10 border border-eth-purple/30 flex items-center justify-center mx-auto text-eth-purple">
                <Lock className="w-7 h-7" />
              </div>
              <h4 className="font-heading text-sm font-bold text-slate-200">
                {settings.voting_active ? "Decentralized Voting Active" : "Phase Locked by Admin"}
              </h4>
              <p className="text-xs text-slate-400 leading-relaxed">
                Decentralized Speaker/Project voting will unlock shortly. Workshop attendees will cast gasless quadratic votes.
              </p>
            </div>
          </div>

          {/* ================================================================= */}
          {/* BLOCK 2: CLAIM TIERED BADGE (8 cols) */}
          {/* ================================================================= */}
          <div className="lg:col-span-8 cyber-glass rounded-3xl p-6 sm:p-8 shadow-2xl relative border border-cyber-border/60">

            <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-neon-cyan" />
                <h3 className="font-heading text-lg font-bold text-white">Your Tiered NFT Badge</h3>
              </div>

              {/* Global Claim Status Toggle Indicator */}
              <span className={`text-xs px-3 py-1 rounded-full font-bold ${settings.badge_claim_active
                ? "bg-neon-green/10 text-neon-green border border-neon-green/30"
                : "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                }`}>
                {settings.badge_claim_active ? "Claiming Active" : "Claiming Paused"}
              </span>
            </div>

            {/* Dynamic Badge Card Display (Tier 1/2/3) */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">

              {/* Artwork Box */}
              <div className="md:col-span-5 relative group rounded-2xl overflow-hidden bg-slate-950 border border-slate-800 aspect-square flex items-center justify-center p-4 shadow-2xl">

                {/* Neon Tier Glow Frame */}
                <div className={`absolute inset-0 bg-gradient-to-br ${currentTier.badgeColor} opacity-15 pointer-events-none`} />

                <img
                  src={currentTier.image}
                  alt={currentTier.name}
                  className="w-full h-full object-contain rounded-xl transform group-hover:scale-105 transition-transform duration-500 drop-shadow-[0_15px_35px_rgba(0,240,255,0.35)]"
                />

                {/* Tier Tag Overlay */}
                <div className="absolute top-3 left-3 bg-slate-950/90 backdrop-blur-md border border-slate-700/80 text-white px-3 py-1 rounded-full text-[11px] font-bold shadow-md">
                  {currentTier.name}
                </div>
              </div>

              {/* Details & Action Info */}
              <div className="md:col-span-7 space-y-4">
                <div>
                  <span className="text-xs uppercase font-bold tracking-wider text-neon-cyan block">
                    {currentTier.subtitle}
                  </span>
                  <h2 className="font-heading text-2xl font-bold text-white tracking-tight mt-0.5">
                    {currentTier.title}
                  </h2>
                </div>

                {/* Traits list */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2">
                  {currentTier.traits.map((t, idx) => (
                    <div key={idx} className="bg-slate-950/80 border border-slate-800 rounded-xl p-2 text-left">
                      <span className="text-[10px] text-slate-500 block uppercase font-bold">{t.trait_type}</span>
                      <span className="text-xs font-bold text-slate-200 block">{t.value}</span>
                    </div>
                  ))}
                </div>

                {/* Claim Button */}
                <div className="pt-3">
                  {hasClaimed ? (
                    <div className="space-y-2">
                      <button
                        disabled
                        className="w-full bg-slate-900 border border-slate-700/60 text-slate-400 font-bold py-4 px-6 rounded-2xl flex items-center justify-center space-x-2 cursor-not-allowed"
                      >
                        <CheckCircle2 className="w-5 h-5 text-neon-green" />
                        <span>NFT Badge Minted & Claimed</span>
                      </button>
                      <p className="text-[11px] text-center text-slate-400">
                        Your wallet address <code className="text-slate-200 font-bold">{shortenAddress(targetWallet)}</code> has claimed its Tier {assignedTierId} badge.
                      </p>
                    </div>
                  ) : (
                    <button
                      onClick={handleClaimBadge}
                      disabled={!settings.badge_claim_active || mintStatus.includes("...")}
                      className="w-full bg-gradient-to-r from-neon-magenta via-purple-600 to-neon-cyan hover:opacity-95 text-white font-black py-4 px-6 rounded-2xl shadow-xl shadow-neon-magenta/25 flex items-center justify-center space-x-2 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                    >
                      {mintStatus.includes("...") ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span>{mintStatus}</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-5 h-5" />
                          <span>Claim Tier {assignedTierId} ({currentTier.name}) Badge</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

              </div>
            </div>

            {/* Real-time Mint State Status Box */}
            {mintStatus !== "Idle" && (
              <div className="mt-6 p-4 rounded-2xl bg-slate-950/90 border border-slate-800">
                <h4 className="text-xs uppercase font-bold text-slate-400 tracking-wider mb-3">
                  Transaction State Progress
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
                      2. Submitting Transaction on VJTI_NET
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
                  <div className="mt-4 pt-3 border-t border-slate-800 text-xs flex items-center justify-between">
                    <span className="text-slate-400">Confirmed Tx Hash:</span>
                    <a
                      href={`${NETWORK_CONFIG.blockExplorerUrl}/tx/${txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-neon-cyan hover:underline flex items-center space-x-1 truncate max-w-xs"
                    >
                      <span>{txHash}</span>
                      <ExternalLink className="w-3 h-3 shrink-0" />
                    </a>
                  </div>
                )}
              </div>
            )}

            {/* Error Notification */}
            {mintError && (
              <div className="mt-4 p-4 rounded-2xl bg-rose-950/40 border border-rose-500/30 flex items-start space-x-2 text-xs text-rose-200">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{mintError}</span>
              </div>
            )}

          </div>

        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-cyber-border/40 bg-cyber-void/90 py-6 relative z-10">
        <div className="max-w-6xl mx-auto px-4 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-center gap-4">
          <p>© 2026 ETH Club VJTI.</p>
          <div className="flex items-center space-x-4">
          </div>
        </div>
      </footer>

    </div>
  );
}
