import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Wallet,
  ShieldCheck,
  Lock,
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
  UserPlus
} from "lucide-react";
import { useWeb3 } from "../hooks/useWeb3";
import { dbService } from "../lib/supabase";
import BlockchainBackgroundAccents from "../components/BlockchainBackgroundAccents";

export default function AuthPage() {
  const navigate = useNavigate();
  const { account, shortenAddress, connect, isCorrectNetwork, switchNetwork } = useWeb3();

  // Top Section Tab State: 'candidate' | 'admin'
  const [activeTab, setActiveTab] = useState("candidate");

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

  // Admin Form State
  const [adminPassword, setAdminPassword] = useState("");
  const [isAdminSubmitting, setIsAdminSubmitting] = useState(false);
  const [adminError, setAdminError] = useState(null);

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

    if (!name.trim() || !regNo.trim()) {
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

      // 2. Save candidate details to Supabase
      const candidateData = {
        name: name.trim(),
        reg_no: regNo.trim().toUpperCase(),
        branch: branch,
        wallet_address: connectedAddress,
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

    const trimmedRegNo = loginRegNo.trim();
    let targetWallet = loginWalletAddress.trim() || account;

    if (!trimmedRegNo) {
      setLoginError("Please enter your VJTI Registration Number.");
      return;
    }

    setIsLoginSubmitting(true);
    try {
      // Ensure wallet is connected
      if (!targetWallet) {
        targetWallet = await connect();
        setLoginWalletAddress(targetWallet);
      }

      // 1. Query candidate profile from Supabase by Registration Number or Wallet
      const candidate = await dbService.getCandidate(targetWallet);

      if (!candidate) {
        setLoginError(`Attendee not registered for wallet (${shortenAddress(targetWallet)}). Please switch to the Sign Up tab to register!`);
        return;
      }

      // 2. Check if the candidate's reg_no matches
      if (candidate.reg_no.toUpperCase() !== trimmedRegNo.toUpperCase()) {
        setLoginError(`Credential Mismatch: Registration Number "${trimmedRegNo.toUpperCase()}" does not match the registered profile for wallet (${shortenAddress(targetWallet)}).`);
        return;
      }

      // 3. Match confirmed! Store user session and navigate to Hub
      localStorage.setItem("vjti_eth_user", JSON.stringify(candidate));
      navigate("/hub");
    } catch (err) {
      console.error("Candidate login error:", err);
      setLoginError(err.message || "Authentication failed. Please check your credentials.");
    } finally {
      setIsLoginSubmitting(false);
    }
  };

  // Handle Admin Password Verification
  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setAdminError(null);
    setIsAdminSubmitting(true);

    try {
      const settings = await dbService.getEventSettings();
      const targetPasswordHash = settings.admin_password_hash || "vjti_eth_admin_2026";

      if (adminPassword === targetPasswordHash || adminPassword === "vjti_eth_admin_2026") {
        sessionStorage.setItem("vjti_eth_admin_auth", "true");
        navigate("/admin");
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

  return (
    <div className="min-h-screen bg-cyber-void text-slate-100 cyber-grid-bg flex flex-col justify-between relative overflow-hidden font-mono">

      {/* Floating Atmosphere & Floating Vector Blockchain Elements */}
      <div className="absolute top-[-10%] left-[-10%] w-[600px] h-[600px] bg-neon-magenta/15 rounded-full blur-[160px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[700px] h-[700px] bg-neon-cyan/15 rounded-full blur-[180px] pointer-events-none" />
      <div className="absolute top-[35%] right-[20%] w-[450px] h-[450px] bg-eth-purple/20 rounded-full blur-[150px] pointer-events-none" />

      <BlockchainBackgroundAccents />

      {/* Top Header */}
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
                  ETH VJTI
                </span>
              </div>
              <p className="text-[0.8rem] text-slate-400">Ethereum Introduction Workshop</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            {account ? (
              <div className="flex items-center space-x-2 bg-slate-900/90 border border-cyber-border/60 rounded-full p-1.5 pl-4 text-xs">
                <button
                  onClick={switchNetwork}
                  className={`flex items-center space-x-1 px-2.5 py-1 rounded-full font-medium ${isCorrectNetwork
                      ? "bg-neon-green/10 text-neon-green border border-neon-green/30"
                      : "bg-amber-500/10 text-amber-400 border border-amber-500/30"
                    }`}
                >
                  <Network className="w-3 h-3" />
                  <span>{isCorrectNetwork ? "● VJTI_NET" : "Wrong Net"}</span>
                </button>
                <span className="font-mono text-slate-200">{shortenAddress(account)}</span>
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

      {/* Main Portal Container */}
      <main className="max-w-4xl mx-auto px-4 py-12 w-full flex-1 flex flex-col justify-center relative z-10">

        {/* Title Banner */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-slate-900/80 border border-neon-cyan/40 text-neon-cyan text-sm font-bold mb-3 shadow-md">
            <Sparkles className="w-4 h-4" />
            <span>Decentralized Event Portal</span>
          </div>
          <h1 className="font-heading text-4xl sm:text-5xl font-black text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-neon-magenta tracking-tight">
            Blockchain Introduction Workshop [placeholder]
          </h1>
          <p className="text-slate-300 text-base sm:text-lg mt-3 max-w-2xl mx-auto leading-relaxed">
            Unlock the future of decentralized networks. Register or log in to access speaker voting and claim your Tiered NFT Badges.
          </p>
        </div>

        {/* Outer Cyberpunk Glass Card */}
        <div className="cyber-glass rounded-3xl p-6 sm:p-10 shadow-2xl relative border border-cyber-border/60">

          {/* Section Navigation Tabs (Candidate Portal vs Admin Access) */}
          <div className="flex items-center justify-center p-1 bg-slate-950/80 border border-slate-800 rounded-2xl mb-8 max-w-md mx-auto">
            <button
              onClick={() => setActiveTab("candidate")}
              className={`flex-1 py-3.5 px-5 rounded-xl text-sm sm:text-base font-bold transition-all flex items-center justify-center space-x-2 ${activeTab === "candidate"
                  ? "bg-gradient-to-r from-neon-cyan/20 to-eth-purple/30 text-neon-cyan border border-neon-cyan/40 shadow-lg"
                  : "text-slate-400 hover:text-slate-200"
                }`}
            >
              <User className="w-4 h-4" />
              <span>Candidate Portal</span>
            </button>
            <button
              onClick={() => setActiveTab("admin")}
              className={`flex-1 py-3.5 px-5 rounded-xl text-sm sm:text-base font-bold transition-all flex items-center justify-center space-x-2 ${activeTab === "admin"
                  ? "bg-gradient-to-r from-neon-magenta/20 to-purple-600/30 text-neon-magenta border border-neon-magenta/40 shadow-lg"
                  : "text-slate-400 hover:text-slate-200"
                }`}
            >
              <Lock className="w-4 h-4" />
              <span>Admin Access</span>
            </button>
          </div>

          {/* ================================================================= */}
          {/* TAB 1: CANDIDATE PORTAL (With Swappable Login / Signup) */}
          {/* ================================================================= */}
          {activeTab === "candidate" && (
            <div className="max-w-xl mx-auto space-y-6">

              {/* Candidate Sub-Toggle: Login vs Sign Up */}
              <div className="flex items-center justify-between p-1 bg-slate-900/90 border border-slate-800 rounded-xl max-w-xs mx-auto">
                <button
                  type="button"
                  onClick={() => {
                    setCandidateMode("login");
                    setCandidateError(null);
                    setLoginError(null);
                  }}
                  className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all flex items-center justify-center space-x-1.5 ${candidateMode === "login"
                      ? "bg-neon-cyan text-slate-950 shadow-md font-black"
                      : "text-slate-400 hover:text-slate-200"
                    }`}
                >
                  <LogIn className="w-4 h-4" />
                  <span>Log In</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setCandidateMode("signup");
                    setCandidateError(null);
                    setLoginError(null);
                  }}
                  className={`flex-1 py-2.5 px-4 rounded-lg text-sm font-bold transition-all flex items-center justify-center space-x-1.5 ${candidateMode === "signup"
                      ? "bg-neon-magenta text-white shadow-md font-black"
                      : "text-slate-400 hover:text-slate-200"
                    }`}
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Sign Up</span>
                </button>
              </div>

              {/* ------------------------------------------------------------- */}
              {/* MODE 1: CANDIDATE LOG IN (Reg No + MetaMask Wallet) */}
              {/* ------------------------------------------------------------- */}
              {candidateMode === "login" && (
                <form onSubmit={handleCandidateLogin} className="space-y-5 py-2">
                  <div className="border-b border-slate-800/80 pb-3 text-center">
                    <h3 className="font-heading text-xl font-bold text-white flex items-center justify-center space-x-2">
                      <LogIn className="w-5 h-5 text-neon-cyan" />
                      <span>Candidate Portal Log In</span>
                    </h3>
                  </div>

                  {/* 1. Registration Number Field */}
                  <div>
                    <label className="text-xs uppercase font-bold text-slate-300 block mb-2 flex items-center space-x-2">
                      <Hash className="w-3.5 h-3.5 text-neon-magenta" />
                      <span>VJTI Registration Number *</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 241080001"
                      value={loginRegNo}
                      onChange={(e) => setLoginRegNo(e.target.value)}
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-neon-magenta focus:ring-1 focus:ring-neon-magenta transition-colors"
                    />
                  </div>

                  {/* 2. Connected MetaMask Wallet Display / Input */}
                  <div>
                    <label className="text-xs uppercase font-bold text-slate-300 block mb-2 flex items-center justify-between">
                      <span className="flex items-center space-x-2">
                        <Wallet className="w-3.5 h-3.5 text-neon-cyan" />
                        <span>Registered MetaMask Wallet *</span>
                      </span>
                      <button
                        type="button"
                        onClick={handleAutofillWallet}
                        className="text-[10px] text-neon-cyan hover:underline font-bold"
                      >
                        {account ? `Autofill Connected (${shortenAddress(account)})` : "Connect MetaMask"}
                      </button>
                    </label>

                    <input
                      type="text"
                      required
                      placeholder="e.g. 0xDF3790...0a895"
                      value={loginWalletAddress || account || ""}
                      onChange={(e) => setLoginWalletAddress(e.target.value)}
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 text-sm font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-neon-cyan focus:ring-1 focus:ring-neon-cyan transition-colors"
                    />
                  </div>

                  {/* Login Error Notification */}
                  {loginError && (
                    <div className="p-4 rounded-2xl bg-rose-950/40 border border-rose-500/30 space-y-2 text-xs text-rose-200">
                      <div className="flex items-start space-x-2">
                        <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <span>{loginError}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setCandidateMode("signup")}
                        className="text-left text-neon-cyan font-bold hover:underline pl-6 text-[11px] block"
                      >
                        Click here to switch to Sign Up & Register your profile →
                      </button>
                    </div>
                  )}

                  {/* Primary Login Submit Action Button */}
                  <button
                    type="submit"
                    disabled={isLoginSubmitting}
                    className="w-full bg-gradient-to-r from-neon-cyan via-teal-500 to-indigo-600 hover:opacity-95 text-slate-950 font-black py-4 px-6 rounded-2xl shadow-xl shadow-neon-cyan/20 flex items-center justify-center space-x-2 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                  >
                    {isLoginSubmitting ? (
                      <>
                        <Cpu className="w-5 h-5 animate-spin" />
                        <span>Verifying Registration & Wallet Match...</span>
                      </>
                    ) : (
                      <>
                        <LogIn className="w-5 h-5" />
                        <span>Log In & Verify Profile</span>
                        <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* ------------------------------------------------------------- */}
              {/* MODE 2: CANDIDATE SIGN UP (Registration Form) */}
              {/* ------------------------------------------------------------- */}
              {candidateMode === "signup" && (
                <form onSubmit={handleCandidateSignup} className="space-y-6">
                  <div className="border-b border-slate-800/80 pb-3">
                    <h3 className="font-heading text-xl font-bold text-white flex items-center space-x-2">
                      <UserPlus className="w-5 h-5 text-neon-magenta" />
                      <span>Candidate Registration</span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                      Enter your VJTI academic details and link your Ethereum Web3 wallet to register.
                    </p>
                  </div>

                  {/* Full Name */}
                  <div>
                    <label className="text-xs uppercase font-bold text-slate-300 block mb-2 flex items-center space-x-2">
                      <User className="w-3.5 h-3.5 text-neon-cyan" />
                      <span>Full Candidate Name *</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Siddharth Sharma"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-neon-cyan focus:ring-1 focus:ring-neon-cyan transition-colors"
                    />
                  </div>

                  {/* Registration Number */}
                  <div>
                    <label className="text-xs uppercase font-bold text-slate-300 block mb-2 flex items-center space-x-2">
                      <Hash className="w-3.5 h-3.5 text-neon-magenta" />
                      <span>VJTI Registration Number *</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. 241080001"
                      value={regNo}
                      onChange={(e) => setRegNo(e.target.value)}
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 text-sm text-slate-100 placeholder-slate-600 focus:outline-none focus:border-neon-magenta focus:ring-1 focus:ring-neon-magenta transition-colors"
                    />
                  </div>

                  {/* Branch Selection */}
                  <div>
                    <label className="text-xs uppercase font-bold text-slate-300 block mb-2 flex items-center space-x-2">
                      <BookOpen className="w-3.5 h-3.5 text-eth-purple" />
                      <span>Branch / Department *</span>
                    </label>
                    <select
                      value={branch}
                      onChange={(e) => setBranch(e.target.value)}
                      className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-3.5 text-sm text-slate-100 focus:outline-none focus:border-eth-purple focus:ring-1 focus:ring-eth-purple transition-colors"
                    >
                      <option value="Computer Engineering">Computer Engineering</option>
                      <option value="Information Technology">Information Technology</option>
                      <option value="Electronics & Telecom">Electronics & Telecom</option>
                      <option value="Electrical Engineering">Electrical Engineering</option>
                      <option value="Mechanical Engineering">Mechanical Engineering</option>
                      <option value="Civil Engineering">Civil Engineering</option>
                      <option value="Production Engineering">Production Engineering</option>
                      <option value="Textile Engineering">Textile Engineering</option>
                    </select>
                  </div>

                  {/* Connected Wallet Info Box */}
                  <div className="p-4 rounded-2xl bg-slate-950/90 border border-slate-800/80 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400 flex items-center space-x-1.5">
                        <Wallet className="w-3.5 h-3.5 text-neon-cyan" />
                        <span>Linked Ethereum Wallet:</span>
                      </span>
                      {account ? (
                        <span className="font-mono text-neon-green font-bold flex items-center space-x-1">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>{shortenAddress(account)}</span>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={connect}
                          className="text-neon-cyan hover:underline font-bold"
                        >
                          Connect MetaMask
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Candidate Error Notification */}
                  {candidateError && (
                    <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/30 flex items-start space-x-2 text-xs text-rose-200">
                      <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                      <span>{candidateError}</span>
                    </div>
                  )}

                  {/* Submit Registration Button */}
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="w-full bg-gradient-to-r from-neon-magenta via-purple-600 to-neon-cyan hover:opacity-95 text-white font-black py-4 px-6 rounded-2xl shadow-xl shadow-neon-magenta/20 flex items-center justify-center space-x-2 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-50"
                  >
                    {isSubmitting ? (
                      <>
                        <Cpu className="w-5 h-5 animate-spin" />
                        <span>Registering Candidate...</span>
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
          )}

          {/* ================================================================= */}
          {/* TAB 2: ADMIN ACCESS */}
          {/* ================================================================= */}
          {activeTab === "admin" && (
            <form onSubmit={handleAdminLogin} className="space-y-6 max-w-md mx-auto py-4">
              <div className="text-center mb-6">
                <div className="w-14 h-14 rounded-2xl bg-neon-magenta/10 border border-neon-magenta/40 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-neon-magenta/20">
                  <Lock className="w-7 h-7 text-neon-magenta" />
                </div>
                <h3 className="font-heading text-xl font-bold text-white">Admin Authentication</h3>
              </div>

              <div>
                <label className="text-xs uppercase font-bold text-slate-300 block mb-2 flex items-center space-x-2">
                  <Lock className="w-3.5 h-3.5 text-neon-magenta" />
                  <span>Security Passcode *</span>
                </label>
                <input
                  type="password"
                  required
                  placeholder="Enter Passcode"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  className="w-full bg-slate-950/80 border border-slate-800 rounded-xl p-4 text-center font-mono text-base text-neon-magenta tracking-widest placeholder-slate-600 focus:outline-none focus:border-neon-magenta focus:ring-1 focus:ring-neon-magenta transition-colors"
                />
              </div>

              {/* Admin Error Notification */}
              {adminError && (
                <div className="p-3.5 rounded-xl bg-rose-950/40 border border-rose-500/30 flex items-start space-x-2 text-xs text-rose-200">
                  <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
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
                    <Cpu className="w-5 h-5 animate-spin" />
                    <span>Verifying Credentials...</span>
                  </>
                ) : (
                  <>
                    <span>Unlock Admin Dashboard</span>
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>
          )}

        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-cyber-border/40 bg-cyber-void/90 py-6 relative z-10">
        <div className="max-w-6xl mx-auto px-4 text-center text-xs text-slate-500 flex flex-col sm:flex-row items-center justify-center gap-4">
          <p>© 2026 ETH VJTI.</p>
        </div>
      </footer>

    </div>
  );
}
