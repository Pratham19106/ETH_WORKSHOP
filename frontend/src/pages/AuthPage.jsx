import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Wallet,
  Sparkles,
  ArrowRight,
  Cpu,
  User,
  Hash,
  BookOpen,
  Network,
  CheckCircle2,
  AlertCircle,
  LogIn,
  UserPlus,
  Award,
  Vote,
  Zap
} from "lucide-react";
import { useWeb3 } from "../hooks/useWeb3";
import { dbService } from "../lib/supabase";
import { NETWORK_CONFIG } from "../config/network";
import BlockchainBackgroundAccents from "../components/BlockchainBackgroundAccents";

export default function AuthPage() {
  const navigate = useNavigate();
  const { account, shortenAddress, connect, isCorrectNetwork, switchNetwork } = useWeb3();

  // Candidate Sub-Mode State: 'login' | 'signup'
  const [candidateMode, setCandidateMode] = useState("login");

  // Candidate Signup Form State
  const [name, setName] = useState("");
  const [regNo, setRegNo] = useState("");
  const [branch, setBranch] = useState("Computer Engineering");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [candidateError, setCandidateError] = useState(null);

  // Candidate Login Form State
  const [loginRegNo, setLoginRegNo] = useState("");
  const [loginWalletAddress, setLoginWalletAddress] = useState("");
  const [isLoginSubmitting, setIsLoginSubmitting] = useState(false);
  const [loginError, setLoginError] = useState(null);

  // Helper to autofill or connect MetaMask wallet address into login input
  const handleAutofillWallet = async () => {
    try {
      let connected = account;
      if (!connected) {
        connected = await connect();
      }
      if (connected) {
        setLoginWalletAddress(connected);
      }
    } catch (err) {
      console.error("MetaMask connect error:", err);
    }
  };

  // Handle Candidate Signup Submit
  const handleCandidateSignup = async (e) => {
    e.preventDefault();
    setCandidateError(null);

    const cleanName = name.trim();
    const cleanRegNo = regNo.trim().toUpperCase();

    if (!cleanName || !cleanRegNo) {
      setCandidateError("Please enter your Full Name and Registration Number.");
      return;
    }

    setIsSubmitting(true);
    try {
      // 1. Ensure Wallet Connection strictly via MetaMask
      let connectedAddress = account;
      if (!connectedAddress) {
        connectedAddress = await connect();
      }

      const cleanWallet = connectedAddress.toLowerCase();

      // 2. Check if candidate is already registered by Registration Number
      const existingCandidate = await dbService.getCandidateByRegNo(cleanRegNo);
      if (existingCandidate) {
        if (existingCandidate.wallet_address?.toLowerCase() === cleanWallet) {
          // Same user re-signing up: seamlessly store session and log them in
          localStorage.setItem("vjti_eth_user", JSON.stringify(existingCandidate));
          navigate("/hub");
          return;
        } else {
          setCandidateError(
            `Registration Number ${cleanRegNo} is already registered to another wallet (${shortenAddress(existingCandidate.wallet_address)}). Please log in with that wallet.`
          );
          return;
        }
      }

      // 3. Check if connected wallet is already linked to another registration number
      const existingWallet = await dbService.getCandidate(cleanWallet);
      if (existingWallet) {
        setCandidateError(
          `Connected wallet ${shortenAddress(cleanWallet)} is already registered under Registration No. ${existingWallet.reg_no} (${existingWallet.name}). Please switch to Log In.`
        );
        return;
      }

      // 4. Save brand new candidate details to Supabase
      const candidateData = {
        name: cleanName,
        reg_no: cleanRegNo,
        branch: branch,
        wallet_address: cleanWallet,
        has_claimed_badge: false,
        tx_hash: null,
        tier: 1,
      };

      const saved = await dbService.saveCandidate(candidateData);

      // Store session state in localStorage for persistent route access
      localStorage.setItem("vjti_eth_user", JSON.stringify(saved));

      // Navigate to Attendee Hub
      navigate("/hub");
    } catch (err) {
      console.error("Candidate onboarding error:", err);
      setCandidateError(err.message || "Failed to register candidate.");
    } finally {
      setIsSubmitting(false);
    }
  };

  // Handle Candidate Login with Registration Number & Connected MetaMask verification
  const handleCandidateLogin = async (e) => {
    e.preventDefault();
    setLoginError(null);

    const inputRegNo = loginRegNo.trim().toUpperCase();
    const inputWallet = (loginWalletAddress || account || "").trim().toLowerCase();

    if (!inputRegNo) {
      setLoginError("Please enter your VJTI Registration Number.");
      return;
    }

    if (!inputWallet || inputWallet.length !== 42) {
      setLoginError("Please enter or connect your valid 42-character Ethereum Wallet Address.");
      return;
    }

    setIsLoginSubmitting(true);
    try {
      // 1. Fetch candidate record by Registration Number from Supabase
      let candidate = await dbService.getCandidateByRegNo(inputRegNo);

      // 2. Fallback check by Wallet Address
      if (!candidate) {
        candidate = await dbService.getCandidate(inputWallet);
      }

      if (!candidate) {
        setLoginError(`No registered profile found for Registration No. "${inputRegNo}". Please click "Sign Up" above to register.`);
        return;
      }

      // 3. Verify Wallet Address Match
      const storedWallet = (candidate.wallet_address || "").toLowerCase();
      if (storedWallet !== inputWallet) {
        setLoginError(
          `Wallet mismatch: Registration Number ${inputRegNo} is linked to ${shortenAddress(storedWallet)}. You entered ${shortenAddress(inputWallet)}.`
        );
        return;
      }

      // 4. Successful Login
      localStorage.setItem("vjti_eth_user", JSON.stringify(candidate));
      navigate("/hub");
    } catch (err) {
      console.error("Candidate login error:", err);
      setLoginError(err.message || "Authentication failed. Please check your credentials.");
    } finally {
      setIsLoginSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-cyber-void text-slate-100 cyber-grid-bg flex flex-col justify-between relative overflow-hidden font-sans">

      {/* Floating Atmosphere & Ambient Lighting */}
      <div className="absolute top-[-10%] left-[-10%] w-[650px] h-[650px] bg-neon-magenta/15 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[750px] h-[750px] bg-neon-cyan/15 rounded-full blur-[180px] pointer-events-none" />
      <div className="absolute top-[35%] right-[20%] w-[450px] h-[450px] bg-eth-purple/20 rounded-full blur-[150px] pointer-events-none" />

      <BlockchainBackgroundAccents />

      {/* Top Header */}
      <header className="sticky top-0 z-40 backdrop-blur-md bg-cyber-void/85 border-b border-cyber-border/40">
        <div className="max-w-7xl mx-auto px-3 sm:px-8 h-16 sm:h-20 flex items-center justify-between">
          <div className="flex items-center space-x-2.5 sm:space-x-4">
            <img
              src="/ETH_VJTI.jpg"
              alt="ETH VJTI Logo"
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl object-cover border-2 border-neon-cyan/50 shadow-md shadow-neon-cyan/20 ring-2 ring-neon-cyan/30 shrink-0"
            />
            <div>
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <span className="font-heading font-black text-lg sm:text-2xl tracking-tight text-white glow-cyan">
                  ETH VJTI
                </span>
                
              </div>
              <p className="text-[11px] sm:text-sm text-slate-300 font-medium">Web3 Genesis</p>
            </div>
          </div>

          <div className="flex items-center space-x-2 sm:space-x-3">
            {account ? (
              <div className="flex items-center space-x-1.5 sm:space-x-2 bg-slate-900/90 border border-slate-700 rounded-full p-1 sm:p-1.5 pl-2.5 sm:pl-4 text-xs sm:text-sm shadow-md">
                <button
                  onClick={switchNetwork}
                  className={`flex items-center space-x-1 px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-full font-bold transition-all ${
                    isCorrectNetwork
                      ? "bg-neon-green/15 text-neon-green border border-neon-green/40"
                      : "bg-amber-500/15 text-amber-300 border border-amber-500/40"
                  }`}
                >
                  <Network className="w-3.5 h-3.5 shrink-0" />
                  <span className="hidden xs:inline sm:inline">{isCorrectNetwork ? `● ${NETWORK_CONFIG.chainName}` : "Switch Net"}</span>
                  <span className="xs:hidden sm:hidden">{isCorrectNetwork ? "● Base" : "Switch"}</span>
                </button>
                <span className="font-mono text-slate-200 font-bold">{shortenAddress(account)}</span>
              </div>
            ) : (
              <button
                onClick={connect}
                className="flex items-center space-x-1.5 sm:space-x-2 bg-gradient-to-r from-neon-cyan via-teal-400 to-indigo-600 hover:opacity-95 text-slate-950 font-black px-3.5 py-1.5 sm:px-5 sm:py-2.5 rounded-full text-xs sm:text-sm shadow-lg shadow-neon-cyan/25 transition-all hover:scale-105 active:scale-95"
              >
                <Wallet className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
                <span>Connect Wallet</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Portal Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-8 py-4 sm:py-10 w-full flex-1 flex flex-col justify-center relative z-10">

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 lg:gap-14 items-center w-full">

          {/* Left Column: Workshop Hero & Highlights (Balances desktop layout & eliminates empty space) */}
          <div className="lg:col-span-6 space-y-5 text-left">


            <h1 className="font-heading text-3xl sm:text-4xl lg:text-6xl font-black text-white tracking-tight leading-[1.1]">
              Enter the <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-neon-cyan via-teal-300 to-neon-magenta">
                Web3 Genesis Portal.
              </span>
            </h1>


            {/* Feature Highlights Grid */}

          </div>

          {/* Right Column: High-Contrast, Spacious Candidate Card */}
          <div className="lg:col-span-6 w-full max-w-xl mx-auto">
            <div className="cyber-glass rounded-2xl sm:rounded-3xl p-5 sm:p-8 md:p-9 shadow-2xl relative border-2 border-cyber-border/70 space-y-5 sm:space-y-6">

              {/* Sub-Toggle: Login vs Sign Up (Fixed height, perfectly even tabs) */}
              <div className="flex items-center justify-between p-1.5 bg-slate-950/95 border-2 border-slate-800 rounded-2xl shadow-inner">
                <button
                  type="button"
                  onClick={() => {
                    setCandidateMode("login");
                    setCandidateError(null);
                    setLoginError(null);
                  }}
                  className={`flex-1 h-12 min-h-[48px] px-4 rounded-xl text-sm sm:text-base font-extrabold transition-all flex items-center justify-center space-x-2 ${
                    candidateMode === "login"
                      ? "bg-neon-cyan text-slate-950 shadow-lg shadow-neon-cyan/30 font-black"
                      : "text-slate-300 hover:text-white"
                  }`}
                >
                  <LogIn className="w-4 h-4 shrink-0" />
                  <span>Log In</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCandidateMode("signup");
                    setCandidateError(null);
                    setLoginError(null);
                  }}
                  className={`flex-1 h-12 min-h-[48px] px-4 rounded-xl text-sm sm:text-base font-extrabold transition-all flex items-center justify-center space-x-2 ${
                    candidateMode === "signup"
                      ? "bg-neon-magenta text-white shadow-lg shadow-neon-magenta/30 font-black"
                      : "text-slate-300 hover:text-white"
                  }`}
                >
                  <UserPlus className="w-4 h-4 shrink-0" />
                  <span>Sign Up</span>
                </button>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* MODE 1: CANDIDATE LOG IN */}
              {/* ------------------------------------------------------------- */}
              {candidateMode === "login" && (
                <form onSubmit={handleCandidateLogin} className="space-y-4 sm:space-y-5">
                  <div className="border-b border-slate-800 pb-2.5 text-left">
                    <h3 className="font-heading text-lg sm:text-xl font-bold text-white flex items-center space-x-2">
                      <LogIn className="w-5 h-5 text-neon-cyan shrink-0" />
                      <span>Candidate Portal Log In</span>
                    </h3>

                  </div>

                  {/* 1. Registration Number Field */}
                  <div className="text-left">
                    <label className="text-sm font-bold text-white block mb-1.5 flex items-center space-x-2">
                      <Hash className="w-4 h-4 text-neon-magenta shrink-0" />
                      <span>VJTI Registration Number *</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 241080001"
                      value={loginRegNo}
                      onChange={(e) => setLoginRegNo(e.target.value)}
                      className="w-full bg-slate-950/90 border-2 border-slate-700 focus:border-neon-magenta focus:ring-2 focus:ring-neon-magenta/25 rounded-xl p-3 sm:p-4 text-base sm:text-lg text-white font-mono font-bold placeholder:text-slate-400 transition-all shadow-inner"
                    />
                  </div>

                  {/* 2. Connected MetaMask Wallet Display / Input */}
                  <div className="text-left">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-bold text-white flex items-center space-x-1.5">
                        <Wallet className="w-4 h-4 text-neon-cyan shrink-0" />
                        <span>Registered Wallet *</span>
                      </span>
                      <button
                        type="button"
                        onClick={handleAutofillWallet}
                        className="px-2.5 py-1 rounded-lg bg-cyan-950/80 border border-cyan-500/50 text-cyan-300 hover:bg-cyan-900 text-xs font-bold transition-colors flex items-center space-x-1"
                      >
                        <Zap className="w-3 h-3 text-neon-cyan" />
                        <span>{account ? "Autofill Connected" : "Connect Wallet"}</span>
                      </button>
                    </div>

                    <input
                      type="text"
                      required
                      placeholder="e.g. 0x2b30...d365"
                      value={loginWalletAddress || account || ""}
                      onChange={(e) => setLoginWalletAddress(e.target.value)}
                      className="w-full bg-slate-950/90 border-2 border-slate-700 focus:border-neon-cyan focus:ring-2 focus:ring-neon-cyan/25 rounded-xl p-3 sm:p-4 text-xs sm:text-sm md:text-base font-mono font-bold text-white placeholder:text-slate-400 transition-all shadow-inner"
                    />
                  </div>

                  {/* Login Error Notification */}
                  {loginError && (
                    <div className="p-3.5 sm:p-4 rounded-xl bg-rose-950/60 border border-rose-500/50 space-y-2 text-xs sm:text-sm text-rose-200 text-left">
                      <div className="flex items-start space-x-2">
                        <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                        <span className="font-medium">{loginError}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCandidateMode("signup")}
                        className="text-left text-neon-cyan font-bold hover:underline pl-7 text-xs sm:text-sm block"
                      >
                        Click here to switch to Sign Up & Register your profile →
                      </button>
                    </div>
                  )}

                  {/* Primary Login Submit Action Button */}
                  <button
                    type="submit"
                    disabled={isLoginSubmitting}
                    className="w-full h-13 min-h-[50px] bg-gradient-to-r from-neon-cyan via-teal-400 to-indigo-600 hover:opacity-95 text-slate-950 font-black py-3.5 px-6 rounded-xl text-base sm:text-lg shadow-xl shadow-neon-cyan/25 flex items-center justify-center space-x-2.5 transition-all hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50"
                  >
                    {isLoginSubmitting ? (
                      <>
                        <Cpu className="w-5 h-5 animate-spin" />
                        <span>Verifying Registration & Wallet...</span>
                      </>
                    ) : (
                      <>
                        <LogIn className="w-5 h-5" />
                        <span>Log In & Enter Hub</span>
                        <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* ------------------------------------------------------------- */}
              {/* MODE 2: CANDIDATE SIGN UP */}
              {/* ------------------------------------------------------------- */}
              {candidateMode === "signup" && (
                <form onSubmit={handleCandidateSignup} className="space-y-4 sm:space-y-5">


                  {/* Full Name */}
                  <div className="text-left">
                    <label className="text-sm font-bold text-white block mb-1.5 flex items-center space-x-2">
                      <User className="w-4 h-4 text-neon-cyan shrink-0" />
                      <span>Full Candidate Name *</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Siddharth Sharma"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-slate-950/90 border-2 border-slate-700 focus:border-neon-cyan focus:ring-2 focus:ring-neon-cyan/25 rounded-xl p-3 sm:p-4 text-base sm:text-lg text-white font-medium placeholder:text-slate-400 transition-all shadow-inner"
                    />
                  </div>

                  {/* Registration Number */}
                  <div className="text-left">
                    <label className="text-sm font-bold text-white block mb-1.5 flex items-center space-x-2">
                      <Hash className="w-4 h-4 text-neon-magenta shrink-0" />
                      <span>VJTI Registration Number *</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 241080001"
                      value={regNo}
                      onChange={(e) => setRegNo(e.target.value)}
                      className="w-full bg-slate-950/90 border-2 border-slate-700 focus:border-neon-magenta focus:ring-2 focus:ring-neon-magenta/25 rounded-xl p-3 sm:p-4 text-base sm:text-lg text-white font-mono font-bold placeholder:text-slate-400 transition-all shadow-inner"
                    />
                  </div>

                  {/* Branch Selection */}
                  <div className="text-left">
                    <label className="text-sm font-bold text-white block mb-1.5 flex items-center space-x-2">
                      <BookOpen className="w-4 h-4 text-eth-purple shrink-0" />
                      <span>Branch / Department *</span>
                    </label>
                    <select
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      className="w-full bg-slate-950/90 border-2 border-slate-700 focus:border-eth-purple focus:ring-2 focus:ring-eth-purple/25 rounded-xl p-3 sm:p-4 text-base sm:text-lg text-white font-medium transition-all shadow-inner"
                    >
                      <option value="Computer Engineering" className="bg-slate-950 text-white">Computer Engineering</option>
                      <option value="Information Technology" className="bg-slate-950 text-white">Information Technology</option>
                      <option value="Electronics & Telecom" className="bg-slate-950 text-white">Electronics & Telecom</option>
                      <option value="Electrical Engineering" className="bg-slate-950 text-white">Electrical Engineering</option>
                      <option value="Mechanical Engineering" className="bg-slate-950 text-white">Mechanical Engineering</option>
                      <option value="Civil Engineering" className="bg-slate-950 text-white">Civil Engineering</option>
                      <option value="Production Engineering" className="bg-slate-950 text-white">Production Engineering</option>
                      <option value="Textile Engineering" className="bg-slate-950 text-white">Textile Engineering</option>
                    </select>
                  </div>

                  {/* Linked Wallet Info Box */}
                  <div className="p-3.5 sm:p-4 rounded-xl bg-slate-950/95 border-2 border-slate-800 space-y-2 text-left">
                    <div className="flex items-center justify-between text-xs sm:text-sm">
                      <span className="text-slate-300 font-bold flex items-center space-x-1.5">
                        <Wallet className="w-4 h-4 text-neon-cyan shrink-0" />
                        <span>Linked Wallet:</span>
                      </span>
                      {account ? (
                        <span className="font-mono text-neon-green font-bold flex items-center space-x-1">
                          <CheckCircle2 className="w-4 h-4" />
                          <span>{shortenAddress(account)}</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={connect}
                          className="px-3 py-1 rounded-lg bg-neon-cyan/20 border border-neon-cyan/40 text-neon-cyan hover:bg-neon-cyan/30 font-bold transition-all text-xs"
                        >
                          Connect MetaMask
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Candidate Error Notification */}
                  {candidateError && (
                    <div className="p-3.5 sm:p-4 rounded-xl bg-rose-950/60 border border-rose-500/50 flex items-start space-x-2 text-xs sm:text-sm text-rose-200 text-left">
                      <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                      <span className="font-medium">{candidateError}</span>
                    </div>
                  )}

                  {/* Submit Registration Button */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full h-13 min-h-[50px] bg-gradient-to-r from-neon-magenta via-purple-600 to-neon-cyan hover:opacity-95 text-white font-black py-3.5 px-6 rounded-xl text-base sm:text-lg shadow-xl shadow-neon-magenta/25 flex items-center justify-center space-x-2.5 transition-all hover:scale-[1.01] active:scale-[0.98] disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Cpu className="w-5 h-5 animate-spin" />
                        <span>Registering Candidate Profile...</span>
                      </>
                    ) : (
                      <>
                        <span>Register & Enter Hub</span>
                        <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </form>
              )}

            </div>
          </div>

        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-cyber-border/40 bg-cyber-void/90 py-2 sm:py-2 relative z-10">
        <div className="max-w-7xl mx-auto px-4 text-center text-xs sm:text-sm text-slate-400 flex flex-col sm:flex-row items-center justify-center gap-2">
          <p className="font-medium">© 2026 ETH VJTI • Web3 Genesis Workshop</p>
        </div>
      </footer>

    </div>
  );
}
