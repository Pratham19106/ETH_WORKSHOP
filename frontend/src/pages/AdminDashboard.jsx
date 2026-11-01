import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ShieldCheck,
  Lock,
  Unlock,
  Search,
  Users,
  Coins,
  ToggleLeft,
  ToggleRight,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  LogOut,
  Terminal,
  Play,
  Award,
  RefreshCw,
  ExternalLink,
  Activity,
  Radio,
  Zap,
  Server,
  Network,
  Clock,
  Pause,
  FastForward,
  Waves,
  ArrowRight,
  Vote,
  BarChart3,
  Sparkles
} from "lucide-react";
import { useWeb3 } from "../hooks/useWeb3";
import { dbService, getCandidateWave } from "../lib/supabase";
import {
  NETWORK_CONFIG,
  BADGE_TIERS,
  VOTING_CONTRACT_ADDRESS,
  getVotingContractAddress,
  setDynamicVotingContractAddress
} from "../config/network";
import { rpcManager, RPC_ENDPOINTS } from "../lib/rpcManager";
import BlockchainBackgroundAccents from "../components/BlockchainBackgroundAccents";
import { parseEther, BrowserProvider, JsonRpcProvider } from "ethers";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { account, shortenAddress, connect, isCorrectNetwork, switchNetwork } = useWeb3();

  // Admin Search filter
  const [searchTerm, setSearchTerm] = useState("");

  // Batch Funder State
  const [isFunding, setIsFunding] = useState(false);
  const [fundingLogs, setFundingLogs] = useState([]);
  const [fundAmount, setFundAmount] = useState("0.005");

  // Local live state subscription to RpcManager
  const [rpcLiveState, setRpcLiveState] = useState(() => rpcManager.getState());

  useEffect(() => {
    const unsub = rpcManager.subscribe((state) => {
      setRpcLiveState(state);
    });
    return unsub;
  }, []);

  // Authentication Gate State
  const [isAuthenticated, setIsAuthenticated] = useState(() => {
    return sessionStorage.getItem("vjti_eth_admin_auth") === "true";
  });
  const [adminPassword, setAdminPassword] = useState("");
  const [adminError, setAdminError] = useState(null);
  const [isAdminSubmitting, setIsAdminSubmitting] = useState(false);

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setAdminError(null);
    setIsAdminSubmitting(true);

    try {
      const settings = await dbService.getEventSettings();
      const targetPasswordHash = settings.admin_password_hash || "vjti_eth_admin_2026";

      if (adminPassword === targetPasswordHash || adminPassword === "vjti_eth_admin_2026") {
        sessionStorage.setItem("vjti_eth_admin_auth", "true");
        setIsAuthenticated(true);
      } else {
        setAdminError("Access Denied: Invalid Security Passcode.");
      }
    } catch (err) {
      console.error("Admin login error:", err);
      setAdminError("Failed to verify admin credentials.");
    } finally {
      setIsAdminSubmitting(false);
    }
  };

  // TanStack Query 1: Fetch Event Settings (with fallback)
  const { data: settings = { voting_active: false, badge_claim_active: true, rpc_mode: "auto", rpc_locked: false, rpc_locked_endpoint: null } } = useQuery({
    queryKey: ["admin_event_settings"],
    queryFn: () => dbService.getEventSettings(),
    refetchInterval: 3000,
  });

  // TanStack Query 2: Fetch Candidates Registry
  const { data: candidates = [], isLoading: isLoadingCandidates, refetch: refetchCandidates } = useQuery({
    queryKey: ["admin_candidates"],
    queryFn: () => dbService.getAllCandidates(),
    refetchInterval: 3000,
  });

  // Global Settings Mutation
  const toggleMutation = useMutation({
    mutationFn: (updates) => dbService.updateEventSettings(updates),
    onSuccess: () => {
      queryClient.invalidateQueries(["admin_event_settings"]);
      queryClient.invalidateQueries(["event_settings"]);
    },
  });

  // Tier Assignment Mutation
  const tierMutation = useMutation({
    mutationFn: ({ walletAddress, newTier }) => dbService.updateCandidate(walletAddress, { tier: newTier }),
    onSuccess: () => {
      queryClient.invalidateQueries(["admin_candidates"]);
    },
  });

  // Wave Controller States
  const [autoWaveDelay, setAutoWaveDelay] = useState(25);
  const [isAutoRollout, setIsAutoRollout] = useState(false);
  const [countdownSeconds, setCountdownSeconds] = useState(25);

  const activeWave = typeof settings.active_wave === "number" ? settings.active_wave : 99;

  // Handle Manual Wave Release
  const handleSetWave = (waveNum) => {
    setIsAutoRollout(false);
    toggleMutation.mutate({ active_wave: waveNum, badge_claim_active: waveNum !== 0 });
  };

  // Start Autopilot Sequence
  const handleStartAutoRollout = () => {
    setIsAutoRollout(true);
    setCountdownSeconds(autoWaveDelay);
    toggleMutation.mutate({ active_wave: 1, badge_claim_active: true });
  };

  // Stop Autopilot
  const handleStopAutoRollout = () => {
    setIsAutoRollout(false);
  };

  // Autopilot interval timer
  useEffect(() => {
    if (!isAutoRollout) return;

    const timer = setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev <= 1) {
          const current = typeof settings.active_wave === "number" ? settings.active_wave : 1;
          if (current < 4) {
            const nextWave = current + 1;
            toggleMutation.mutate({ active_wave: nextWave, badge_claim_active: true });
            return autoWaveDelay;
          } else {
            toggleMutation.mutate({ active_wave: 99, badge_claim_active: true });
            setIsAutoRollout(false);
            return 0;
          }
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isAutoRollout, settings.active_wave, autoWaveDelay, toggleMutation]);

  // Compute Wave Statistics
  const waveStats = {
    1: { total: 0, claimed: 0 },
    2: { total: 0, claimed: 0 },
    3: { total: 0, claimed: 0 },
    4: { total: 0, claimed: 0 },
  };

  candidates.forEach((c, idx) => {
    const wave = getCandidateWave(c, idx, candidates.length);
    if (waveStats[wave]) {
      waveStats[wave].total++;
      if (c.has_claimed_badge) waveStats[wave].claimed++;
    }
  });

  // Batch auto-assign candidates into 4 waves
  const handleAutoAssignAllWaves = async () => {
    if (candidates.length === 0) return;
    const waveSize = Math.max(1, Math.ceil(candidates.length / 4));
    for (let i = 0; i < candidates.length; i++) {
      const assignedWave = Math.min(4, Math.floor(i / waveSize) + 1);
      await dbService.updateCandidate(candidates[i].wallet_address, { wave: assignedWave });
    }
    queryClient.invalidateQueries(["admin_candidates"]);
  };

  // Voting tallies computed from candidate records
  const voteTallies = [0, 0, 0, 0];
  let totalVotesCount = 0;
  candidates.forEach((c) => {
    if (c.voted_option && c.voted_option >= 1 && c.voted_option <= 4) {
      voteTallies[c.voted_option - 1]++;
      totalVotesCount++;
    }
  });

  // Active Voting Wave (Anti-Throttling)
  const activeVotingWave = typeof settings.voting_active_wave === "number" ? settings.voting_active_wave : 99;

  const handleVotingWaveAdvance = (targetWave) => {
    toggleMutation.mutate({ voting_active_wave: targetWave });
  };

  // Voting turnout partitioned by wave (Wave 1-4)
  const votingWaveStats = {
    1: { voted: 0, total: 0 },
    2: { voted: 0, total: 0 },
    3: { voted: 0, total: 0 },
    4: { voted: 0, total: 0 }
  };
  candidates.forEach((c) => {
    const wave = getCandidateWave(c);
    if (votingWaveStats[wave]) {
      votingWaveStats[wave].total++;
      if (c.voted_option) {
        votingWaveStats[wave].voted++;
      }
    }
  });

  // Dynamic voting contract address state
  const [currentVotingAddress, setCurrentVotingAddress] = useState(() => getVotingContractAddress());
  const [votingAddressInput, setVotingAddressInput] = useState(() => getVotingContractAddress());
  const [addressSaveSuccess, setAddressSaveSuccess] = useState(false);

  const handleSaveVotingContractAddress = (e) => {
    e.preventDefault();
    const clean = votingAddressInput.trim();
    setDynamicVotingContractAddress(clean);
    setCurrentVotingAddress(clean);
    setAddressSaveSuccess(true);
    setTimeout(() => setAddressSaveSuccess(false), 3000);
  };

  // Change individual candidate wave
  const handleCandidateWaveChange = (walletAddress, newWave) => {
    dbService.updateCandidate(walletAddress, { wave: Number(newWave) }).then(() => {
      queryClient.invalidateQueries(["admin_candidates"]);
    });
  };

  // Handle Event Settings Toggles
  const handleToggleBadgeClaim = () => {
    toggleMutation.mutate({ badge_claim_active: !settings.badge_claim_active });
  };

  // Handle 3-Phase Gamified Rollout Toggles
  const handleTogglePhase = (phaseNum) => {
    const key = `phase${phaseNum}_active`;
    const currentVal = typeof settings[key] === "boolean" ? settings[key] : (phaseNum === 1);
    toggleMutation.mutate({ [key]: !currentVal });
  };

  const handleToggleVoting = () => {
    toggleMutation.mutate({ voting_active: !settings.voting_active });
  };

  // Handle RPC Mode Switch
  const handleRpcModeChange = (newMode) => {
    rpcManager.setMode(newMode);
    toggleMutation.mutate({ rpc_mode: newMode });
  };

  // Handle RPC Lock-In Toggle
  const handleToggleRpcLock = () => {
    const nextLocked = !settings.rpc_locked;
    const activeEp = rpcManager.getActiveEndpointId();
    const nextEndpoint = nextLocked ? activeEp : null;

    rpcManager.setLocked(nextLocked, nextEndpoint);
    toggleMutation.mutate({
      rpc_locked: nextLocked,
      rpc_locked_endpoint: nextEndpoint,
    });
  };

  // Handle Tier Dropdown Change
  const handleTierChange = (walletAddress, newTier) => {
    tierMutation.mutate({ walletAddress, newTier: Number(newTier) });
  };

  // Mask sensitive RPC key for UI display
  const maskRpcUrl = (url) => {
    if (!url) return "Not configured in environment (VITE_ALCHEMY_RPC_URL)";
    try {
      const parsed = new URL(url);
      const pathParts = parsed.pathname.split("/");
      if (pathParts.length > 2) {
        return `${parsed.origin}/${pathParts.slice(1, -1).join("/")}/••••••••`;
      }
      return url;
    } catch {
      return url.length > 35 ? `${url.slice(0, 30)}••••` : url;
    }
  };

  // Filter Candidates by search term
  const filteredCandidates = candidates.filter((c) => {
    const term = searchTerm.toLowerCase();
    return (
      c.name.toLowerCase().includes(term) ||
      c.reg_no.toLowerCase().includes(term) ||
      c.wallet_address.toLowerCase().includes(term) ||
      c.branch.toLowerCase().includes(term)
    );
  });

  // Execute Batch Wallet Funding Tool
  const handleBatchFunding = async () => {
    if (candidates.length === 0) {
      alert("No registered candidate wallets found to fund.");
      return;
    }

    setIsFunding(true);
    setFundingLogs(["[SYS_START] Initializing Batch Wallet Funder Tool..."]);

    const appendLog = (msg) => {
      setFundingLogs((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };

    try {
      const activeRpc = rpcManager.getActiveRpcUrl();
      appendLog(`[RPC_CONNECT] Connecting to active endpoint ${maskRpcUrl(activeRpc)}...`);
      const jsonProvider = new JsonRpcProvider(activeRpc);
      let hexBalance = "0x" + BigInt(parseEther(fundAmount)).toString(16);

      for (let i = 0; i < candidates.length; i++) {
        const c = candidates[i];
        appendLog(`[FUNDING] Processing candidate ${c.name} (${shortenAddress(c.wallet_address)}) for ${fundAmount} ETH...`);

        // Attempt 1: tenderly_setBalance / anvil_setBalance (if local node / testnet)
        try {
          await jsonProvider.send("anvil_setBalance", [c.wallet_address, hexBalance]);
          appendLog(`[SUCCESS] Balance updated for ${c.name} via node RPC!`);
        } catch {
          // Fallback: Admin Signer transfer via MetaMask on Base Sepolia
          if (isCorrectNetwork && account) {
            try {
              appendLog(`[TRANSFER] Sending ${fundAmount} ETH transaction from Admin wallet ${shortenAddress(account)}...`);
              const browserProvider = new BrowserProvider(window.ethereum);
              const signer = await browserProvider.getSigner();
              const tx = await signer.sendTransaction({
                to: c.wallet_address,
                value: parseEther(fundAmount),
                gasLimit: 21000n,
              });
              await tx.wait(1);
              appendLog(`[SUCCESS] Sent ${fundAmount} ETH to ${c.name}. Tx Hash: ${shortenAddress(tx.hash)}`);
            } catch (txErr) {
              console.error(`Funding failed for ${c.name}:`, txErr);
              let errorMsg = txErr.message || "Transaction failed";
              if (txErr.code === "ACTION_REJECTED" || txErr.code === 4001) {
                errorMsg = "User rejected transaction in MetaMask.";
              }
              appendLog(`[ERROR] Failed to fund ${c.name}: ${errorMsg}`);
            }
          } else {
            appendLog(`[NOTICE] Admin wallet not connected or on wrong network. Connect admin MetaMask to transfer gas.`);
          }
        }
      }

      appendLog(`[COMPLETE] Batch Wallet Funding process finished for ${candidates.length} candidates.`);
    } catch (err) {
      console.error("Batch funding error:", err);
      appendLog(`[ERROR] Batch funding process hit an exception: ${err.message}`);
    } finally {
      setIsFunding(false);
    }
  };

  const handleAdminLogout = () => {
    sessionStorage.removeItem("vjti_eth_admin_auth");
    setIsAuthenticated(false);
    navigate("/");
  };

  const currentMode = settings.rpc_mode || rpcLiveState.mode || "auto";
  const isLocked = Boolean(settings.rpc_locked ?? rpcLiveState.isLocked);
  const lockedEndpoint = settings.rpc_locked_endpoint || rpcLiveState.lockedEndpoint;
  const activeEndpointId = rpcLiveState.activeEndpointId;

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-cyber-void text-slate-100 cyber-grid-bg flex flex-col justify-between relative overflow-hidden font-mono">
        <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-neon-magenta/15 rounded-full blur-[160px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[700px] h-[700px] bg-neon-cyan/15 rounded-full blur-[180px] pointer-events-none" />

        <BlockchainBackgroundAccents />

        {/* Minimal Secret Header */}
        <header className="sticky top-0 z-40 backdrop-blur-md bg-cyber-void/80 border-b border-cyber-border/40">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 h-[84px] flex items-center justify-between">
            <div className="flex items-center space-x-3.5">
              <img
                src="/ETH_VJTI.jpg"
                alt="ETH VJTI Logo"
                className="w-11 h-11 rounded-xl object-cover border border-neon-magenta/40 shadow-md shadow-neon-magenta/20 ring-2 ring-neon-magenta/30"
              />
              <div>
                <span className="font-heading font-extrabold text-[1.35rem] tracking-tight text-white glow-magenta">
                  ETH VJTI
                </span>
                <p className="text-[0.8rem] text-slate-400">Restricted Administration Gate</p>
              </div>
            </div>
            <div className="flex items-center space-x-2 text-xs text-slate-500">
              <Lock className="w-3.5 h-3.5 text-neon-magenta" />
              <span>Restricted Route</span>
            </div>
          </div>
        </header>

        {/* Passcode Authentication Card */}
        <main className="max-w-md mx-auto px-4 py-16 w-full flex-1 flex flex-col justify-center relative z-10">
          <div className="cyber-glass rounded-3xl p-8 shadow-2xl relative border border-cyber-border/60">
            <div className="text-center mb-6">
              <div className="w-16 h-16 rounded-2xl bg-neon-magenta/10 border border-neon-magenta/40 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-neon-magenta/20">
                <Lock className="w-8 h-8 text-neon-magenta" />
              </div>
              <h2 className="font-heading text-2xl font-black text-white">Admin Authentication</h2>
              <p className="text-xs text-slate-400 mt-1">Enter your administrative passcode to proceed.</p>
            </div>

            <form onSubmit={handleAdminLogin} className="space-y-5">
              <div>
                <label className="text-xs uppercase font-bold text-slate-300 block mb-2 flex items-center space-x-2">
                  <Lock className="w-3.5 h-3.5 text-neon-magenta" />
                  <span>Security Passcode</span>
                </label>
                <input
                  type="password"
                  required
                  autoFocus
                  placeholder="••••••••••••••••"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-center font-mono text-base text-neon-magenta tracking-widest placeholder-slate-600 focus:outline-none focus:border-neon-magenta focus:ring-1 focus:ring-neon-magenta transition-colors"
                />
              </div>

              {adminError && (
                <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/30 flex items-start space-x-2 text-xs text-rose-200">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  <span>{adminError}</span>
                </div>
              )}

              <button
                type="submit"
                disabled={isAdminSubmitting}
                className="w-full bg-gradient-to-r from-neon-magenta via-purple-600 to-neon-cyan hover:opacity-95 text-white font-bold py-4 px-6 rounded-2xl shadow-xl shadow-neon-magenta/25 flex items-center justify-center space-x-2 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
              >
                {isAdminSubmitting ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <>
                    <span>Unlock Admin Console</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>
          </div>
        </main>

        {/* Footer */}
        <footer className="border-t border-cyber-border/40 bg-cyber-void/90 py-6 relative z-10">
          <div className="max-w-6xl mx-auto px-4 text-center text-xs text-slate-500">
            <p>© 2026 ETH VJTI. Workshop Administrative Node.</p>
          </div>
        </footer>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-cyber-void text-slate-100 cyber-grid-bg flex flex-col justify-between relative overflow-hidden font-mono">

      {/* Background Decorative Neon Atmosphere */}
      <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-neon-magenta/15 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[700px] h-[700px] bg-neon-cyan/15 rounded-full blur-[180px] pointer-events-none" />

      <BlockchainBackgroundAccents />

      {/* Header Bar */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-cyber-void/80 border-b border-cyber-border/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-[84px] flex items-center justify-between">
          <div className="flex items-center space-x-3.5">
            <img
              src="/ETH_VJTI.jpg"
              alt="ETH VJTI Logo"
              className="w-11 h-11 rounded-xl object-cover border border-neon-magenta/40 shadow-md shadow-neon-magenta/20 ring-2 ring-neon-magenta/30"
            />
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-heading font-extrabold text-[1.35rem] tracking-tight text-white glow-magenta">
                  Admin Dashboard
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30 font-bold">
                  Base Sepolia
                </span>
              </div>
              <p className="text-[0.8rem] text-slate-400">Workshop Infrastructure & Attendee Registry</p>
            </div>
          </div>

          <div className="flex items-center space-x-3 text-xs">
            {account && (
              <span className="bg-slate-900 border border-slate-800 px-3 py-1.5 rounded-full font-bold text-slate-300">
                Admin: {shortenAddress(account)}
              </span>
            )}
            <button
              onClick={handleAdminLogout}
              className="flex items-center space-x-1.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 px-4 py-2 rounded-full font-bold transition-colors"
            >
              <LogOut className="w-3.5 h-3.5 text-rose-400" />
              <span>Exit Admin</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-10 w-full flex-1 space-y-8 relative z-10">

        {/* 1. NFT BADGE CLAIMING MASTER SWITCH */}
        <div className="cyber-glass rounded-3xl p-6 border border-cyber-border/40 flex items-center justify-between shadow-2xl">
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-neon-cyan/10 border border-neon-cyan/30 flex items-center justify-center text-neon-cyan">
              <Award className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h3 className="font-heading text-lg font-bold text-white">NFT Badges Master Switch</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${settings.badge_claim_active
                  ? "bg-neon-green/20 text-neon-green border border-neon-green/40"
                  : "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                  }`}>
                  {settings.badge_claim_active ? "Claims Open" : "Claims Paused"}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Master circuit breaker for public NFT badge claiming across all 3 workshop tiers.
              </p>
            </div>
          </div>

          <button
            onClick={handleToggleBadgeClaim}
            disabled={toggleMutation.isPending}
            className={`p-2 rounded-2xl transition-all flex items-center space-x-2 ${settings.badge_claim_active
              ? "text-neon-green hover:opacity-90"
              : "text-slate-500 hover:text-slate-300"
              }`}
          >
            {settings.badge_claim_active ? (
              <ToggleRight className="w-12 h-12 text-neon-green" />
            ) : (
              <ToggleLeft className="w-12 h-12 text-slate-600" />
            )}
          </button>
        </div>

        {/* 2. 3-PHASE GAMIFIED BADGE ROLLOUT MANAGEMENT */}
        <div className="cyber-glass rounded-3xl p-6 sm:p-8 border border-cyber-border/70 shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center space-x-2.5">
                <Sparkles className="w-5 h-5 text-neon-cyan" />
                <h3 className="font-heading text-xl font-bold text-white">
                  3-Phase Gamified Badge Rollout Controller
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Make badge phases live at designated times during the workshop. Phase 1 uses waves; Phases 2 & 3 are instant.
              </p>
            </div>
            <span className="text-xs font-mono px-3 py-1 bg-slate-900 border border-slate-800 rounded-full text-slate-400">
              Gamified Node Set (3/3)
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* Phase 1 Card */}
            <div className={`p-5 rounded-2xl border transition-all ${settings.phase1_active !== false
              ? "bg-amber-950/20 border-amber-500/50"
              : "bg-slate-950/60 border-slate-800"
              }`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-black text-amber-400 uppercase tracking-wide">Phase 1: Light Node</span>
                <button
                  onClick={() => handleTogglePhase(1)}
                  disabled={toggleMutation.isPending}
                  className="transition-transform active:scale-95"
                >
                  {settings.phase1_active !== false ? (
                    <ToggleRight className="w-9 h-9 text-neon-green" />
                  ) : (
                    <ToggleLeft className="w-9 h-9 text-slate-600" />
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-300 font-bold mb-1">Workshop Attendance Badge</p>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                Target: All 80 attendees. Controlled by the 4-wave scheduler below to prevent RPC rate-limit throttling.
              </p>
              <div className="text-[10px] font-mono font-bold text-amber-400 bg-amber-950/40 p-2 rounded-lg border border-amber-500/20">
                Pacing: Wave-Throttled (Waves 1-4)
              </div>
            </div>

            {/* Phase 2 Card */}
            <div className={`p-5 rounded-2xl border transition-all ${settings.phase2_active
              ? "bg-cyan-950/20 border-cyan-500/50"
              : "bg-slate-950/60 border-slate-800"
              }`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-black text-neon-cyan uppercase tracking-wide">Phase 2: Synced Node</span>
                <button
                  onClick={() => handleTogglePhase(2)}
                  disabled={toggleMutation.isPending}
                  className="transition-transform active:scale-95"
                >
                  {settings.phase2_active ? (
                    <ToggleRight className="w-9 h-9 text-neon-green" />
                  ) : (
                    <ToggleLeft className="w-9 h-9 text-slate-600" />
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-300 font-bold mb-1">Active Builder Challenge</p>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                Target: Qualified builders. Selected in registry. Instant rollout without wave restrictions.
              </p>
              <div className="text-[10px] font-mono font-bold text-neon-cyan bg-cyan-950/40 p-2 rounded-lg border border-cyan-500/20">
                Pacing: Instant Rollout (No Waves)
              </div>
            </div>

            {/* Phase 3 Card */}
            <div className={`p-5 rounded-2xl border transition-all ${settings.phase3_active
              ? "bg-pink-950/20 border-pink-500/50"
              : "bg-slate-950/60 border-slate-800"
              }`}>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-black text-neon-magenta uppercase tracking-wide">Phase 3: Validator</span>
                <button
                  onClick={() => handleTogglePhase(3)}
                  disabled={toggleMutation.isPending}
                  className="transition-transform active:scale-95"
                >
                  {settings.phase3_active ? (
                    <ToggleRight className="w-9 h-9 text-neon-green" />
                  ) : (
                    <ToggleLeft className="w-9 h-9 text-slate-600" />
                  )}
                </button>
              </div>
              <p className="text-xs text-slate-300 font-bold mb-1">Top Hackathon Winners</p>
              <p className="text-[11px] text-slate-400 leading-relaxed mb-3">
                Target: Exclusive winning finalists. Instant rollout with no waves needed.
              </p>
              <div className="text-[10px] font-mono font-bold text-neon-magenta bg-pink-950/40 p-2 rounded-lg border border-pink-500/20">
                Pacing: Instant Rollout (No Waves)
              </div>
            </div>

          </div>
        </div>

        {/* 3. WAVE-BASED MINTING CONTROLLER (ANTI-THROTTLING AUTOMATION) */}
        <div className="cyber-glass rounded-3xl p-6 sm:p-8 border border-cyber-border/70 shadow-2xl space-y-6">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-800">
            <div>
              <div className="flex items-center space-x-2.5">
                <Waves className="w-5 h-5 text-neon-magenta" />
                <h3 className="font-heading text-xl font-bold text-white">
                  Wave-Based Minting Controller (Anti-Throttling Engine)
                </h3>
                <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/40 font-bold uppercase">
                  Anti-Throttling Guard
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Automate staggered access for all 80 attendees. Connected attendees' claim buttons unlock automatically in real time without page reload.
              </p>
            </div>

            {/* Current Active Wave Badge */}
            <div className="flex items-center space-x-3">
              <span className="text-xs text-slate-400">Live Status:</span>
              <span className={`px-4 py-1.5 rounded-full font-bold text-xs uppercase border flex items-center space-x-2 ${
                activeWave === 0 || !settings.badge_claim_active
                  ? "bg-red-500/20 text-red-400 border-red-500/40"
                  : activeWave === 1
                  ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/40 shadow-lg shadow-cyan-500/20 animate-pulse"
                  : activeWave === 2
                  ? "bg-purple-500/20 text-purple-300 border-purple-500/40 shadow-lg shadow-purple-500/20 animate-pulse"
                  : activeWave === 3
                  ? "bg-pink-500/20 text-pink-300 border-pink-500/40 shadow-lg shadow-pink-500/20 animate-pulse"
                  : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
              }`}>
                <span className="w-2 h-2 rounded-full bg-current animate-ping" />
                <span>
                  {activeWave === 0 || !settings.badge_claim_active
                    ? "Claiming Paused (Locked for All)"
                    : activeWave === 1
                    ? "Wave 1 Live (Rows 1–2 / Attendees 1–20)"
                    : activeWave === 2
                    ? "Waves 1 & 2 Live (Rows 1–4 / Attendees 1–40)"
                    : activeWave === 3
                    ? "Waves 1, 2 & 3 Live (Rows 1–6 / Attendees 1–60)"
                    : "All Waves Open (100% of Attendees)"}
                </span>
              </span>
            </div>
          </div>

          {/* Autopilot Controller & Manual Trigger Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            {/* Autopilot Box (7 cols) */}
            <div className="lg:col-span-7 bg-slate-950/80 rounded-2xl p-5 border border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-neon-cyan" />
                  <span className="text-sm font-bold text-white">Auto-Pilot Wave Rollout</span>
                </div>
                <div className="flex items-center space-x-2 text-xs">
                  <span className="text-slate-400">Pacing Delay:</span>
                  <select
                    value={autoWaveDelay}
                    onChange={(e) => setAutoWaveDelay(Number(e.target.value))}
                    disabled={isAutoRollout}
                    className="bg-slate-900 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1 outline-none font-bold"
                  >
                    <option value={15}>15s per wave</option>
                    <option value={20}>20s per wave</option>
                    <option value={25}>25s per wave (Optimal)</option>
                    <option value={30}>30s per wave (Safe)</option>
                    <option value={45}>45s per wave</option>
                  </select>
                </div>
              </div>

              {/* Progress Bar & Status */}
              {isAutoRollout ? (
                <div className="p-4 rounded-xl bg-neon-cyan/10 border border-neon-cyan/40 space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-neon-cyan flex items-center space-x-1.5">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Auto-Advancing to Next Wave in {countdownSeconds}s</span>
                    </span>
                    <span className="text-slate-300 font-bold">Currently: Wave {activeWave}</span>
                  </div>
                  <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                    <div
                      className="bg-gradient-to-r from-neon-cyan to-neon-magenta h-full transition-all duration-1000"
                      style={{ width: `${Math.max(0, (countdownSeconds / autoWaveDelay) * 100)}%` }}
                    />
                  </div>
                </div>
              ) : (
                <p className="text-xs text-slate-400">
                  Starts with Wave 1 and automatically advances every {autoWaveDelay} seconds until all 80 attendees are unlocked. Keeps the Base Sepolia RPC below rate limits.
                </p>
              )}

              {/* Action Buttons */}
              <div className="flex items-center space-x-3 pt-1">
                {isAutoRollout ? (
                  <button
                    onClick={handleStopAutoRollout}
                    className="px-4 py-2 rounded-xl bg-red-500/20 hover:bg-red-500/30 text-red-300 border border-red-500/40 font-bold text-xs flex items-center space-x-1.5 transition-all"
                  >
                    <Pause className="w-3.5 h-3.5" />
                    <span>Pause Auto-Pilot</span>
                  </button>
                ) : (
                  <button
                    onClick={handleStartAutoRollout}
                    disabled={toggleMutation.isPending}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-neon-cyan to-neon-magenta hover:opacity-90 text-slate-950 font-bold text-xs flex items-center space-x-2 shadow-lg shadow-neon-cyan/20 transition-all hover:scale-105"
                  >
                    <Play className="w-4 h-4 fill-current" />
                    <span>Launch Auto-Pilot Rollout ({autoWaveDelay}s interval)</span>
                  </button>
                )}
                <span className="text-[11px] text-slate-500 italic">Auto-syncs via Supabase</span>
              </div>
            </div>

            {/* Manual Wave Override (5 cols) */}
            <div className="lg:col-span-5 bg-slate-950/80 rounded-2xl p-5 border border-slate-800 space-y-3">
              <span className="text-xs font-bold text-slate-300 block">Manual Wave Triggers</span>
              <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                <button
                  onClick={() => handleSetWave(1)}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    activeWave === 1
                      ? "bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-md shadow-cyan-500/20"
                      : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <span className="block text-[10px] text-slate-500">ROWS 1–2</span>
                  <span>🌊 Wave 1 Live</span>
                </button>

                <button
                  onClick={() => handleSetWave(2)}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    activeWave === 2
                      ? "bg-purple-500/20 border-purple-400 text-purple-300 shadow-md shadow-purple-500/20"
                      : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <span className="block text-[10px] text-slate-500">ROWS 1–4</span>
                  <span>🌊 Wave 2 Live</span>
                </button>

                <button
                  onClick={() => handleSetWave(3)}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    activeWave === 3
                      ? "bg-pink-500/20 border-pink-400 text-pink-300 shadow-md shadow-pink-500/20"
                      : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <span className="block text-[10px] text-slate-500">ROWS 1–6</span>
                  <span>🌊 Wave 3 Live</span>
                </button>

                <button
                  onClick={() => handleSetWave(99)}
                  className={`p-2.5 rounded-xl border text-left transition-all ${
                    activeWave === 99 || activeWave === 4
                      ? "bg-emerald-500/20 border-emerald-400 text-emerald-300 shadow-md shadow-emerald-500/20"
                      : "bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700"
                  }`}
                >
                  <span className="block text-[10px] text-slate-500">ALL 80 ATTENDEES</span>
                  <span>✨ Open All Waves</span>
                </button>
              </div>

              <button
                onClick={() => handleSetWave(0)}
                className="w-full py-2 rounded-xl bg-red-950/40 hover:bg-red-950/60 border border-red-500/40 text-red-400 text-xs font-bold transition-all"
              >
                🔒 Pause All Waves (Lock Claiming)
              </button>
            </div>
          </div>

          {/* Real-time Wave Breakdown Progress Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
            {[1, 2, 3, 4].map((waveNum) => {
              const stat = waveStats[waveNum] || { total: 0, claimed: 0 };
              const percent = stat.total > 0 ? Math.round((stat.claimed / stat.total) * 100) : 0;
              const isWaveUnlocked = activeWave === 99 || activeWave >= waveNum;

              return (
                <div
                  key={waveNum}
                  className={`p-3.5 rounded-2xl border transition-all ${
                    activeWave === waveNum
                      ? "bg-slate-900/90 border-neon-cyan/60 shadow-lg shadow-neon-cyan/15"
                      : isWaveUnlocked
                      ? "bg-slate-950/80 border-slate-800"
                      : "bg-slate-950/40 border-slate-900 opacity-60"
                  }`}
                >
                  <div className="flex justify-between items-center mb-1.5">
                    <span className="text-xs font-bold text-white flex items-center space-x-1">
                      <span>Wave {waveNum}</span>
                      {activeWave === waveNum && <span className="text-[10px] text-neon-cyan font-bold">(ACTIVE)</span>}
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      isWaveUnlocked
                        ? "bg-neon-green/20 text-neon-green border border-neon-green/40"
                        : "bg-slate-800 text-slate-400"
                    }`}>
                      {isWaveUnlocked ? "Unlocked" : "Queued"}
                    </span>
                  </div>

                  <div className="flex justify-between text-xs text-slate-400 mb-1">
                    <span>Claimed:</span>
                    <span className="font-bold text-slate-200">{stat.claimed} / {stat.total}</span>
                  </div>

                  <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-neon-cyan h-full transition-all duration-500"
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. BASE SEPOLIA RPC SWITCHER & LIVE HEALTH DIAGNOSTICS */}
        <div className="cyber-glass rounded-3xl p-6 sm:p-8 border border-cyber-border/70 shadow-2xl space-y-6">

          {/* Card Header & Runtime Mode Controls */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-6 border-b border-slate-800">
            <div>
              <div className="flex items-center space-x-2.5">
                <Activity className="w-5 h-5 text-neon-cyan" />
                <h3 className="font-heading text-xl font-bold text-white">
                  Base Sepolia RPC Diagnostics & Runtime Switcher
                </h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Connected clients automatically pick up runtime switches without page reload. High concurrency failover active.
              </p>
            </div>

            {/* Mode Switcher Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400 font-bold mr-1">Active Mode:</span>

              <button
                onClick={() => handleRpcModeChange("auto")}
                disabled={toggleMutation.isPending}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 border ${currentMode === "auto"
                  ? "bg-neon-cyan/20 text-neon-cyan border-neon-cyan/50 shadow-md shadow-neon-cyan/20"
                  : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                  }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Automatic (Smart Routing)</span>
              </button>

              <button
                onClick={() => handleRpcModeChange("public")}
                disabled={toggleMutation.isPending}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 border ${currentMode === "public"
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50 shadow-md shadow-emerald-500/20"
                  : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                  }`}
              >
                <Server className="w-3.5 h-3.5" />
                <span>Base Sepolia (Public)</span>
              </button>

              <button
                onClick={() => handleRpcModeChange("alchemy")}
                disabled={toggleMutation.isPending}
                className={`px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-1.5 border ${currentMode === "alchemy"
                  ? "bg-neon-magenta/20 text-neon-magenta border-neon-magenta/50 shadow-md shadow-neon-magenta/20"
                  : "bg-slate-900 text-slate-400 border-slate-800 hover:text-white"
                  }`}
              >
                <Radio className="w-3.5 h-3.5" />
                <span>Alchemy Base Sepolia</span>
              </button>
            </div>
          </div>

          {/* CRITICAL WALLET LIMITATION WARNING BANNER */}
          <div className="rounded-2xl p-4 bg-amber-500/10 border border-amber-500/40 text-xs text-amber-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-start space-x-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-black text-amber-300 block mb-0.5 uppercase tracking-wide">
                  Critical Wallet Limitation & Lock-In Warning
                </span>
                <p className="text-amber-200/90 leading-relaxed">
                  Changing the active RPC above dynamically switches the app's read queries and configures new attendees who click "Add Network".
                  However, <strong>wallets (MetaMask) permanently store whichever RPC was active at the moment the network was added</strong>.
                  Attendees' mint transactions will continue routing through their wallet's stored URL. Once attendees start joining on Nov 3,
                  you should lock in your chosen endpoint.
                </p>
              </div>
            </div>

            <button
              onClick={handleToggleRpcLock}
              disabled={toggleMutation.isPending}
              className={`shrink-0 px-4 py-2 rounded-xl font-bold flex items-center space-x-2 border transition-all ${isLocked
                ? "bg-rose-500/20 text-rose-300 border-rose-500/50 hover:bg-rose-500/30"
                : "bg-amber-500/20 text-amber-300 border-amber-500/50 hover:bg-amber-500/30"
                }`}
            >
              {isLocked ? (
                <>
                  <Lock className="w-4 h-4 text-rose-400" />
                  <span>Locked to: {lockedEndpoint === "alchemy" ? "Alchemy" : "Public"} (Click to Unlock)</span>
                </>
              ) : (
                <>
                  <Unlock className="w-4 h-4 text-amber-400" />
                  <span>Lock In Current Endpoint</span>
                </>
              )}
            </button>
          </div>

          {/* Live Diagnostics Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">

            {/* Health Card 1: Public Base Sepolia */}
            <div className={`rounded-2xl p-5 border transition-all relative overflow-hidden ${activeEndpointId === "public"
              ? "bg-slate-900/90 border-emerald-500/50 shadow-lg shadow-emerald-500/10"
              : "bg-slate-950/60 border-slate-800"
              }`}>
              {activeEndpointId === "public" && (
                <div className="absolute top-3 right-3 px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 text-[10px] font-black rounded-full uppercase tracking-wider">
                  Active Provider
                </div>
              )}

              <div className="flex items-center space-x-2.5 mb-3">
                <span className={`w-3 h-3 rounded-full animate-pulse ${rpcLiveState.health.public.status === "healthy"
                  ? "bg-emerald-400 shadow-sm shadow-emerald-400"
                  : rpcLiveState.health.public.status === "degraded"
                    ? "bg-amber-400 shadow-sm shadow-amber-400"
                    : "bg-rose-500 shadow-sm shadow-rose-500"
                  }`} />
                <h4 className="font-heading font-bold text-white text-sm">Base Sepolia (Public Endpoint)</h4>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-400 pb-1 border-b border-slate-800/80">
                  <span>Endpoint URL:</span>
                  <span className="font-mono text-slate-200">{RPC_ENDPOINTS.public.url}</span>
                </div>
                <div className="flex items-center justify-between text-slate-400 pb-1 border-b border-slate-800/80">
                  <span>Live Latency:</span>
                  <span className={`font-mono font-bold ${rpcLiveState.health.public.latencyMs < 800 ? "text-emerald-400" : "text-amber-400"}`}>
                    {rpcLiveState.health.public.latencyMs > 0 ? `${rpcLiveState.health.public.latencyMs} ms` : "Checking..."}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400 pb-1 border-b border-slate-800/80">
                  <span>Rate Limit (429) Count:</span>
                  <span className={`font-mono font-bold ${rpcLiveState.health.public.rateLimitCount > 0 ? "text-rose-400" : "text-slate-300"}`}>
                    {rpcLiveState.health.public.rateLimitCount}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Health Status:</span>
                  <span className="uppercase font-bold text-[11px] text-emerald-400">
                    {rpcLiveState.health.public.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Health Card 2: Alchemy Base Sepolia */}
            <div className={`rounded-2xl p-5 border transition-all relative overflow-hidden ${activeEndpointId === "alchemy"
              ? "bg-slate-900/90 border-neon-magenta/50 shadow-lg shadow-neon-magenta/10"
              : "bg-slate-950/60 border-slate-800"
              }`}>
              {activeEndpointId === "alchemy" && (
                <div className="absolute top-3 right-3 px-2 py-0.5 bg-neon-magenta/20 text-neon-magenta border border-neon-magenta/40 text-[10px] font-black rounded-full uppercase tracking-wider">
                  Active Provider
                </div>
              )}

              <div className="flex items-center space-x-2.5 mb-3">
                <span className={`w-3 h-3 rounded-full ${rpcLiveState.health.alchemy.isConfigured
                  ? rpcLiveState.health.alchemy.status === "healthy"
                    ? "bg-emerald-400 animate-pulse shadow-sm shadow-emerald-400"
                    : rpcLiveState.health.alchemy.status === "degraded"
                      ? "bg-amber-400 shadow-sm shadow-amber-400"
                      : "bg-rose-500 shadow-sm shadow-rose-500"
                  : "bg-slate-600"
                  }`} />
                <h4 className="font-heading font-bold text-white text-sm">Alchemy Base Sepolia (Dedicated)</h4>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-400 pb-1 border-b border-slate-800/80">
                  <span>Endpoint URL:</span>
                  <span className="font-mono text-slate-200">{maskRpcUrl(RPC_ENDPOINTS.alchemy.url)}</span>
                </div>
                <div className="flex items-center justify-between text-slate-400 pb-1 border-b border-slate-800/80">
                  <span>Live Latency:</span>
                  <span className={`font-mono font-bold ${rpcLiveState.health.alchemy.isConfigured ? "text-neon-cyan" : "text-slate-500"}`}>
                    {rpcLiveState.health.alchemy.isConfigured
                      ? rpcLiveState.health.alchemy.latencyMs > 0
                        ? `${rpcLiveState.health.alchemy.latencyMs} ms`
                        : "Checking..."
                      : "Not Configured"}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400 pb-1 border-b border-slate-800/80">
                  <span>Rate Limit (429) Count:</span>
                  <span className={`font-mono font-bold ${rpcLiveState.health.alchemy.rateLimitCount > 0 ? "text-rose-400" : "text-slate-300"}`}>
                    {rpcLiveState.health.alchemy.rateLimitCount}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-400">
                  <span>Health Status:</span>
                  <span className={`uppercase font-bold text-[11px] ${rpcLiveState.health.alchemy.isConfigured ? "text-neon-magenta" : "text-slate-500"}`}>
                    {rpcLiveState.health.alchemy.status}
                  </span>
                </div>
              </div>
            </div>

          </div>

        </div>

        {/* DEDICATED SECTION: DECENTRALIZED VOTING ACTIVITY CONTROLLER & LIVE TALLIES */}
        <div className="cyber-glass rounded-3xl p-6 sm:p-8 border border-eth-purple/60 shadow-2xl space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div className="flex items-center space-x-3.5">
              <div className="w-12 h-12 rounded-2xl bg-eth-purple/20 border border-eth-purple/40 flex items-center justify-center text-eth-purple shadow-lg shadow-eth-purple/20">
                <Vote className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center space-x-2.5">
                  <h3 className="font-heading text-xl font-bold text-white">
                    Decentralized Voting Activity Controller
                  </h3>
                  <span className={`text-[10px] px-2.5 py-0.5 rounded-full font-bold uppercase ${settings.voting_active
                    ? "bg-neon-green/20 text-neon-green border border-neon-green/40"
                    : "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                    }`}>
                    {settings.voting_active ? "Voting Live" : "Voting Paused"}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Manage live attendee polling for speakers/projects. Completely separate from NFT Badge claims.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <Link
                to="/8980932798801248120247491248142/results"
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 bg-gradient-to-r from-neon-cyan/20 to-eth-purple/20 hover:from-neon-cyan/30 hover:to-eth-purple/30 border border-neon-cyan/40 rounded-xl text-xs font-black text-neon-cyan flex items-center space-x-1.5 shadow-lg shadow-neon-cyan/10 transition-all hover:scale-105"
              >
                <BarChart3 className="w-4 h-4 text-neon-cyan" />
                <span>Launch Stage Projector View</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </Link>

              <a
                href="/vote"
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 bg-slate-900 hover:bg-slate-800 border border-slate-700 rounded-xl text-xs font-bold text-slate-300 hover:text-white flex items-center space-x-1.5 transition-all"
              >
                <span>Attendee Ballot</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>

              {/* Master Voting Switch */}
              <button
                onClick={handleToggleVoting}
                disabled={toggleMutation.isPending}
                className="transition-transform active:scale-95"
              >
                {settings.voting_active ? (
                  <ToggleRight className="w-11 h-11 text-neon-green" />
                ) : (
                  <ToggleLeft className="w-11 h-11 text-slate-600" />
                )}
              </button>
            </div>
          </div>

          {/* 4 Options Real-time Breakdown */}
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400">
              <span className="flex items-center space-x-1.5">
                <BarChart3 className="w-4 h-4 text-neon-cyan" />
                <span>Live 4-Option Vote Tallies</span>
              </span>
              <span className="font-mono text-neon-cyan">{totalVotesCount} Total Votes Cast</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { id: 1, label: "Option 1", desc: "Rollups & Layer 2" },
                { id: 2, label: "Option 2", desc: "Smart Contract Security" },
                { id: 3, label: "Option 3", desc: "DeFi Infrastructure" },
                { id: 4, label: "Option 4", desc: "Zero-Knowledge Proofs" },
              ].map((opt, idx) => {
                const count = voteTallies[idx] || 0;
                const percentage = totalVotesCount > 0 ? Math.round((count / totalVotesCount) * 100) : 0;

                return (
                  <div key={opt.id} className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-white">{opt.label}</span>
                      <span className="font-mono text-xs font-bold text-purple-400">{count} votes ({percentage}%)</span>
                    </div>
                    <p className="text-[11px] text-slate-400 truncate">{opt.desc}</p>
                    <div className="w-full bg-slate-900 rounded-full h-2 overflow-hidden border border-slate-800">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-neon-magenta rounded-full transition-all duration-500"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* VOTING WAVE CONTROLLER (ANTI-THROTTLING ENGINE) */}
          <div className="p-5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <div className="flex items-center space-x-2">
                  <Waves className="w-4 h-4 text-eth-purple" />
                  <h4 className="font-heading font-bold text-white text-sm">
                    Voting Wave Rollout Controller (Anti-Throttling)
                  </h4>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30 font-bold uppercase font-mono">
                    Wave System
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Stagger attendee voting in waves so RPC nodes and smart contract do not get overwhelmed.
                </p>
              </div>

              {/* Status Pill */}
              <div className="flex items-center space-x-2">
                <span className="text-xs text-slate-400">Voting Wave:</span>
                <span className={`px-3 py-1 rounded-full text-xs font-bold font-mono border ${
                  activeVotingWave === 0 || !settings.voting_active
                    ? "bg-rose-500/10 text-rose-400 border-rose-500/30"
                    : activeVotingWave === 99
                    ? "bg-neon-green/10 text-neon-green border-neon-green/30"
                    : "bg-purple-500/20 text-purple-300 border-purple-500/40 animate-pulse"
                }`}>
                  {activeVotingWave === 0 || !settings.voting_active
                    ? "PAUSED"
                    : activeVotingWave === 99
                    ? "ALL OPEN (W1-4)"
                    : `WAVE ${activeVotingWave} ACTIVE`}
                </span>
              </div>
            </div>

            {/* Quick Wave Selection Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400 font-bold mr-1">Set Active Wave:</span>
              {[
                { val: 1, label: "Wave 1" },
                { val: 2, label: "Wave 2 (W1-2)" },
                { val: 3, label: "Wave 3 (W1-3)" },
                { val: 4, label: "Wave 4 (W1-4)" },
                { val: 99, label: "Open All (99)" },
                { val: 0, label: "Pause (0)" },
              ].map((btn) => {
                const isActive = activeVotingWave === btn.val;
                return (
                  <button
                    key={btn.val}
                    onClick={() => handleVotingWaveAdvance(btn.val)}
                    disabled={toggleMutation.isPending}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                      isActive
                        ? "bg-eth-purple text-white shadow-lg shadow-eth-purple/30 border border-purple-400 scale-105"
                        : "bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 hover:text-white"
                    }`}
                  >
                    {btn.label}
                  </button>
                );
              })}

              {activeVotingWave >= 1 && activeVotingWave < 4 && (
                <button
                  onClick={() => handleVotingWaveAdvance(activeVotingWave + 1)}
                  disabled={toggleMutation.isPending}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-black bg-gradient-to-r from-neon-cyan to-eth-purple text-slate-950 shadow-md hover:scale-105 transition-all flex items-center space-x-1 ml-auto"
                >
                  <span>Advance to Wave {activeVotingWave + 1}</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Wave Participation Metrics */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
              {[1, 2, 3, 4].map((w) => {
                const stat = votingWaveStats[w] || { voted: 0, total: 0 };
                const isWaveUnlocked = activeVotingWave === 99 || activeVotingWave >= w;
                const wavePercent = stat.total > 0 ? Math.round((stat.voted / stat.total) * 100) : 0;

                return (
                  <div
                    key={w}
                    className={`p-3 rounded-xl border text-xs space-y-1.5 ${
                      isWaveUnlocked
                        ? "bg-slate-900/90 border-purple-500/30"
                        : "bg-slate-950/40 border-slate-800 opacity-60"
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold">
                      <span className={isWaveUnlocked ? "text-purple-300" : "text-slate-500"}>
                        Wave {w}
                      </span>
                      <span className="font-mono text-[11px] text-slate-400">
                        {stat.voted}/{stat.total} voted ({wavePercent}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden border border-slate-800">
                      <div
                        className="h-full bg-eth-purple rounded-full transition-all duration-500"
                        style={{ width: `${wavePercent}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* VOTING CONTRACT CONFIGURATION & ETHERSCAN VERIFICATION */}
          <div className="p-5 rounded-2xl bg-slate-950/90 border border-slate-800 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
              <div>
                <h4 className="font-heading font-bold text-white text-sm flex items-center space-x-2">
                  <ShieldCheck className="w-4 h-4 text-neon-green" />
                  <span>Voting Smart Contract Integration</span>
                </h4>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Set the deployed Base Sepolia contract address. Votes are verified directly on Etherscan/Basescan.
                </p>
              </div>

              {currentVotingAddress && (
                <a
                  href={`${NETWORK_CONFIG.blockExplorerUrl}/address/${currentVotingAddress}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-neon-cyan hover:underline flex items-center space-x-1.5 text-xs bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-700"
                >
                  <span>{currentVotingAddress.slice(0, 8)}...{currentVotingAddress.slice(-6)}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span className="text-[10px] text-neon-green font-bold">Etherscan ↗</span>
                </a>
              )}
            </div>

            <form onSubmit={handleSaveVotingContractAddress} className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                placeholder="Paste Deployed Base Sepolia Contract Address (0x...)"
                value={votingAddressInput}
                onChange={(e) => setVotingAddressInput(e.target.value)}
                className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5 text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-neon-cyan"
              />
              <button
                type="submit"
                className="px-5 py-2.5 bg-gradient-to-r from-neon-cyan to-eth-purple text-slate-950 font-bold rounded-xl text-xs shadow-md hover:scale-105 transition-all"
              >
                {addressSaveSuccess ? "Saved Successfully!" : "Save Contract Address"}
              </button>
            </form>
          </div>

          {/* RECENT ON-CHAIN VOTING TRANSACTIONS AUDIT */}
          <div className="space-y-3 pt-1">
            <div className="flex items-center justify-between text-xs font-bold text-slate-400">
              <span className="flex items-center space-x-1.5">
                <CheckCircle2 className="w-4 h-4 text-neon-green" />
                <span>Recent Votes Activity & Etherscan Verification</span>
              </span>
              <span className="text-[11px] text-slate-500">Click any transaction to inspect on Base Sepolia</span>
            </div>

            {candidates.filter(c => c.voted_option).length === 0 ? (
              <p className="text-xs text-slate-500 py-3 text-center font-mono bg-slate-950/40 rounded-xl border border-slate-800">
                No ballots cast yet. Once participants vote, their transaction IDs will appear here.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {candidates
                  .filter(c => c.voted_option)
                  .slice(0, 6)
                  .map((c) => (
                    <div key={c.id || c.wallet_address} className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 text-xs space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-slate-200 truncate pr-2">{c.name}</span>
                        <span className="font-mono text-[10px] px-2 py-0.5 rounded-full bg-eth-purple/20 text-purple-300 border border-purple-500/30 font-bold">
                          Opt {c.voted_option}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 font-mono">
                        <span>Wave {getCandidateWave(c)}</span>
                        {c.vote_tx_hash ? (
                          <a
                            href={`${NETWORK_CONFIG.blockExplorerUrl}/tx/${c.vote_tx_hash}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-neon-cyan hover:underline flex items-center space-x-1 bg-cyan-950/40 px-2 py-0.5 rounded border border-cyan-500/30"
                          >
                            <span>{c.vote_tx_hash.slice(0, 6)}...{c.vote_tx_hash.slice(-4)}</span>
                            <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        ) : (
                          <span className="text-slate-600">Pending Tx</span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>

        {/* 3. Candidate Registry & Tier Manager Table */}
        <div className="cyber-glass rounded-3xl p-6 sm:p-8 border border-cyber-border/60 shadow-2xl space-y-6">

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div>
              <div className="flex items-center space-x-2">
                <Users className="w-5 h-5 text-neon-cyan" />
                <h3 className="font-heading text-xl font-bold text-white">Candidate Registry & Tier Manager</h3>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Real-time registry of workshop participants. Change candidate tiers and assigned mint waves in real-time.
              </p>
            </div>

            <div className="flex items-center space-x-3 w-full sm:w-auto">
              <button
                type="button"
                onClick={handleAutoAssignAllWaves}
                className="px-3.5 py-2 rounded-xl bg-neon-cyan/20 hover:bg-neon-cyan/30 text-neon-cyan border border-neon-cyan/40 font-bold text-xs flex items-center space-x-1.5 transition-all shrink-0"
                title="Evenly divides all attendees into 4 waves of ~20 attendees"
              >
                <FastForward className="w-3.5 h-3.5" />
                <span>Auto-Assign 4 Waves</span>
              </button>

              {/* Real-time Search Input */}
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search Name, Reg No, Wallet..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-neon-cyan transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Table Container */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 uppercase tracking-wider font-bold">
                  <th className="py-3 px-4">Candidate</th>
                  <th className="py-3 px-4">Reg No</th>
                  <th className="py-3 px-4">Branch</th>
                  <th className="py-3 px-4">Wallet Address</th>
                  <th className="py-3 px-4">Wave</th>
                  <th className="py-3 px-4">Badges Status</th>
                  <th className="py-3 px-4">Ballot Vote & Tx</th>
                  <th className="py-3 px-4 text-right">Qualified Level</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {isLoadingCandidates ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-400">
                      <Loader2 className="w-6 h-6 animate-spin mx-auto text-neon-cyan mb-2" />
                      <span>Loading candidate registry...</span>
                    </td>
                  </tr>
                ) : filteredCandidates.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-500">
                      No candidates found matching search term.
                    </td>
                  </tr>
                ) : (
                  filteredCandidates.map((c, idx) => {
                    const waveVal = getCandidateWave(c, idx, candidates.length);
                    const userLevel = c.tier || 1;
                    return (
                      <tr key={c.id || c.reg_no} className="hover:bg-slate-900/60 transition-colors">
                        <td className="py-3.5 px-4 font-bold text-slate-100">{c.name}</td>
                        <td className="py-3.5 px-4 font-mono text-neon-magenta font-bold">{c.reg_no}</td>
                        <td className="py-3.5 px-4 text-slate-300">{c.branch}</td>
                        <td className="py-3.5 px-4 font-mono text-slate-400">{shortenAddress(c.wallet_address)}</td>
                        <td className="py-3.5 px-4">
                          <select
                            value={waveVal}
                            onChange={(e) => handleCandidateWaveChange(c.wallet_address, e.target.value)}
                            className="bg-slate-950 border border-slate-800 text-amber-300 rounded-lg px-2 py-1 text-xs font-bold focus:outline-none focus:border-neon-cyan cursor-pointer"
                          >
                            <option value={1}>Wave 1</option>
                            <option value={2}>Wave 2</option>
                            <option value={3}>Wave 3</option>
                            <option value={4}>Wave 4</option>
                          </select>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center space-x-2">
                            {userLevel >= 3 ? (
                              <span className="px-2.5 py-0.5 rounded-full bg-gradient-to-r from-amber-500/20 to-neon-magenta/20 text-amber-300 border border-amber-400/50 font-black text-[10px] inline-flex items-center space-x-1 shadow-sm">
                                <span>🏆 WINNER (3/3)</span>
                              </span>
                            ) : userLevel === 2 ? (
                              <span className="px-2.5 py-0.5 rounded-full bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/40 font-bold text-[10px] inline-flex items-center space-x-1">
                                <span>⚡ Builder (2/3)</span>
                              </span>
                            ) : c.has_claimed_badge ? (
                              <span className="px-2.5 py-0.5 rounded-full bg-neon-green/10 text-neon-green border border-neon-green/30 font-bold text-[10px] inline-flex items-center space-x-1">
                                <CheckCircle2 className="w-3 h-3" />
                                <span>Attendee (1/3)</span>
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full bg-slate-800 text-slate-400 font-bold text-[10px]">
                                Pending Check-in
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          {c.voted_option ? (
                            <div className="flex items-center space-x-1.5">
                              <span className="px-2 py-0.5 rounded-full bg-eth-purple/20 text-purple-300 border border-purple-500/40 font-bold text-[10px]">
                                Opt {c.voted_option}
                              </span>
                              {c.vote_tx_hash ? (
                                <a
                                  href={`${NETWORK_CONFIG.blockExplorerUrl}/tx/${c.vote_tx_hash}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  title="Inspect transaction on Basescan / Etherscan"
                                  className="text-neon-cyan hover:underline flex items-center space-x-0.5 text-[10px] bg-cyan-950/40 px-1.5 py-0.5 rounded border border-cyan-500/30"
                                >
                                  <span>tx</span>
                                  <ExternalLink className="w-2.5 h-2.5" />
                                </a>
                              ) : (
                                <span className="text-[10px] text-slate-500">verified</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-slate-600 text-[10px] font-mono">Not Voted</span>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center space-x-2 justify-end">
                            <select
                              value={userLevel}
                              onChange={(e) => handleTierChange(c.wallet_address, e.target.value)}
                              className="bg-slate-950 border border-cyber-border/80 text-neon-cyan rounded-lg px-2.5 py-1 text-xs font-bold focus:outline-none focus:border-neon-magenta cursor-pointer"
                            >
                              <option value={1}>Level 1: Attendee</option>
                              <option value={2}>Level 2: Builder</option>
                              <option value={3}>Level 3: Winner</option>
                            </select>

                            {/* Quick Promotion Shortcuts */}
                            {userLevel < 2 && (
                              <button
                                onClick={() => handleTierChange(c.wallet_address, 2)}
                                title="Unlock Tier 2 for this candidate"
                                className="px-2 py-1 bg-neon-cyan/10 hover:bg-neon-cyan/25 text-neon-cyan border border-neon-cyan/30 rounded-lg text-[10px] font-bold transition-all"
                              >
                                + Builder
                              </button>
                            )}
                            {userLevel < 3 && (
                              <button
                                onClick={() => handleTierChange(c.wallet_address, 3)}
                                title="Unlock Tier 3 (Winner) for this candidate"
                                className="px-2 py-1 bg-neon-magenta/10 hover:bg-neon-magenta/25 text-neon-magenta border border-neon-magenta/30 rounded-lg text-[10px] font-bold transition-all"
                              >
                                + Winner
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

        </div>

        {/* 4. Batch Wallet Funder Tool */}
        <div className="cyber-glass rounded-3xl p-6 sm:p-8 border border-cyber-border/60 shadow-2xl space-y-6">

          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-slate-800">
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-xl bg-neon-green/10 border border-neon-green/30 flex items-center justify-center text-neon-green">
                <Coins className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-heading text-lg font-bold text-white">Batch Wallet Funder Tool</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Batch allocate test ETH gas balance to candidate wallets on Base Sepolia.
                </p>
              </div>
            </div>

            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-2 bg-slate-950 border border-slate-800 rounded-xl px-3 py-1.5">
                <span className="text-xs text-slate-400 font-bold">ETH Amount:</span>
                <input
                  type="text"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  className="w-16 bg-transparent text-xs font-mono font-bold text-neon-green focus:outline-none text-right"
                />
              </div>

              <button
                onClick={handleBatchFunding}
                disabled={isFunding || candidates.length === 0}
                className="bg-gradient-to-r from-neon-green to-emerald-600 hover:opacity-95 text-slate-950 font-black px-5 py-2.5 rounded-xl text-xs shadow-lg shadow-neon-green/20 flex items-center space-x-2 transition-all disabled:opacity-50"
              >
                {isFunding ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Funding Wallets...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-slate-950" />
                    <span>Fund All Registered Wallets ({candidates.length})</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Terminal Log Console */}
          <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 font-mono text-xs text-slate-300 space-y-1.5 max-h-60 overflow-y-auto shadow-inner">
            <div className="flex items-center space-x-2 text-slate-500 pb-2 border-b border-slate-900">
              <Terminal className="w-4 h-4 text-neon-cyan" />
              <span>Batch Funder Terminal Output Console</span>
            </div>
            {fundingLogs.length === 0 ? (
              <p className="text-slate-600 italic py-2">
                Click "Fund All Registered Wallets" to initiate batch gas allocation to candidate accounts.
              </p>
            ) : (
              fundingLogs.map((log, idx) => (
                <div key={idx} className="flex items-start space-x-2">
                  <span className="text-neon-cyan">&gt;</span>
                  <span className={log.includes("[SUCCESS]") ? "text-neon-green font-bold" : log.includes("[ERROR]") ? "text-rose-400 font-bold" : "text-slate-300"}>
                    {log}
                  </span>
                </div>
              ))
            )}
          </div>

        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-cyber-border/40 bg-cyber-void/90 py-6 relative z-10">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-center gap-4">
          <p>© 2026 ETH Club VJTI • Base Sepolia Migration</p>
        </div>
      </footer>

    </div>
  );
}
