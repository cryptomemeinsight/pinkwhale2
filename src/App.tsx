import { useState, useEffect } from 'react';
import Lenis from 'lenis';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import { Copy, Check, Search, Flame, Coins, Infinity, AlertTriangle, ExternalLink, Zap, Repeat } from 'lucide-react';

// Constants
const TOKEN_MINT_ADDRESS = "BgLBeZz9SnHgLVHobQWsgdrjTSnW2mbtqJfMokEvpump"; 
const CREATOR_WALLET_ADDRESS = "3K2bFxQp5s7FgmXHbFvzgunLRzDnUL7vTVbwQAAWX3yr";
const BITQUERY_ENDPOINT = "https://asia.streaming.bitquery.io/graphql";
const ELIGIBLE_PERCENTAGE = 0.5;
const INITIAL_SUPPLY = 1_000_000_000; // 1 Billion

function App() {
  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();
  const [manualAddress, setManualAddress] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [checking, setChecking] = useState(false);
  const [hasChecked, setHasChecked] = useState(false);
  const [copied, setCopied] = useState(false);
  // Removed tokensBoughtBack state
  const [totalCreatorFees, setTotalCreatorFees] = useState<number>(0); 
  const [loadingStats, setLoadingStats] = useState<boolean>(true);
  const [recentTxs, setRecentTxs] = useState<Array<{signature: string; time: number; amount: number; direction: 'IN' | 'OUT'; counterparty?: string}>>([]);
  const [loadingTxs, setLoadingTxs] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [reloadKey, setReloadKey] = useState<number>(0);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [rotation, setRotation] = useState({ x: 0, y: 0 });
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isHovered) setIsHovered(true);
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    // Calculate percentage from center (-1 to 1)
    const xPct = (x / rect.width - 0.5) * 2;
    const yPct = (y / rect.height - 0.5) * 2;

    // Calculate rotation (max 15 degrees) to "look at" the cursor
    // rotateX: negative brings top forward (when mouse is at top)
    // rotateY: negative brings left forward (when mouse is at left)
    const rotateX = yPct * 15;
    const rotateY = xPct * 15;

    setRotation({ x: rotateX, y: rotateY });
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    setRotation({ x: 0, y: 0 });
  };

  // Initialize Lenis Smooth Scroll
  useEffect(() => {
    const lenis = new Lenis({
      duration: 1.2,
      easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)), // https://www.desmos.com/calculator/brs54l4xou
      orientation: 'vertical',
      gestureOrientation: 'vertical',
      smoothWheel: true,
      wheelMultiplier: 1,
      touchMultiplier: 2,
    });

    function raf(time: number) {
      lenis.raf(time);
      requestAnimationFrame(raf);
    }

    requestAnimationFrame(raf);

    return () => {
      lenis.destroy();
    };
  }, []);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const creatorPubKey = new PublicKey(CREATOR_WALLET_ADDRESS);
        const signatures = await connection.getSignaturesForAddress(creatorPubKey, { limit: 1000 });
        let totalIncomingLamports = 0;
        setTotalCreatorFees(0);
        for (const sig of signatures) {
          try {
            const tx = await connection.getParsedTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
            if (!tx || !tx.meta) continue;
            const allInstructions = [
              ...tx.transaction.message.instructions,
              ...(tx.meta.innerInstructions?.flatMap((i: any) => i.instructions) || [])
            ];
            for (const ix of allInstructions) {
              if ('parsed' in ix && ix.program === 'system' && ix.parsed.type === 'transfer') {
                const { destination, lamports } = ix.parsed.info;
                if (destination === CREATOR_WALLET_ADDRESS) {
                  totalIncomingLamports += lamports;
                  setTotalCreatorFees((prev) => prev + lamports / LAMPORTS_PER_SOL);
                }
              }
            }
            await new Promise((r) => setTimeout(r, 20));
          } catch {}
        }
        setLastUpdated(Date.now());
      } catch {
        setTotalCreatorFees(0);
      } finally {
        setLoadingStats(false);
      }
    };
    fetchStats();
  }, [connection, reloadKey]);

  useEffect(() => {
    const run = async () => {
      try {
        const creatorPubKey = new PublicKey(CREATOR_WALLET_ADDRESS);
        const signatures = await connection.getSignaturesForAddress(creatorPubKey, { limit: 25 });
        const items: Array<{signature: string; time: number; amount: number; direction: 'IN' | 'OUT'; counterparty?: string}> = [];
        for (const sig of signatures) {
          try {
            const tx = await connection.getParsedTransaction(sig.signature, { maxSupportedTransactionVersion: 0 });
            if (!tx || !tx.meta) continue;
            const allInstructions = [
              ...tx.transaction.message.instructions,
              ...(tx.meta.innerInstructions?.flatMap(i => i.instructions) || [])
            ];
            for (const ix of allInstructions) {
              if ('parsed' in ix && ix.program === 'system' && ix.parsed.type === 'transfer') {
                const { source, destination, lamports } = ix.parsed.info as { source: string; destination: string; lamports: number };
                if (source === CREATOR_WALLET_ADDRESS) {
                  items.push({
                    signature: sig.signature,
                    time: tx.blockTime || 0,
                    amount: lamports / LAMPORTS_PER_SOL,
                    direction: 'OUT',
                    counterparty: destination
                  });
                }
              }
            }
            await new Promise(r => setTimeout(r, 20));
          } catch {}
        }
        setRecentTxs(items);
      } catch {
        setRecentTxs([]);
      } finally {
        setLoadingTxs(false);
      }
    };
    run();
  }, [connection]);


  const copyToClipboard = () => {
    navigator.clipboard.writeText(TOKEN_MINT_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const checkEligibility = async (addressOverride?: string) => {
    const targetAddress = addressOverride || (publicKey ? publicKey.toString() : null);
    
    if (!targetAddress) return;

    // Validate address format
    let pubKeyObj: PublicKey;
    try {
        pubKeyObj = new PublicKey(targetAddress);
    } catch (e) {
        alert("Invalid Solana address");
        return;
    }

    setChecking(true);
    setHasChecked(false);

    try {
        console.log("Checking balance for", targetAddress);
        
        const accounts = await connection.getParsedTokenAccountsByOwner(pubKeyObj, {
          mint: new PublicKey(TOKEN_MINT_ADDRESS)
        });

        let foundBalance = 0;
        if (accounts.value.length > 0) {
          accounts.value.forEach(account => {
            foundBalance += account.account.data.parsed.info.tokenAmount.uiAmount || 0;
          });
        }
        
        setBalance(foundBalance);
        setHasChecked(true);

    } catch (error) {
        console.error("Error checking balance:", error);
        setBalance(0); 
        setHasChecked(true);
    } finally {
        setChecking(false);
    }
  };

  const isEligible = balance !== null && (balance / INITIAL_SUPPLY) * 100 >= ELIGIBLE_PERCENTAGE;

  return (
    <div className="min-h-screen flex flex-col items-center overflow-x-hidden">
      
      {/* Dynamic Background */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden z-0">
        <div className="absolute top-[-20%] left-[20%] w-[600px] h-[600px] bg-pinkwhale-pink/10 blur-[150px] rounded-full animate-pulse-fast" />
        <div className="absolute bottom-[-20%] right-[10%] w-[500px] h-[500px] bg-pinkwhale-cyan/10 blur-[150px] rounded-full" />
        <div className="absolute top-[40%] left-[-10%] w-[300px] h-[300px] bg-purple-900/20 blur-[100px] rounded-full" />
      </div>

      <div className="relative z-10 w-full max-w-6xl px-8 md:px-12 py-8 flex flex-col items-center">
        
        {/* Navbar / Top Bar */}
        <nav className="w-full flex justify-between items-center mb-16 animate-in fade-in slide-in-from-top-4 duration-700">
            <div className="text-2xl font-display font-black tracking-tighter text-white">
                PINK<span className="text-pinkwhale-pink">WHALE</span>
            </div>
            <div className="flex gap-4">
                <a href="https://x.com/PINKWHALECOIN" target="_blank" className="p-2 bg-white/5 rounded-full hover:bg-pinkwhale-pink/20 transition-colors text-gray-400 hover:text-white"><ExternalLink size={20} /></a>
            </div>
        </nav>

        {/* Hero Section */}
        <header className="text-center mb-16 relative w-full">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[120%] h-[120%] bg-gradient-to-r from-pinkwhale-pink/5 via-transparent to-pinkwhale-cyan/5 blur-3xl -z-10 rounded-full" />
          
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-white/5 border border-white/10 backdrop-blur-sm mb-6 animate-in fade-in zoom-in duration-500">
             <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
             <span className="text-xs font-mono text-gray-300 tracking-wider">LIVE ON SOLANA MAINNET</span>
          </div>

          <div 
            className="mb-0 animate-in fade-in zoom-in duration-700 delay-100 perspective-1000"
            onMouseMove={handleMouseMove}
            onMouseLeave={handleMouseLeave}
          >
              <img 
                src="/main_img2.gif" 
                alt="Pink Whale" 
                className="w-72 md:w-[500px] mx-auto object-contain drop-shadow-[0_0_30px_rgba(255,0,170,0.4)] transition-transform duration-100 ease-out" 
                style={{ 
                  transformStyle: 'preserve-3d',
                  transform: `rotateX(${rotation.x}deg) rotateY(${rotation.y}deg) scale3d(${isHovered ? 1.1 : 1}, ${isHovered ? 1.1 : 1}, 1)`
                }}
              />
          </div>

          <h1 className="text-7xl md:text-9xl font-display font-black tracking-tighter text-white mb-2 leading-[0.9] neon-text animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
            PINK<br/><span className="text-transparent bg-clip-text bg-gradient-to-r from-pinkwhale-pink to-pinkwhale-cyan">WHALE</span>
          </h1>
          
          <p className="text-xl md:text-2xl text-gray-400 font-body font-light tracking-wide max-w-2xl mx-auto mt-6 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-200">
            Community Charity Protocol. <span className="text-pinkwhale-pink font-bold">Fees donated to cancer patients.</span>
          </p>
        </header>

        {/* Contract Address Bar */}
        <div className="w-full max-w-3xl mb-24 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-300">
            <div className="glass-panel rounded-2xl p-2 flex flex-col md:flex-row items-center gap-2 md:gap-4 relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-r from-pinkwhale-pink/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
                
                <div className="px-4 py-2 bg-black/40 rounded-xl flex-1 w-full text-center md:text-left">
                    <span className="text-xs text-gray-500 font-mono uppercase mr-2">CA:</span>
                    <code className="font-mono text-pinkwhale-pink text-sm md:text-base break-all">{TOKEN_MINT_ADDRESS}</code>
                </div>
                
                <button 
                    onClick={copyToClipboard}
                    className="w-full md:w-auto px-6 py-3 bg-white/5 hover:bg-pinkwhale-pink hover:text-white rounded-xl font-bold transition-all active:scale-95 flex items-center justify-center gap-2 group/btn"
                >
                    {copied ? <Check size={18} /> : <Copy size={18} />}
                    <span>{copied ? 'COPIED' : 'COPY'}</span>
                </button>
            </div>
            <div className="flex justify-center mt-4 gap-2 text-sm font-mono text-gray-500">
                <Flame size={14} className="text-pinkwhale-pink animate-pulse" />
                <span>
                    {loadingStats ? (
                        <span className="animate-pulse">LOADING...</span>
                    ) : (
                        `${totalCreatorFees.toLocaleString(undefined, { maximumFractionDigits: 2 })} SOL RAISED FOR DONATION`
                    )}
                </span>
            </div>
        </div>

        {/* Global Impact & Awareness Section */}
        <section className="w-full mb-24 animate-in fade-in slide-in-from-bottom-8 duration-700">
            <div className="glass-panel rounded-3xl p-8 md:p-12 relative overflow-hidden border border-white/10">
                <div className="grid md:grid-cols-2 gap-12 items-center relative z-10">
                    <div>
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-pinkwhale-pink/10 border border-pinkwhale-pink/20 mb-6">
                            <span className="w-2 h-2 rounded-full bg-pinkwhale-pink animate-pulse"></span>
                            <span className="text-[11px] font-mono text-pinkwhale-pink tracking-wider">GLOBAL IMPACT 2025</span>
                        </div>
                        <h2 className="text-3xl md:text-4xl font-display mb-6 leading-tight">
                            Breast cancer remains the <span className="text-pinkwhale-pink">most common cancer</span> in women worldwide.
                        </h2>
                        <p className="text-gray-400 leading-relaxed text-lg mb-6">
                            In 2025, over <span className="text-white font-bold">316,000 women in the U.S.</span> are estimated to receive new invasive breast cancer diagnoses, with around <span className="text-white font-bold">2.3 million new cases</span> expected globally.
                        </p>
                        <p className="text-gray-500 text-sm italic border-l-2 border-white/10 pl-4">
                            "Though exact global numbers for 2025 are projections, numbers are rising by mid-century."
                        </p>
                    </div>

                    {/* Image Slider Marquee */}
                    <div className="relative h-64 md:h-80 w-full overflow-hidden rounded-2xl bg-black/40 border border-white/5">
                        {/* Gradient Vignette Overlays */}
                        <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#0a0a1a] to-transparent z-10 pointer-events-none" />
                        <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#0a0a1a] to-transparent z-10 pointer-events-none" />
                        
                        <div className="flex gap-4 absolute top-0 left-0 h-full animate-marquee hover:[animation-play-state:paused] w-[200%]">
                            {[1, 2, 3, 4, 5, 6, 1, 2, 3, 4, 5, 6].map((num, i) => (
                                <div key={i} className="h-full flex-shrink-0 w-1/3 md:w-1/3 relative group">
                                    <img 
                                        src={`/cancer${num}.jpg`} 
                                        alt={`Cancer Awareness ${num}`} 
                                        className="w-full h-full object-cover opacity-60 group-hover:opacity-100 transition-opacity duration-500 grayscale group-hover:grayscale-0"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60" />
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>

        {/* Main Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6 w-full mb-24">
            
            {/* Left Col: Pod Checker (Span 7) */}
            <div className="md:col-span-7 animate-in fade-in slide-in-from-left-8 duration-700 delay-400">
                <div className="glass-panel rounded-3xl p-8 md:p-10 h-full border-t-4 border-t-pinkwhale-pink relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-6 opacity-5">
                        <Search size={120} />
                    </div>

                    <h2 className="text-3xl font-display mb-2">POD CHECKER</h2>
                    <p className="text-gray-400 mb-8">Verify your wallet eligibility for community status.</p>

                    <div className="space-y-6 relative z-10">
                        <div className="flex flex-col gap-4">
                             {!hasChecked ? (
                                <>
                                    <input 
                                        type="text" 
                                        placeholder="Paste Wallet Address..." 
                                        value={manualAddress}
                                        onChange={(e) => setManualAddress(e.target.value)}
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-6 py-4 text-white placeholder-gray-600 focus:outline-none focus:border-pinkwhale-pink transition-colors font-mono text-lg"
                                    />
                                    <button 
                                        onClick={() => checkEligibility(manualAddress)}
                                        disabled={checking || (!manualAddress && !connected)}
                                        className="w-full bg-gradient-to-r from-pinkwhale-pink to-pink-600 hover:brightness-110 text-white font-display text-xl py-4 rounded-xl transition-all shadow-[0_0_20px_rgba(255,0,170,0.3)] hover:shadow-[0_0_30px_rgba(255,0,170,0.5)] flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        {checking ? <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-white"></div> : <Search size={24} />}
                                        {checking ? 'SCANNING CHAIN...' : 'CHECK STATUS'}
                                    </button>
                                    
                                    <div className="relative py-2">
                                        <div className="absolute inset-0 flex items-center"><span className="w-full border-t border-white/10"></span></div>
                                        <div className="relative flex justify-center text-xs uppercase"><span className="bg-[#13132b] px-2 text-gray-500">or connect</span></div>
                                    </div>

                                    <div className="flex justify-center">
                                         <WalletMultiButton className="!bg-white/5 hover:!bg-white/10 !transition-colors !rounded-xl !h-12 !w-full !justify-center !font-display" />
                                    </div>
                                </>
                             ) : (
                                <div className="bg-black/40 rounded-2xl p-6 border border-white/10 animate-in fade-in zoom-in duration-300 text-center">
                                    {isEligible ? (
                                        <>
                                            <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <Check size={40} className="text-green-400" />
                                            </div>
                                            <h3 className="text-3xl font-display text-green-400 mb-2">YOU'RE IN THE POD!</h3>
                                            <p className="text-gray-300 font-mono text-lg">{balance?.toLocaleString()} $PINKWHALE</p>
                                        </>
                                    ) : (
                                        <>
                                            <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <AlertTriangle size={40} className="text-red-400" />
                                            </div>
                                            <h3 className="text-3xl font-display text-gray-400 mb-2">NOT ELIGIBLE</h3>
                                            <p className="text-gray-500 font-mono mb-4">{balance?.toLocaleString()} $PINKWHALE</p>
                                            <a href="https://pump.fun/coin/BgLBeZz9SnHgLVHobQWsgdrjTSnW2mbtqJfMokEvpump" target="_blank" className="text-pinkwhale-pink hover:underline text-sm uppercase font-bold">Buy More to Join &rarr;</a>
                                        </>
                                    )}
                                    <button onClick={() => setHasChecked(false)} className="mt-6 text-xs text-gray-600 hover:text-gray-400 uppercase tracking-widest">Reset</button>
                                </div>
                             )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Right Col: Stats (Span 5) */}
            <div className="md:col-span-5 flex flex-col gap-6 animate-in fade-in slide-in-from-right-8 duration-700 delay-500">
                
                {/* Donation Pool Stat */}
                <div className="relative overflow-hidden rounded-3xl flex-1 group hover:-translate-y-1 transition-transform duration-300">
                  <div className="absolute inset-0 bg-gradient-to-tr from-pinkwhale-pink/20 via-transparent to-pinkwhale-cyan/25" />
                  <div className="absolute -bottom-24 -left-24 w-96 h-96 rounded-full bg-pinkwhale-pink/10 blur-3xl" />
                  <div className="absolute -top-24 -right-24 w-96 h-96 rounded-full bg-pinkwhale-cyan/10 blur-3xl" />
                  <div className="relative glass-panel rounded-3xl p-10 border border-white/10 min-h-[340px] md:min-h-[420px]">
                    <div className="flex items-center justify-between">
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10">
                        <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                        <span className="text-[11px] font-mono text-gray-300 tracking-wider">TOTAL DONATION POOL</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="text-pinkwhale-cyan opacity-60">
                          <Flame size={22} />
                        </div>
                        <a href={`https://solscan.io/account/${CREATOR_WALLET_ADDRESS}`} target="_blank" className="px-3 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-mono text-gray-300 inline-flex items-center gap-2">
                          Wallet
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    </div>
                    <div className="mt-6">
                      {loadingStats ? (
                        <div className="h-14 w-48 bg-white/10 rounded animate-pulse" />
                      ) : (
                        <div className="text-6xl md:text-7xl font-display text-transparent bg-clip-text bg-gradient-to-r from-white via-pinkwhale-cyan to-white drop-shadow-[0_0_20px_rgba(0,255,255,0.25)]">
                          {totalCreatorFees.toLocaleString(undefined, { maximumFractionDigits: 2 })} SOL
                        </div>
                      )}
                      <div className="mt-2 text-xs text-gray-400">Raised for cancer patients</div>
                    </div>
                    <div className="mt-8 grid grid-cols-2 md:grid-cols-2 gap-3">
                      <div className="rounded-xl bg-white/5 border border-white/10 p-4">
                        <div className="text-[11px] font-mono text-gray-400 mb-1">Last Updated</div>
                        <div className="text-xl font-display text-white">{lastUpdated ? new Date(lastUpdated).toLocaleTimeString() : '—'}</div>
                      </div>
                      <div className="rounded-xl bg-white/5 border border-white/10 p-4 flex items-center justify-between">
                        <div>
                          <div className="text-[11px] font-mono text-gray-400 mb-1">Actions</div>
                          <div className="text-xs text-gray-500">Refresh totals</div>
                        </div>
                        <button
                          onClick={() => {
                            setLoadingStats(true);
                            setReloadKey((k) => k + 1);
                          }}
                          className="px-3 py-2 rounded-xl bg-pinkwhale-pink/20 hover:bg-pinkwhale-pink/30 border border-pinkwhale-pink/40 text-xs font-mono text-white flex items-center justify-center"
                        >
                          <span className="md:hidden"><Repeat size={16} /></span>
                          <span className="hidden md:inline">Refresh</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

            </div>
        </div>

        {/* How It Works Section - Clean Grid */}
        <section className="w-full mb-24 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-600">
            <h2 className="text-center text-4xl font-display mb-12">SYSTEM MECHANICS</h2>
            
            <div className="grid md:grid-cols-3 gap-6">
                <div className="glass-panel p-8 rounded-2xl hover:bg-white/5 transition-colors">
                    <div className="w-12 h-12 bg-pinkwhale-pink/20 rounded-lg flex items-center justify-center mb-6 text-pinkwhale-pink">
                        <Zap size={24} />
                    </div>
                    <h3 className="text-xl font-display mb-3">1. CHARITY DONATIONS</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">
                        Fees collected from trading volume are donated directly to verified cancer patients and research organizations.
                    </p>
                </div>

                <div className="glass-panel p-8 rounded-2xl hover:bg-white/5 transition-colors">
                    <div className="w-12 h-12 bg-pinkwhale-cyan/20 rounded-lg flex items-center justify-center mb-6 text-pinkwhale-cyan">
                        <Infinity size={24} />
                    </div>
                    <h3 className="text-xl font-display mb-3">2. TRANSPARENT GIVING</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">
                        All donations are executed on-chain and are fully verifiable by the community.
                    </p>
                </div>

                <div className="glass-panel p-8 rounded-2xl hover:bg-white/5 transition-colors">
                    <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mb-6 text-purple-400">
                        <Coins size={24} />
                    </div>
                    <h3 className="text-xl font-display mb-3">3. COMMUNITY DRIVEN</h3>
                    <p className="text-gray-400 text-sm leading-relaxed">
                        The $PINKWHALE community unites to spread awareness and support those fighting breast cancer.
                    </p>
                </div>
            </div>
        </section>

        <section className="w-full mb-24 animate-in fade-in slide-in-from-bottom-8 duration-700">
          <h2 className="text-center text-4xl font-display mb-12 flex items-center justify-center gap-4">
            <img src="/pink_ribbon.png" alt="Pink Ribbon" className="w-12 h-12 object-contain animate-tilt" />
            Recent Donations
            <img src="/pink_ribbon.png" alt="Pink Ribbon" className="w-12 h-12 object-contain animate-tilt" />
          </h2>
          <div className="glass-panel rounded-3xl p-6 border border-white/10">
            <div className="mb-4">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search by SOL amount or wallet address..."
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none focus:border-pinkwhale-pink transition-colors font-mono text-sm"
              />
            </div>
            {loadingTxs ? (
              <div className="h-10 w-32 bg-white/10 rounded animate-pulse" />
            ) : recentTxs.length === 0 ? (
              <p className="text-center text-gray-500">No transactions found.</p>
            ) : (
              <div className="divide-y divide-white/5">
                {recentTxs
                  .filter((t) => t.amount > 0.10)
                  .filter((t) => {
                    if (!searchQuery) return true;
                    const q = searchQuery.trim().toLowerCase();
                    const num = parseFloat(q);
                    if (!Number.isNaN(num)) {
                      const s1 = t.amount.toString();
                      const s2 = t.amount.toFixed(9);
                      return s1.includes(q) || s2.includes(q);
                    }
                    const cp = (t.counterparty || '').toLowerCase();
                    return cp.includes(q) || t.signature.toLowerCase().includes(q);
                  })
                  .map((t) => (
                  <div key={t.signature} className="py-4 border-b border-white/5 last:border-0">
                    {/* Desktop Layout */}
                    <div className="hidden md:flex items-center justify-between">
                      <div className={`px-3 py-1 rounded-full text-xs font-mono ${t.direction === 'IN' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                        {t.direction}
                      </div>
                      <div className="flex-1 px-4">
                        <div className="text-white font-display text-lg">{t.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL</div>
                        <div className="text-xs text-gray-500 font-mono">
                          {t.counterparty ? `Counterparty: ${t.counterparty}` : 'Counterparty: Unknown'}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-gray-400 font-mono">{t.time ? new Date(t.time * 1000).toLocaleString() : 'Unknown time'}</div>
                        <a href={`https://solscan.io/tx/${t.signature}`} target="_blank" className="text-pinkwhale-cyan text-xs font-mono hover:underline inline-flex items-center gap-1">
                          View
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    </div>

                    {/* Mobile Layout */}
                    <div className="md:hidden flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <div className={`px-3 py-1 rounded-full text-xs font-mono ${t.direction === 'IN' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                          {t.direction}
                        </div>
                        <div className="text-white font-display text-lg">{t.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} SOL</div>
                      </div>
                      <div className="text-xs text-gray-500 font-mono break-all">
                        {t.counterparty ? `Counterparty: ${t.counterparty}` : 'Counterparty: Unknown'}
                      </div>
                      <div className="flex items-center justify-between pt-2 border-t border-white/5 mt-1">
                        <div className="text-xs text-gray-400 font-mono">{t.time ? new Date(t.time * 1000).toLocaleString() : 'Unknown time'}</div>
                        <a href={`https://solscan.io/tx/${t.signature}`} target="_blank" className="text-pinkwhale-cyan text-xs font-mono hover:underline inline-flex items-center gap-1">
                          View
                          <ExternalLink size={12} />
                        </a>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Footer */}
        <footer className="w-full border-t border-white/5 pt-12 pb-8 flex flex-col items-center">
            <div className="flex gap-4 mb-8">
                <a href="https://dexscreener.com/solana/879fuui2qf1JqA8TqCWDBRUEsvgnjgb7EHVBvjzLy8Bd" target="_blank" className="px-6 py-2 rounded-full bg-white/5 hover:bg-pinkwhale-pink hover:text-white transition-colors font-display text-sm uppercase">DexScreener</a>
                <a href="https://pump.fun/coin/BgLBeZz9SnHgLVHobQWsgdrjTSnW2mbtqJfMokEvpump" target="_blank" className="px-6 py-2 rounded-full bg-white/5 hover:bg-green-500 hover:text-white transition-colors font-display text-sm uppercase">Pump.fun</a>
                <a href="https://t.me/pinkwhalecoin" target="_blank" className="px-6 py-2 rounded-full bg-white/5 hover:bg-blue-500 hover:text-white transition-colors font-display text-sm uppercase">Telegram</a>
            </div>
            
            <p className="text-gray-600 text-xs text-center max-w-xl leading-relaxed">
                $PINKWHALE has no intrinsic value. It is a community experiment on Solana. 
                Do not risk money you cannot afford to lose.
            </p>
            <p className="text-gray-700 text-[10px] mt-4 font-mono">© 2025 PINK WHALE PROTOCOL</p>
        </footer>

      </div>
    </div>
  )
}

export default App
