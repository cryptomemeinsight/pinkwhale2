
import { Connection, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';

const CREATOR_WALLET = "3K2bFxQp5s7FgmXHbFvzgunLRzDnUL7vTVbwQAAWX3yr";
const SOURCE_FEE_WALLET = "62qc2CNXwrYqQScmEdiZFFAnJR262PxWEuNQtxfafNgV";

// Use the Helius RPC from App.tsx or a standard one
const connection = new Connection("https://mainnet.helius-rpc.com/?api-key=9d093275-24c0-47b4-82f3-5c19c543e539");

async function debugFees() {
    console.log(`Analyzing transactions for ${CREATOR_WALLET}...`);
    console.log(`Looking for transfers from ${SOURCE_FEE_WALLET}`);

    try {
        const signatures = await connection.getSignaturesForAddress(new PublicKey(CREATOR_WALLET), { limit: 100 });
        console.log(`Fetched ${signatures.length} signatures.`);

        const sigs = signatures.map(s => s.signature);
        
        let foundCount = 0;
        let totalVolume = 0;

        console.log(`Processing ${sigs.length} transactions sequentially...`);

        for (let i = 0; i < sigs.length; i++) {
            const signature = sigs[i];
            // console.log(`[${i+1}/${sigs.length}] Fetching ${signature}...`);
            
            try {
                // Fetch SINGLE transaction
                const tx = await connection.getParsedTransaction(signature, { maxSupportedTransactionVersion: 0 });
                
                if (!tx) continue;

                // Check if SOURCE_FEE_WALLET is involved in the transaction at all
                const accountKeys = tx.transaction.message.accountKeys.map(k => k.pubkey.toString());
                if (accountKeys.includes(SOURCE_FEE_WALLET)) {
                    console.log(`[${signature}] SOURCE WALLET FOUND IN ACCOUNTS!`);
                    
                    // Inspect instructions more closely
                    const allInstructions = [
                        ...tx.transaction.message.instructions,
                        ...(tx.meta?.innerInstructions?.flatMap(i => i.instructions) || [])
                    ];
                    
                    for (const ix of allInstructions) {
                         if ('parsed' in ix && ix.program === 'system' && ix.parsed.type === 'transfer') {
                             const { source, destination, lamports } = ix.parsed.info;
                             console.log(`   -> Transfer: ${lamports/LAMPORTS_PER_SOL} SOL from ${source} to ${destination}`);
                         }
                    }
                }

                // Check instructions for direct match (previous logic)
                const allInstructions = [
                    ...tx.transaction.message.instructions,
                    ...(tx.meta?.innerInstructions?.flatMap(i => i.instructions) || [])
                ];

                for (const ix of allInstructions) {
                    // Check parsed system transfers
                    if ('parsed' in ix && ix.program === 'system' && ix.parsed.type === 'transfer') {
                        const { source, destination, lamports } = ix.parsed.info;
                        
                        if (destination === CREATOR_WALLET) {
                            const amount = lamports / LAMPORTS_PER_SOL;
                            console.log(`[${signature}] Received ${amount} SOL from ${source}`);
                            
                            if (source === SOURCE_FEE_WALLET) {
                                console.log(`  >>> MATCH FOUND! <<<`);
                                foundCount++;
                                totalVolume += amount;
                            }
                        }
                    }
                }
                
                // Delay to be nice
                await new Promise(resolve => setTimeout(resolve, 100));

            } catch (e) {
                console.error(`Error fetching ${signature}:`, e);
            }
        }

        console.log("------------------------------------------------");
        console.log(`Total Matches Found: ${foundCount}`);
        console.log(`Total Volume from Source: ${totalVolume} SOL`);

    } catch (e) {
        console.error("Error:", e);
    }
}

debugFees();
