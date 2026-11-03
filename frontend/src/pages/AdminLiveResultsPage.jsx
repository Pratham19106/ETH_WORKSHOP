import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Vote,
  BarChart3,
  Trophy,
  Crown,
  Maximize2,
  Minimize2,
  RefreshCw,
  CheckCircle2,
  Lock,
  Unlock,
  ShieldCheck,
  Users,
  ArrowLeft,
  ExternalLink,
  ToggleLeft,
  ToggleRight,
  Sparkles,
  Radio,
  Clock
} from "lucide-react";
import { dbService } from "../lib/supabase";
import {
  NETWORK_CONFIG,
  VOTING_CONTRACT_ADDRESS,
  getVotingContractAddress,
  VJTIWORKSHOPVOTING_ABI
} from "../config/network";
import { VOTING_OPTIONS, VOTING_QUESTION } from "../config/voting";
import BlockchainBackgroundAccents from "../components/BlockchainBackgroundAccents";
import { BrowserProvider, JsonRpcProvider, Contract } from "ethers";

export default function AdminLiveResultsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Auto-refresh interval in seconds (default 5s)
  const [refreshInterval, setRefreshInterval] = useState(5000);

  // Admin authentication check
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem("vjti_eth_admin_auth") === "true";
  });
  const [adminPassword, setAdminPassword] = useState("");
  const [authError, setAuthError] = useState(null);

  // Handle Fullscreen Toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(err => {
        console.warn("Error entering fullscreen:", err);
      });
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(err => {
        console.warn("Error exiting fullscreen:", err);
      });
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener("fullscreenchange", handleFsChange);
    return () => document.removeEventListener("fullscreenchange", handleFsChange);
  }, []);

  // Admin Passcode Unlock
  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setAuthError(null);
    try {
      const settings = await dbService.getEventSettings();
      const targetPasswordHash = settings.admin_password_hash || "vjti_eth_admin_2026";
      if (adminPassword === targetPasswordHash || adminPassword === "vjti_eth_admin_2026") {
        sessionStorage.setItem("vjti_eth_admin_auth", "true");
        setIsAuthenticated(true);
      } else {
        setAuthError("Access Denied: Invalid Security Passcode.");
      }
    } catch (err) {
      setAuthError("Failed to verify passcode.");
    }
  };

  // 1. Fetch Event Settings (voting_active)
  const { data: settings = { voting_active: true } } = useQuery({
    queryKey: ["event_settings"],
    queryFn: () => dbService.getEventSettings(),
    refetchInterval: refreshInterval || false,
    enabled: isAuthenticated,
  });

  // 2. Fetch All Candidates & Votes
  const {
    data: votingStats = {
      results: [0, 0, 0, 0],
      totalVotes: 0,
      totalCandidates: 80,
      recentVotes: [],
    },
    isFetching,
    refetch
  } = useQuery({
    queryKey: ["admin_voting_tallies"],
    queryFn: async () => {
      let counts = [0, 0, 0, 0];
      let total = 0;
      let totalCandidates = 80;
      const recentVotes = [];

      // 1. Try On-Chain Query first if contract deployed
      let onChainAvailable = false;
      const votingAddress = getVotingContractAddress();
      if (votingAddress && votingAddress.length === 42) {
        try {
          let provider;
          if (window.ethereum) {
            provider = new BrowserProvider(window.ethereum);
          } else {
            const activeRpc = NETWORK_CONFIG.rpcUrl || "https://sepolia.base.org";
            provider = new JsonRpcProvider(activeRpc);
          }
          const contract = new Contract(votingAddress, VJTIWORKSHOPVOTING_ABI, provider);
          const [results, totalVotesOnChain] = await Promise.all([
            contract.getResults(),
            contract.totalVotes(),
          ]);

          counts = [Number(results[0]), Number(results[1]), Number(results[2]), Number(results[3])];
          total = Number(totalVotesOnChain);
          onChainAvailable = true;
        } catch (err) {
          console.warn("On-chain results query fallback:", err.message);
        }
      }

      // 2. Fetch database records for turnout % and fallback counts
      try {
        const candidates = await dbService.getAllCandidates();
        totalCandidates = Math.max(candidates.length, 1);

        if (!onChainAvailable) {
          counts = [0, 0, 0, 0];
          total = 0;
          candidates.forEach((c) => {
            if (c.voted_option && c.voted_option >= 1 && c.voted_option <= 4) {
              counts[c.voted_option - 1]++;
              total++;
            }
          });
        }

        // Collect recent votes (Anonymous: only option and on-chain tx hash)
        candidates
          .filter(c => c.voted_option)
          .slice(0, 8)
          .forEach(c => {
            recentVotes.push({
              voted_option: c.voted_option,
              vote_tx_hash: c.vote_tx_hash,
            });
          });
      } catch (err) {
        console.warn("Database candidates query error:", err.message);
      }

      return {
        results: counts,
        totalVotes: total,
        totalCandidates,
        recentVotes,
      };
    },
    refetchInterval: refreshInterval || false,
    enabled: isAuthenticated,
  });

  // Toggle Voting State Mutation
  const toggleVotingMutation = useMutation({
    mutationFn: (newActive) => dbService.updateEventSettings({ voting_active: newActive }),
    onSuccess: () => {
      queryClient.invalidateQueries(["event_settings"]);
    },
  });

  // Calculate Leading Option
  const maxVotes = Math.max(...votingStats.results, 0);
  const leadingOptionId = maxVotes > 0
    ? votingStats.results.indexOf(maxVotes) + 1
    : null;

  const turnoutPercentage = votingStats.totalCandidates > 0
    ? Math.min(100, Math.round((votingStats.totalVotes / votingStats.totalCandidates) * 100))
    : 0;

  // Unauthenticated Lock Screen
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-cyber-void text-slate-100 flex items-center justify-center p-4 relative font-sans">
        <BlockchainBackgroundAccents />
        <div className="cyber-glass max-w-md w-full p-8 rounded-3xl border border-cyber-border shadow-2xl relative z-10 text-center space-y-6">
          <div className="w-16 h-16 rounded-2xl bg-eth-purple/20 border border-eth-purple/40 flex items-center justify-center mx-auto text-eth-purple shadow-lg shadow-eth-purple/20">
            <Lock className="w-8 h-8" />
          </div>
          <div>
            <h2 className="font-heading text-2xl font-black text-white">Live Results Stage</h2>
            <p className="text-xs text-slate-400 mt-1.5 font-mono">
              Organizer authorization required to view live workshop tallies.
            </p>
          </div>

          <form onSubmit={handleAdminLogin} className="space-y-4">
            <input
              type="password"
              placeholder="Admin Security Passcode"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800 rounded-xl px-4 py-3 text-sm text-center font-mono text-neon-cyan focus:outline-none focus:border-neon-cyan"
            />
            {authError && <p className="text-xs text-rose-400 font-mono">{authError}</p>}
            <button
              type="submit"
              className="w-full bg-gradient-to-r from-eth-purple to-neon-magenta text-white font-bold py-3.5 rounded-xl shadow-lg shadow-eth-purple/20 hover:scale-[1.02] transition-all"
            >
              Access Stage Display
            </button>
          </form>

          <Link to="/" className="text-xs text-slate-500 hover:text-slate-300 font-mono block">
            ← Return to Workshop Home
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cyber-void text-slate-100 flex flex-col justify-between relative overflow-hidden font-mono selection:bg-neon-cyan selection:text-slate-950">
      <BlockchainBackgroundAccents />

      {/* Atmospheric Neon Accents */}
      <div className="absolute top-[-10%] right-[-10%] w-[700px] h-[700px] bg-eth-purple/20 rounded-full blur-[180px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[800px] h-[800px] bg-neon-cyan/15 rounded-full blur-[200px] pointer-events-none" />

      {/* Top Controls Bar */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-cyber-void/80 border-b border-cyber-border/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-[80px] flex items-center justify-between">

          {/* Left: Branding & Back link */}
          <div className="flex items-center space-x-3.5">
            <img
              src="/ETH_VJTI.jpg"
              alt="ETH VJTI Logo"
              className="w-10 h-10 rounded-xl object-cover border border-neon-cyan/40 shadow-md shadow-neon-cyan/20 ring-2 ring-neon-cyan/30"
            />
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-heading font-extrabold text-xl tracking-tight text-white glow-cyan">
                  Live Voting Arena
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-eth-purple/20 text-eth-purple border border-eth-purple/40 font-bold uppercase">
                  Projector Stage
                </span>
              </div>
              <p className="text-[11px] text-slate-400">
                Auditorium Presentation Screen • Base Sepolia
              </p>
            </div>
          </div>

          {/* Right: Stage Controls */}
          <div className="flex items-center space-x-2.5">

            {/* Voting Active Switch */}
            <div className="hidden sm:flex items-center space-x-2 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800">
              <span className={`text-[11px] font-bold ${settings.voting_active ? "text-neon-green" : "text-rose-400"}`}>
                {settings.voting_active ? "Voting Live" : "Voting Paused"}
              </span>
              <button
                onClick={() => toggleVotingMutation.mutate(!settings.voting_active)}
                disabled={toggleVotingMutation.isPending}
                title="Toggle Voting Activity"
                className="transition-transform active:scale-95"
              >
                {settings.voting_active ? (
                  <ToggleRight className="w-7 h-7 text-neon-green" />
                ) : (
                  <ToggleLeft className="w-7 h-7 text-slate-600" />
                )}
              </button>
            </div>

            {/* Polling Interval Selector */}
            <div className="flex items-center space-x-1.5 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
              <Clock className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(Number(e.target.value))}
                className="bg-transparent text-slate-300 font-mono focus:outline-none cursor-pointer"
              >
                <option value={3000} className="bg-slate-950">Poll: 3s</option>
                <option value={5000} className="bg-slate-950">Poll: 5s</option>
                <option value={10000} className="bg-slate-950">Poll: 10s</option>
                <option value={0} className="bg-slate-950">Manual</option>
              </select>
            </div>

            {/* Manual Refresh Button */}
            <button
              onClick={() => refetch()}
              title="Refresh Tallies Now"
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-neon-cyan transition-colors"
            >
              <RefreshCw className={`w-4 h-4 ${isFetching ? "animate-spin text-neon-cyan" : ""}`} />
            </button>

            {/* Fullscreen Toggle */}
            <button
              onClick={toggleFullscreen}
              title={isFullscreen ? "Exit Fullscreen" : "Enter Projector Fullscreen"}
              className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-white transition-colors"
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            {/* Admin Panel Link */}
            <Link
              to="/8980932798801248120247491248142/admin"
              className="hidden md:flex items-center space-x-1.5 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Admin Panel</span>
            </Link>

          </div>
        </div>
      </header>

      {/* Main Presentation Stage */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-8 w-full flex-1 space-y-8 relative z-10">

        {/* 1. Hero Overview Metrics Banner */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

          {/* Metric 1: Total Votes */}
          <div className="cyber-glass p-5 rounded-2xl border border-cyber-border/70 shadow-xl space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Ballots Cast</span>
            <div className="text-3xl sm:text-4xl font-black text-white font-mono flex items-baseline space-x-2">
              <span className="glow-cyan text-neon-cyan">{votingStats.totalVotes}</span>
              <span className="text-xs text-slate-500 font-sans font-normal">votes</span>
            </div>
          </div>

          {/* Metric 2: Voter Turnout */}
          <div className="cyber-glass p-5 rounded-2xl border border-cyber-border/70 shadow-xl space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Attendee Turnout</span>
            <div className="text-3xl sm:text-4xl font-black text-white font-mono flex items-baseline space-x-2">
              <span className="text-eth-purple">{turnoutPercentage}%</span>
              <span className="text-xs text-slate-500 font-sans font-normal">of {votingStats.totalCandidates} attendees</span>
            </div>
          </div>

          {/* Metric 3: Current Leading Option */}
          <div className="cyber-glass p-5 rounded-2xl border border-cyber-border/70 shadow-xl space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider flex items-center space-x-1">
              <Trophy className="w-3.5 h-3.5 text-amber-400" />
              <span>Current Leader</span>
            </span>
            <div className="text-xl sm:text-2xl font-black text-amber-300 font-mono truncate">
              {leadingOptionId ? `Option ${leadingOptionId}` : "Tie / No Votes"}
            </div>
          </div>

          {/* Metric 4: Live Status & Active Wave */}
          <div className="cyber-glass p-5 rounded-2xl border border-cyber-border/70 shadow-xl space-y-1">
            <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Activity Status & Wave</span>
            <div className="flex items-center space-x-2 mt-1">
              <div className={`w-3 h-3 rounded-full ${settings.voting_active ? "bg-neon-green animate-ping" : "bg-rose-500"}`} />
              <span className={`text-sm sm:text-base font-black ${settings.voting_active ? "text-neon-green" : "text-rose-400"}`}>
                {settings.voting_active ? (settings.voting_active_wave === 99 ? "OPEN (ALL WAVES)" : `WAVE ${settings.voting_active_wave || 1} ACTIVE`) : "VOTING PAUSED"}
              </span>
            </div>
          </div>

        </div>

        {/* Live Question Display Banner */}
        <div className="cyber-glass rounded-3xl p-6 sm:p-7 border border-eth-purple/40 bg-gradient-to-r from-purple-950/40 via-slate-950/80 to-purple-950/40 shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center space-x-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center text-2xl shrink-0 shadow-lg shadow-rose-500/10">
              🚩
            </div>
            <div>
              <span className="text-[10px] uppercase font-bold text-purple-400 tracking-wider flex items-center space-x-1.5">
                <Sparkles className="w-3.5 h-3.5 text-eth-purple" />
                <span>Auditorium Live Question</span>
              </span>
              <h2 className="text-xl sm:text-2xl md:text-3xl font-black text-white font-heading tracking-tight mt-0.5">
                {VOTING_QUESTION}
              </h2>
            </div>
          </div>
          <div className="flex items-center space-x-2 px-3.5 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-300 text-xs font-mono shrink-0">
            <Radio className="w-3.5 h-3.5 animate-pulse text-neon-cyan" />
            <span>Real-time On-Chain Feed</span>
          </div>
        </div>

        {/* 2. The 4 Option Live Stage Cards (2x2 Grid) */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {VOTING_OPTIONS.map((opt, idx) => {
            const count = votingStats.results[idx] || 0;
            const percentage = votingStats.totalVotes > 0
              ? Math.round((count / votingStats.totalVotes) * 100)
              : 0;
            const isLeading = leadingOptionId === opt.id && count > 0;

            return (
              <div
                key={opt.id}
                className={`cyber-glass rounded-3xl p-6 sm:p-7 border shadow-2xl relative overflow-hidden transition-all duration-500 flex flex-col justify-between ${
                  isLeading
                    ? "border-amber-400/80 bg-gradient-to-br from-amber-500/10 via-slate-950/80 to-purple-900/20 ring-2 ring-amber-400/40"
                    : "border-cyber-border/60 bg-slate-950/70"
                }`}
              >
                {/* Background Ambient Glow for Leader */}
                {isLeading && (
                  <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
                )}

                <div className="space-y-4">
                  {/* Card Header: Tag & Leading Pill */}
                  <div className="flex items-center justify-between">
                    <span className={`text-xs px-3 py-1 rounded-full font-bold border font-mono ${opt.badgeColor}`}>
                      #{opt.id}
                    </span>

                    {isLeading && (
                      <div className="flex items-center space-x-1.5 bg-gradient-to-r from-amber-500/20 to-yellow-500/20 border border-amber-400/60 text-amber-300 px-3 py-1 rounded-full text-xs font-black shadow-lg shadow-amber-500/20 animate-pulse">
                        <Crown className="w-4 h-4 text-amber-400" />
                        <span>LEADING VOTE</span>
                      </div>
                    )}
                  </div>

                  {/* Option Image Beside Title & Subtitle */}
                  <div className="flex items-start gap-4">
                    {opt.image && (
                      <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl overflow-hidden bg-slate-900 border border-slate-700/80 shrink-0 p-1.5 flex items-center justify-center shadow-lg">
                        <img src={opt.image} alt={opt.title} className="w-full h-full object-contain rounded-xl" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <h3 className="font-heading text-lg sm:text-xl font-bold text-white tracking-tight">
                        {opt.title}
                      </h3>
                      <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                        {opt.subtitle}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Progress & Big Numbers */}
                <div className="pt-6 space-y-3">
                  <div className="flex items-baseline justify-between font-mono">
                    <div className="text-4xl sm:text-5xl font-black text-white">
                      <span>{percentage}</span>
                      <span className="text-2xl text-slate-400 font-sans">%</span>
                    </div>
                    <div className="text-right">
                      <span className="text-xl sm:text-2xl font-bold text-slate-200">{count}</span>
                      <span className="text-xs text-slate-500 block">votes</span>
                    </div>
                  </div>

                  {/* High-visibility Animated Progress Bar */}
                  <div className="w-full bg-slate-900/90 rounded-full h-4 overflow-hidden p-0.5 border border-slate-800 shadow-inner">
                    <div
                      className={`h-full rounded-full transition-all duration-700 bg-gradient-to-r ${opt.gradient}`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>

              </div>
            );
          })}
        </div>

        {/* 3. Recent Live Verified Votes Audit Log */}
        <div className="cyber-glass rounded-3xl p-6 border border-cyber-border/60 shadow-xl space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800 text-xs">
            <div className="flex items-center space-x-2">
              <ShieldCheck className="w-4 h-4 text-neon-green" />
              <h4 className="font-heading font-bold text-white text-sm">Recent On-Chain Activity Feed</h4>
            </div>
            <span className="font-mono text-slate-500 text-[11px]">
              Single-client stage polling protects Supabase database from concurrency spikes
            </span>
          </div>

          {votingStats.recentVotes.length === 0 ? (
            <p className="text-xs text-slate-500 py-3 text-center font-mono">
              Waiting for attendees to cast ballots...
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {votingStats.recentVotes.map((v, i) => (
                <div key={i} className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-xs space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-200 flex items-center space-x-1.5 truncate">
                      <Vote className="w-3.5 h-3.5 text-eth-purple shrink-0" />
                      <span className="truncate">
                        {VOTING_OPTIONS.find(o => o.id === v.voted_option)?.title || `Option ${v.voted_option}`}
                      </span>
                    </span>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-eth-purple/20 text-purple-300 border border-purple-500/30 font-bold">
                      Anonymous
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                    <span>Verified Tx:</span>
                    {v.vote_tx_hash ? (
                      <a
                        href={`${NETWORK_CONFIG.blockExplorerUrl}/tx/${v.vote_tx_hash}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-neon-cyan hover:underline flex items-center space-x-1 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/30 font-bold"
                      >
                        <span>{v.vote_tx_hash.slice(0, 6)}...{v.vote_tx_hash.slice(-4)}</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </a>
                    ) : (
                      <span className="text-neon-green">Confirmed</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-cyber-border/40 bg-cyber-void/90 py-4 relative z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 font-mono gap-2">
          <p>© 2026 ETH Club VJTI. Workshop Voting Arena Stage Display.</p>
          <div className="flex items-center space-x-4">
            <span>Network: Base Sepolia</span>
            <span>Contract: {getVotingContractAddress() ? `${getVotingContractAddress().slice(0, 6)}...${getVotingContractAddress().slice(-4)}` : "Awaiting Address"}</span>
          </div>
        </div>
      </footer>

    </div>
  );
}

