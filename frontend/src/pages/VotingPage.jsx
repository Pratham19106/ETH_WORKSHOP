import React, { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Vote,
  Award,
  Wallet,
  ShieldCheck,
  CheckCircle2,
  Lock,
  ExternalLink,
  Loader2,
  Sparkles,
  AlertTriangle,
  Radio,
  LogOut,
  Network,
  UserCheck
} from "lucide-react";
import { useWeb3 } from "../hooks/useWeb3";
import { dbService, getCandidateWave } from "../lib/supabase";
import {
  NETWORK_CONFIG,
  VOTING_CONTRACT_ADDRESS,
  getVotingContractAddress,
  VJTIWORKSHOPVOTING_ABI
} from "../config/network";
import BlockchainBackgroundAccents from "../components/BlockchainBackgroundAccents";
import { BrowserProvider, Contract } from "ethers";

// Default Voting Option Definitions (Can represent speakers, projects, or workshop tracks)
const VOTING_OPTIONS = [
  {
    id: 1,
    title: "Option 1: Decentralized Rollups & Layer 2",
    subtitle: "Scaling Ethereum with optimistic and zero-knowledge rollups",
    badgeColor: "border-cyan-500/40 bg-cyan-950/20 text-neon-cyan",
    accentColor: "#00F0FF",
  },
  {
    id: 2,
    title: "Option 2: Smart Contract Auditing & Security",
    subtitle: "Reentrancy, access controls, formal verification & invariant testing",
    badgeColor: "border-purple-500/40 bg-purple-950/20 text-purple-400",
    accentColor: "#A855F7",
  },
  {
    id: 3,
    title: "Option 3: DeFi Infrastructure & Automated Market Makers",
    subtitle: "Liquidity pools, flash loans, and decentralized financial primitives",
    badgeColor: "border-amber-500/40 bg-amber-950/20 text-amber-400",
    accentColor: "#F59E0B",
  },
  {
    id: 4,
    title: "Option 4: Zero-Knowledge Proofs & Privacy",
    subtitle: "zk-SNARKs, validity proofs, and cryptographic identity on EVM",
    badgeColor: "border-neon-magenta/40 bg-pink-950/20 text-neon-magenta",
    accentColor: "#FF007A",
  },
];

export default function VotingPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {
    account,
    shortenAddress,
    balance,
    connect,
    isCorrectNetwork,
    switchNetwork
  } = useWeb3();

  // Active Candidate Session state
  const [candidate, setCandidate] = useState(null);

  // Voting Selection State
  const [selectedOption, setSelectedOption] = useState(null);
  const [isVoting, setIsVoting] = useState(false);
  const [voteError, setVoteError] = useState(null);
  const [voteTxHash, setVoteTxHash] = useState(null);

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

  // TanStack Query 1: Fetch Event Settings (voting_active)
  const { data: settings = { voting_active: true } } = useQuery({
    queryKey: ["event_settings"],
    queryFn: () => dbService.getEventSettings(),
    refetchInterval: 4000,
  });

  // TanStack Query 2: Fetch Current Candidate Profile
  const targetWallet = account || candidate?.wallet_address;
  const { data: currentCandidate = candidate, refetch: refetchCandidate } = useQuery({
    queryKey: ["candidate", targetWallet],
    queryFn: () => dbService.getCandidate(targetWallet),
    enabled: Boolean(targetWallet),
    initialData: candidate,
    refetchInterval: 4000,
  });

  // Anti-throttling wave calculation for Voting
  const attendeeWave = getCandidateWave(currentCandidate);
  const activeVotingWave = typeof settings.voting_active_wave === "number" ? settings.voting_active_wave : 99;
  const isVotingWaveReady = activeVotingWave === 99 || activeVotingWave >= attendeeWave;

  // Persistent On-Chain Transaction Hash
  const activeTxHash =
    voteTxHash ||
    currentCandidate?.vote_tx_hash ||
    (targetWallet ? localStorage.getItem(`vjti_vote_tx_${targetWallet}`) : null);

  // TanStack Query 3: Check THIS Voter's On-Chain / Database Status (Zero full-table database scans)
  const { data: voterOnChainStatus = { hasVoted: false, voterChoice: 0 }, refetch: refetchVoterStatus } = useQuery({
    queryKey: ["voter_status", targetWallet],
    queryFn: async () => {
      if (!targetWallet) return { hasVoted: false, voterChoice: 0 };

      const votingAddress = getVotingContractAddress();

      // 1. Try querying on-chain if contract address configured
      if (votingAddress && votingAddress.length === 42 && window.ethereum) {
        try {
          const provider = new BrowserProvider(window.ethereum);
          const contract = new Contract(votingAddress, VJTIWORKSHOPVOTING_ABI, provider);

          const hasVoted = await contract.hasVoted(targetWallet);
          let choice = 0;
          if (hasVoted) {
            choice = Number(await contract.voterChoice(targetWallet));
          }

          return {
            hasVoted: Boolean(hasVoted),
            voterChoice: choice,
          };
        } catch (contractErr) {
          console.warn("On-chain voter query fallback:", contractErr.message);
        }
      }

      // 2. Fallback using this candidate's own single record (no full-table scans)
      return {
        hasVoted: Boolean(currentCandidate?.voted_option),
        voterChoice: Number(currentCandidate?.voted_option || 0),
      };
    },
    enabled: Boolean(targetWallet),
    refetchInterval: 5000,
  });

  const isVotingActive = settings.voting_active !== false;
  const userHasVoted = voterOnChainStatus.hasVoted || Boolean(currentCandidate?.voted_option) || Boolean(activeTxHash);
  const userChoice = voterOnChainStatus.voterChoice || currentCandidate?.voted_option || selectedOption;

  // Cast On-Chain Vote
  const handleCastVote = async () => {
    if (!selectedOption) {
      setVoteError("Please select an option before voting.");
      return;
    }

    if (!isVotingActive) {
      setVoteError("Voting is currently locked by the event administrator.");
      return;
    }

    if (!isVotingWaveReady) {
      setVoteError(`Your wave (Wave ${attendeeWave}) is not active yet. Active wave is Wave ${activeVotingWave}.`);
      return;
    }

    if (userHasVoted) {
      setVoteError("You have already cast your vote. Votes are one per attendee.");
      return;
    }

    setVoteError(null);
    setIsVoting(true);

    try {
      let activeAccount = account;
      if (!activeAccount) {
        activeAccount = await connect();
      }

      const isOk = await isCorrectNetwork;
      if (!isOk) {
        await switchNetwork();
      }

      let txHash = null;
      const votingAddress = getVotingContractAddress();

      // 1. If contract address is configured, broadcast on-chain
      if (votingAddress && votingAddress.length === 42 && window.ethereum) {
        const provider = new BrowserProvider(window.ethereum);
        const signer = await provider.getSigner();
        const contract = new Contract(votingAddress, VJTIWORKSHOPVOTING_ABI, signer);

        const tx = await contract.vote(selectedOption);
        txHash = tx.hash;
        setVoteTxHash(tx.hash);
        if (targetWallet) {
          localStorage.setItem(`vjti_vote_tx_${targetWallet}`, tx.hash);
        }
        await tx.wait(1);
      } else {
        // Simulated local fallback if contract not configured yet
        txHash = `0x_local_vote_${Date.now()}`;
        setVoteTxHash(txHash);
        if (targetWallet) {
          localStorage.setItem(`vjti_vote_tx_${targetWallet}`, txHash);
        }
      }

      // 2. Record vote in Supabase candidate record
      await dbService.updateCandidate(activeAccount || targetWallet, {
        voted_option: selectedOption,
        vote_tx_hash: txHash,
      });

      // 3. Refresh queries
      queryClient.invalidateQueries(["candidate", targetWallet]);
      queryClient.invalidateQueries(["voter_status", targetWallet]);
      await Promise.all([refetchCandidate(), refetchVoterStatus()]);
    } catch (err) {
      console.error("Voting submission error:", err);
      let msg = err.message || "Failed to submit vote.";
      if (err.code === "ACTION_REJECTED" || err.code === 4001) {
        msg = "Transaction was cancelled in MetaMask.";
      } else if (err.message?.includes("AlreadyVoted")) {
        msg = "Already voted: This wallet has already cast a vote.";
      }
      setVoteError(msg);
    } finally {
      setIsVoting(false);
    }
  };

  // Handle Logout
  const handleLogout = () => {
    localStorage.removeItem("vjti_eth_user");
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-cyber-void text-slate-100 cyber-grid-bg flex flex-col justify-between relative overflow-hidden font-mono">

      {/* Atmospheric Neon Accents */}
      <div className="absolute top-[-10%] right-[-10%] w-[600px] h-[600px] bg-eth-purple/20 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[700px] h-[700px] bg-neon-cyan/15 rounded-full blur-[180px] pointer-events-none" />

      <BlockchainBackgroundAccents />

      {/* Header Bar */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-cyber-void/80 border-b border-cyber-border/40">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 sm:h-[84px] flex items-center justify-between">

          <div className="flex items-center space-x-2.5 sm:space-x-3.5">
            <img
              src="/ETH_VJTI.jpg"
              alt="ETH VJTI Logo"
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl object-cover border border-eth-purple/40 shadow-md shadow-eth-purple/20 ring-2 ring-eth-purple/30 shrink-0"
            />
            <div>
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <span className="font-heading font-extrabold text-lg sm:text-[1.35rem] tracking-tight text-white glow-magenta">
                  Voting Arena
                </span>
                <span className="text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded-full bg-eth-purple/20 text-purple-300 border border-eth-purple/40 font-bold">
                  On-Chain Poll
                </span>
              </div>
              <p className="text-[11px] sm:text-[0.8rem] text-slate-400 max-w-[130px] sm:max-w-none truncate">
                {currentCandidate ? `${currentCandidate.name} (${currentCandidate.reg_no})` : "Candidate Session Active"}
              </p>
            </div>
          </div>

          {/* Navigation Between Hub and Voting */}
          <div className="hidden md:flex items-center space-x-2 bg-slate-950/80 p-1 rounded-2xl border border-slate-800">
            <Link
              to="/hub"
              className="px-4 py-2 rounded-xl text-xs font-bold transition-all text-slate-400 hover:text-white flex items-center space-x-2"
            >
              <Award className="w-4 h-4 text-neon-cyan" />
              <span>NFT Badges Hub</span>
            </Link>
            <div className="px-4 py-2 rounded-xl text-xs font-black transition-all bg-eth-purple/20 text-purple-300 border border-eth-purple/40 flex items-center space-x-2 shadow-sm">
              <Vote className="w-4 h-4 text-purple-300" />
              <span>Voting Arena</span>
            </div>
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
                className="flex items-center space-x-1.5 sm:space-x-2 bg-gradient-to-r from-eth-purple to-neon-magenta text-white font-bold px-3 py-1.5 sm:px-4 sm:py-2 rounded-full text-xs shadow-lg shadow-eth-purple/20 transition-all hover:scale-105 active:scale-95"
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
      <main className="max-w-7xl mx-auto px-3 sm:px-6 py-6 sm:py-10 w-full flex-1 space-y-6 sm:space-y-8 relative z-10">

        {/* Mobile Navigation Pill */}
        <div className="flex md:hidden items-center justify-center space-x-2 bg-slate-950/90 p-1 rounded-xl border border-slate-800 max-w-xs mx-auto shadow-md mb-2">
          <Link
            to="/hub"
            className="flex-1 text-center py-2 rounded-lg text-xs font-bold text-slate-400 hover:text-white"
          >
            NFT Badges
          </Link>
          <div className="flex-1 text-center py-2 rounded-lg text-xs font-black bg-eth-purple/20 text-purple-300 border border-eth-purple/40">
            Voting
          </div>
        </div>

        {/* Top Activity Banner */}
        <div className="cyber-glass rounded-2xl sm:rounded-3xl p-4 sm:p-8 border border-cyber-border/60 shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-6">
          <div className="flex items-center space-x-3 sm:space-x-4">
            <div className="w-12 h-12 sm:w-16 sm:h-16 rounded-xl sm:rounded-2xl bg-eth-purple/15 border border-eth-purple/40 flex items-center justify-center text-eth-purple shadow-lg shadow-eth-purple/20 shrink-0">
              <Vote className="w-6 h-6 sm:w-8 sm:h-8" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="font-heading text-lg sm:text-2xl font-black text-white">
                  Workshop Decentralized Voting Activity
                </h1>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase ${isVotingActive
                  ? "bg-neon-green/20 text-neon-green border border-neon-green/40"
                  : "bg-rose-500/20 text-rose-400 border border-rose-500/40"
                  }`}>
                  {isVotingActive ? "Voting Live" : "Voting Paused"}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                Cast your verified vote on Base Sepolia. Each workshop participant can vote for one of the 4 options. All results are tallied directly on-chain.
              </p>
            </div>
          </div>

          {/* User Voting Status Indicator */}
          <div className="bg-slate-950/80 border border-slate-800 px-4 py-2.5 sm:px-5 sm:py-3 rounded-xl sm:rounded-2xl text-left w-full sm:w-auto shrink-0">
            <span className="text-[10px] uppercase font-bold text-slate-500 block">Your Ballot Status</span>
            {userHasVoted ? (
              <span className="text-neon-green font-bold text-xs flex items-center space-x-1.5 mt-0.5">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Vote Cast for Option {userChoice}</span>
              </span>
            ) : !isVotingWaveReady ? (
              <span className="text-purple-400 font-bold text-xs flex items-center space-x-1.5 mt-0.5">
                <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                <span>Wave {attendeeWave} Queued (Active: W{activeVotingWave})</span>
              </span>
            ) : (
              <span className="text-amber-400 font-bold text-xs flex items-center space-x-1.5 mt-0.5">
                <Radio className="w-4 h-4 animate-pulse shrink-0" />
                <span>Wave {attendeeWave} • Ready to Vote</span>
              </span>
            )}
          </div>
        </div>

        {/* Centered Ballot Container (Distraction-Free, Zero Overwhelming Polling) */}
        <div className="max-w-2xl mx-auto space-y-6">

          <div className="cyber-glass rounded-2xl sm:rounded-3xl p-4 sm:p-8 border border-cyber-border/60 shadow-2xl space-y-5 sm:space-y-6">
            <div className="flex items-center justify-between pb-3 sm:pb-4 border-b border-slate-800">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-eth-purple shrink-0" />
                <h3 className="font-heading text-base sm:text-lg font-bold text-white">Select Your Choice</h3>
              </div>
              <span className="text-[11px] sm:text-xs text-slate-400 font-mono">1 Vote per Wallet</span>
            </div>

            {/* The 4 Options Radio Cards */}
            <div className="space-y-3.5">
              {VOTING_OPTIONS.map((opt) => {
                const isSelected = selectedOption === opt.id || userChoice === opt.id;
                const isUserPick = userHasVoted && userChoice === opt.id;

                return (
                  <div
                    key={opt.id}
                    onClick={() => {
                      if (!userHasVoted && isVotingActive && isVotingWaveReady) {
                        setSelectedOption(opt.id);
                        setVoteError(null);
                      }
                    }}
                    className={`p-3.5 sm:p-4 rounded-xl sm:rounded-2xl border transition-all cursor-pointer relative overflow-hidden active:scale-[0.99] ${isUserPick
                      ? "bg-neon-green/10 border-neon-green shadow-lg shadow-neon-green/10"
                      : isSelected
                        ? "bg-slate-900/90 border-eth-purple shadow-lg shadow-eth-purple/20 scale-[1.01]"
                        : "bg-slate-950/60 border-slate-800/80 hover:border-slate-700 hover:bg-slate-900/40"
                      } ${userHasVoted || !isVotingWaveReady ? "cursor-default" : ""}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start space-x-3 sm:space-x-3.5">
                        {/* Radio Check Indicator */}
                        <div className={`w-5 h-5 rounded-full border flex items-center justify-center shrink-0 mt-0.5 transition-all ${isUserPick
                          ? "border-neon-green bg-neon-green text-slate-950"
                          : isSelected
                            ? "border-eth-purple bg-eth-purple text-white"
                            : "border-slate-700 bg-slate-900"
                          }`}>
                          {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                        </div>

                        <div>
                          <h4 className="font-heading text-sm sm:text-base font-bold text-white flex flex-wrap items-center gap-1.5">
                            <span>{opt.title}</span>
                            {isUserPick && (
                              <span className="text-[10px] font-mono px-2 py-0.5 bg-neon-green/20 text-neon-green border border-neon-green/40 rounded-full font-black">
                                YOUR VOTE
                              </span>
                            )}
                          </h4>
                          <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                            {opt.subtitle}
                          </p>
                        </div>
                      </div>

                      <span className="text-xs font-mono font-bold text-slate-500 shrink-0">
                        #{opt.id}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Error Message */}
            {voteError && (
              <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/30 flex items-start space-x-2 text-xs text-rose-200">
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span>{voteError}</span>
              </div>
            )}

            {/* Submit Vote Button */}
            <div>
              {userHasVoted ? (
                <div className="space-y-3">
                  <button
                    disabled
                    className="w-full bg-slate-900 border border-neon-green/40 text-neon-green font-bold py-4 px-6 rounded-2xl flex items-center justify-center space-x-2 cursor-not-allowed shadow-lg shadow-neon-green/10"
                  >
                    <CheckCircle2 className="w-5 h-5 text-neon-green" />
                    <span>Vote Confirmed on-chain (Option {userChoice})</span>
                  </button>
                  <p className="text-[11px] text-center text-slate-400 font-mono">
                    Your address <code className="text-slate-200 font-bold">{shortenAddress(targetWallet)}</code> has voted. Thank you for participating!
                  </p>
                </div>
              ) : !isVotingActive ? (
                <button
                  disabled
                  className="w-full bg-slate-900 border border-slate-800 text-slate-500 font-bold py-4 px-6 rounded-2xl flex items-center justify-center space-x-2 cursor-not-allowed"
                >
                  <Lock className="w-5 h-5 text-slate-600" />
                  <span>Voting Activity Paused by Admin</span>
                </button>
              ) : !isVotingWaveReady ? (
                <div className="space-y-2">
                  <button
                    disabled
                    className="w-full bg-slate-900/90 border border-purple-500/40 text-purple-300 font-bold py-4 px-6 rounded-2xl flex items-center justify-center space-x-2 cursor-not-allowed shadow-lg shadow-purple-500/10 text-xs"
                  >
                    <Loader2 className="w-4 h-4 animate-spin text-purple-400" />
                    <span>Wave {attendeeWave} in Queue (Active: Wave {activeVotingWave})</span>
                  </button>
                  <p className="text-[11px] text-center text-purple-300/80 font-mono">
                    Voting is staggered in waves to avoid RPC congestion. Your wave will automatically unlock!
                  </p>
                </div>
              ) : (
                <button
                  onClick={handleCastVote}
                  disabled={!selectedOption || isVoting}
                  className="w-full bg-gradient-to-r from-eth-purple via-indigo-600 to-neon-magenta hover:opacity-95 text-white font-black py-3.5 sm:py-4 px-4 sm:px-6 min-h-[50px] rounded-xl sm:rounded-2xl shadow-xl shadow-eth-purple/25 flex items-center justify-center space-x-2 transition-all hover:scale-[1.01] active:scale-[0.98] disabled:opacity-40 disabled:cursor-not-allowed text-sm sm:text-base"
                >
                  {isVoting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Submitting Vote to Base Sepolia...</span>
                    </>
                  ) : (
                    <>
                      <Vote className="w-5 h-5" />
                      <span>Submit Vote for Option {selectedOption || "..."}</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Confirmed Tx Hash Link with Direct Etherscan/Basescan Button */}
            {activeTxHash && (
              <div className="pt-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-t border-slate-800">
                <span className="text-slate-400 flex items-center space-x-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-neon-green" />
                  <span>On-Chain Transaction ID:</span>
                </span>
                <a
                  href={`${NETWORK_CONFIG.blockExplorerUrl}/tx/${activeTxHash}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-neon-cyan hover:underline flex items-center space-x-1.5 bg-cyan-950/40 border border-cyan-500/30 px-3 py-1.5 rounded-xl text-xs shadow-sm hover:border-cyan-400 transition-colors"
                >
                  <span>{shortenAddress(activeTxHash)}</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                  <span className="text-[10px] text-cyan-300 font-sans font-bold">Open on Basescan ↗</span>
                </a>
              </div>
            )}
          </div>

          {/* Post-Vote Confirmation & Projector Stage Information Banner */}
          {userHasVoted ? (
            <div className="p-6 rounded-3xl bg-slate-950/80 border border-neon-green/40 shadow-xl space-y-3">
              <div className="flex items-center space-x-2.5 text-neon-green">
                <CheckCircle2 className="w-5 h-5" />
                <h4 className="font-heading text-base font-bold text-white">
                  Ballot Sealed on Base Sepolia
                </h4>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed font-sans">
                Your choice for <strong className="text-neon-cyan">{VOTING_OPTIONS.find(o => o.id === userChoice)?.title || `Option ${userChoice}`}</strong> has been permanently inscribed onto the blockchain.
              </p>
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center space-x-2.5 text-xs text-slate-300">
                <ShieldCheck className="w-4 h-4 text-eth-purple shrink-0" />
                <span className="font-mono text-[11px]">
                  Live voting tallies are displayed on the auditorium stage screen by workshop organizers.
                </span>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800/80 flex items-center space-x-3 text-xs text-slate-400">
              <ShieldCheck className="w-4 h-4 text-neon-green shrink-0" />
              <span>
                Votes are cast directly via smart contract on Base Sepolia. Every vote is cryptographic, immutable, and tamper-proof.
              </span>
            </div>
          )}

        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-cyber-border/40 bg-cyber-void/90 py-6 relative z-10">
        <div className="max-w-6xl mx-auto px-4 text-center text-xs text-slate-500">
          <p>© 2026 ETH Club VJTI. Workshop Voting Arena.</p>
        </div>
      </footer>

    </div>
  );
}

