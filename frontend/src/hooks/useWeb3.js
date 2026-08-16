import { useState, useEffect, useCallback } from "react";
import { BrowserProvider, JsonRpcProvider, Contract, Interface, formatEther } from "ethers";
import { CONTRACT_ADDRESS, NETWORK_CONFIG, VJTITIEREDBADGE_ABI } from "../config/network";

const contractInterface = new Interface(VJTITIEREDBADGE_ABI);

/**
 * Checks if MetaMask or injected Web3 extension is available
 */
export const isMetaMaskInstalled = () => {
  return typeof window !== "undefined" && Boolean(window.ethereum);
};

/**
 * Dedicated JsonRpcProvider against Tenderly Virtual Testnet for fast cached reads
 */
export const getReadOnlyProvider = () => {
  if (NETWORK_CONFIG.rpcUrl && !NETWORK_CONFIG.rpcUrl.includes("YOUR_TENDERLY_VIRTUAL_TESTNET_ID")) {
    return new JsonRpcProvider(NETWORK_CONFIG.rpcUrl);
  }
  if (isMetaMaskInstalled()) {
    return new BrowserProvider(window.ethereum);
  }
  throw new Error("No RPC URL or Web3 provider available.");
};

/**
 * Safe eth_call reader that prevents 0x decoding errors
 */
export const safeEthCall = async (methodName, args = []) => {
  const data = contractInterface.encodeFunctionData(methodName, args);

  // 1. Try Tenderly Direct JsonRpcProvider
  try {
    const jsonProvider = getReadOnlyProvider();
    const rawResult = await jsonProvider.send("eth_call", [{ to: CONTRACT_ADDRESS, data }, "latest"]);
    if (rawResult && rawResult !== "0x") {
      return contractInterface.decodeFunctionResult(methodName, rawResult);
    }
  } catch (err) {
    console.warn(`JsonRpcProvider call for ${methodName} returned error:`, err.message);
  }

  // 2. Fallback to BrowserProvider
  if (isMetaMaskInstalled()) {
    try {
      const browserProvider = new BrowserProvider(window.ethereum);
      const rawResult = await browserProvider.send("eth_call", [{ to: CONTRACT_ADDRESS, data }, "latest"]);
      if (rawResult && rawResult !== "0x") {
        return contractInterface.decodeFunctionResult(methodName, rawResult);
      }
    } catch (err) {
      console.warn(`BrowserProvider call for ${methodName} returned error:`, err.message);
    }
  }

  throw new Error(`Contract returned 0x for ${methodName}. Check contract address and RPC network.`);
};

export function useWeb3() {
  const [account, setAccount] = useState(null);
  const [chainId, setChainId] = useState(null);
  const [balance, setBalance] = useState("0.0");
  const [isCorrectNetwork, setIsCorrectNetwork] = useState(true);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState(null);

  // Truncate address helper
  const shortenAddress = (addr) => {
    if (!addr) return "";
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  };

  // Verify connected network chain ID
  const verifyNetwork = useCallback(async () => {
    if (!isMetaMaskInstalled()) return false;
    try {
      const currentChainIdHex = await window.ethereum.request({ method: "eth_chainId" });
      setChainId(currentChainIdHex);
      const isMatch = currentChainIdHex.toLowerCase() === NETWORK_CONFIG.chainIdHex.toLowerCase();
      setIsCorrectNetwork(isMatch);
      return isMatch;
    } catch (err) {
      console.error("Error verifying network:", err);
      setIsCorrectNetwork(false);
      return false;
    }
  }, []);

  // Fetch ETH balance for connected address
  const fetchBalance = useCallback(async (userAddress = account) => {
    if (!userAddress) return "0.0";
    try {
      const provider = getReadOnlyProvider();
      const rawBalance = await provider.getBalance(userAddress);
      const formatted = parseFloat(formatEther(rawBalance)).toFixed(4);
      setBalance(formatted);
      return formatted;
    } catch (err) {
      console.warn("Could not fetch wallet balance:", err.message);
      return "0.0";
    }
  }, [account]);

  // Connect Wallet
  const connect = async () => {
    if (!isMetaMaskInstalled()) {
      const errMsg = "MetaMask extension not found in browser. Please install MetaMask to continue.";
      setError(errMsg);
      throw new Error(errMsg);
    }
    setIsConnecting(true);
    setError(null);
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts found in wallet.");
      }
      const activeAccount = accounts[0];
      setAccount(activeAccount);
      await verifyNetwork();
      await fetchBalance(activeAccount);
      return activeAccount;
    } catch (err) {
      console.error("Wallet connection failed:", err);
      setError(err.message || "Failed to connect wallet.");
      throw err;
    } finally {
      setIsConnecting(false);
    }
  };

  // Switch or Add Custom Network (VJTI_NET)
  const switchNetwork = async () => {
    if (!isMetaMaskInstalled()) return false;
    setError(null);
    const targetChainIdHex = NETWORK_CONFIG.chainIdHex.toLowerCase();
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: targetChainIdHex }],
      });
      await verifyNetwork();
      return true;
    } catch (switchErr) {
      if (switchErr.code === 4902 || switchErr?.data?.originalError?.code === 4902) {
        try {
          await window.ethereum.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: targetChainIdHex,
                chainName: NETWORK_CONFIG.chainName,
                rpcUrls: [NETWORK_CONFIG.rpcUrl],
                nativeCurrency: NETWORK_CONFIG.nativeCurrency,
                blockExplorerUrls: [NETWORK_CONFIG.blockExplorerUrl],
              },
            ],
          });
          await verifyNetwork();
          return true;
        } catch (addErr) {
          setError(`Failed to add ${NETWORK_CONFIG.chainName}: ${addErr.message}`);
          throw addErr;
        }
      } else {
        setError(`Failed to switch network: ${switchErr.message}`);
        throw switchErr;
      }
    }
  };

  // Check if account has minted on-chain
  const checkHasMintedOnChain = async (userAddress = account) => {
    if (!userAddress) return false;
    try {
      const [hasMintedResult] = await safeEthCall("hasMinted", [userAddress]);
      return Boolean(hasMintedResult);
    } catch (err) {
      console.warn("hasMinted on-chain query returned error:", err.message);
      return false;
    }
  };

  // Mint Badge Transaction
  const mintBadgeTx = async (tier, onStatusChange) => {
    setError(null);
    try {
      // 1. Ensure Wallet Connected
      onStatusChange("Connecting Wallet...", null);
      const activeAccount = await connect();

      // 2. Ensure Correct Network
      onStatusChange("Validating Network (VJTI_NET)...", null);
      const isOk = await verifyNetwork();
      if (!isOk) {
        await switchNetwork();
      }

      // 3. Check if already minted
      const alreadyMinted = await checkHasMintedOnChain(activeAccount);
      if (alreadyMinted) {
        const msg = "Badge already minted for this wallet address!";
        onStatusChange("Failed", null, msg);
        throw new Error(msg);
      }

      // 4. Instantiate Write Provider & Contract
      const browserProvider = new BrowserProvider(window.ethereum);
      const signer = await browserProvider.getSigner();
      const contract = new Contract(CONTRACT_ADDRESS, VJTITIEREDBADGE_ABI, signer);

      // 5. Prompt Signature
      onStatusChange("Awaiting Signature...", null);
      const tx = await contract.mintBadge(tier);

      // 6. Mining on-chain
      onStatusChange("Mining on-chain...", tx.hash);
      const receipt = await tx.wait(1);

      // 7. Confirmation Success
      onStatusChange("Mint Confirmed!", tx.hash);
      await fetchBalance(activeAccount);

      return {
        success: true,
        hash: tx.hash,
        blockNumber: receipt.blockNumber,
        account: activeAccount,
      };
    } catch (err) {
      console.error("Minting transaction failed:", err);
      let friendlyMsg = err.message || "Transaction failed";
      if (err.code === "ACTION_REJECTED" || err.code === 4001) {
        friendlyMsg = "Transaction signature was cancelled by user.";
      } else if (err.message?.includes("AlreadyMinted") || err.data?.message?.includes("AlreadyMinted")) {
        friendlyMsg = "Badge already minted for this wallet!";
      } else if (err.code === "CALL_EXCEPTION" || err.code === -32603) {
        friendlyMsg = "Transaction reverted on-chain. Likely reason: Badge already claimed.";
      }
      onStatusChange("Failed", null, friendlyMsg);
      throw new Error(friendlyMsg);
    }
  };

  // Auto-detect connected accounts on load
  useEffect(() => {
    if (!isMetaMaskInstalled()) return;

    window.ethereum.request({ method: "eth_accounts" }).then((accounts) => {
      if (accounts && accounts.length > 0) {
        setAccount(accounts[0]);
        verifyNetwork();
        fetchBalance(accounts[0]);
      }
    });

    const handleAccountsChanged = (accounts) => {
      if (accounts.length > 0) {
        setAccount(accounts[0]);
        verifyNetwork();
        fetchBalance(accounts[0]);
      } else {
        setAccount(null);
        setBalance("0.0");
      }
    };

    const handleChainChanged = () => {
      verifyNetwork();
      if (account) fetchBalance(account);
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      if (window.ethereum.removeListener) {
        window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
        window.ethereum.removeListener("chainChanged", handleChainChanged);
      }
    };
  }, [verifyNetwork, fetchBalance, account]);

  return {
    account,
    chainId,
    balance,
    isCorrectNetwork,
    isConnecting,
    error,
    shortenAddress,
    connect,
    switchNetwork,
    fetchBalance,
    checkHasMintedOnChain,
    mintBadgeTx,
  };
}
