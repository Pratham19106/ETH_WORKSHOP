import React from "react";

export default function BlockchainBackgroundAccents() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0 select-none">

      {/* 1. Floating Ethereum Diamond Vector (Top Left) */}
      <div className="absolute top-[12%] left-[3%] sm:left-[7%] animate-float-1 opacity-35 hidden md:block">
        <img
          src="/eth.png"
          alt="Ethereum Vector"
          className="w-20 h-20 sm:w-26 sm:h-26 object-contain filter drop-shadow-[0_0_18px_rgba(0,240,255,0.45)] transform -rotate-12"
        />
      </div>

      {/* 2. Floating Blockchain Blocks Vector (Top Right) */}
      <div className="absolute bottom-[10%] left-[3%] sm:left-[5%] animate-float-3 opacity-35 hidden md:block">
        <img
          src="/blocks.png"
          alt="Blockchain Blocks Vector"
          className="w-36 h-36 sm:w-52 sm:h-52 md:w-64 md:h-64 object-contain filter drop-shadow-[0_0_30px_rgba(255,0,122,0.5)] transform rotate-12"
        />
      </div>

      {/* 3. Floating Security Lock Vector (Bottom Left) */}
      <div className="absolute top-[12%] right-[3%] sm:right-[6%] animate-float-2 opacity-40 hidden md:block">
        <img
          src="/locks.png"
          alt="Crypto Lock Vector"
          className="w-32 h-32 sm:w-44 sm:h-44 md:w-56 md:h-56 object-contain filter drop-shadow-[0_0_25px_rgba(98,126,234,0.5)] transform -rotate-6"
        />
      </div>
      {/* 4. Floating Small Block Vector (Bottom Right) */}
      <div className="absolute bottom-[16%] right-[5%] sm:right-[9%] animate-float-1 opacity-35 hidden md:block">
        <img
          src="/small_block.png"
          alt="Block Vector"
          className="w-14 h-14 sm:w-20 sm:h-20 object-contain filter drop-shadow-[0_0_18px_rgba(0,255,102,0.45)] transform rotate-6"
        />
      </div>

      {/* 5. Floating Secondary Ethereum Vector (Middle Right Ambient) */}
      <div className="absolute top-[48%] right-[2%] animate-float-3 opacity-20 hidden lg:block">
        <img
          src="/eth.png"
          alt="ETH Diamond Vector"
          className="w-30 h-30 sm:w-30 sm:h-16 object-contain filter drop-shadow-[0_0_15px_rgba(255,0,122,0.3)] transform rotate-45"
        />
      </div>

    </div>
  );
}
