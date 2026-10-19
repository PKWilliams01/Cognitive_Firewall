import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { AlertTriangle, ShieldCheck, Activity, Lock } from 'lucide-react';
import API_BASE from '../config';

// Added revengeRisk to the props
const TradeExecutionWizard = ({ userId, onTradeSuccess, user, onClose, revengeRisk = 0 }) => {
    const [phase, setPhase] = useState('PRE_FLIGHT');
    const [instrument, setInstrument] = useState('');
    const [direction, setDirection] = useState('buy');
    const [risk, setRisk] = useState('1.0'); 
    const [checkedRules, setCheckedRules] = useState({});
    
    const [entryTime, setEntryTime] = useState(null);
    const [pnl, setPnl] = useState('');
    const [mood, setMood] = useState('Neutral');
    // Default to unchecked: a discipline tool must not pre-claim adherence
    // on the user's behalf, or it silently inflates the discipline score.
    const [followedPlan, setFollowedPlan] = useState(false);
    const [notes, setNotes] = useState('');
    
    const [loading, setLoading] = useState(false);
    const [tradesToday, setTradesToday] = useState(0); 

   useEffect(() => {
        if (!user) return;
        
        const fetchTodayTrades = async () => {
            try {
                // 1. Grab and aggressively clean the token
                const storedUser = JSON.parse(localStorage.getItem('user'));
                let token = storedUser?.token;

                if (token) {
                    token = String(token).replace(/['"]+/g, '');
                } else {
                    const rawToken = localStorage.getItem('token');
                    token = rawToken ? rawToken.replace(/['"]+/g, '') : '';
                }

                // 2. Build the clean Authorization header
                const config = {
                    headers: { Authorization: `Bearer ${token}` }
                };

                // 3. Pass the config as the second argument to axios.get!
                const res = await axios.get(`${API_BASE}/api/trades/user/${user._id}`, config);
                
                const todayStr = new Date().toDateString();
                const count = res.data.filter(t => new Date(t.entryTime || t.timestamp).toDateString() === todayStr).length;
                setTradesToday(count);
            } catch (err) {
                console.error("Failed to fetch current trades:", err.response?.data || err);
            }
        };
        
        fetchTodayTrades();
    }, [user]);

    // --- LIMIT & LOCK CALCULATIONS ---
    const MAX_TRADES = Number(user.plannedDailyLimit || 3);
    const rulesList = user.tradingPlanRules || [];
    const tradesRemaining = Math.max(0, MAX_TRADES - tradesToday);
    
    const isOverLimit = tradesRemaining <= 0;
    const isTilted = revengeRisk >= 80; // Triggers if Revenge Risk is 80% or higher
    
    // The system locks if THEY OVERTRADE -OR- THEY ARE TILTED
    const isHardLocked = isOverLimit || isTilted;

    // --- HANDLERS ---
    const handleStartTrade = () => {
        // Failsafe: Secondary backend-style check
        if (isHardLocked) return;

        if (!instrument) return alert("Please select an asset from the dropdown.");
        
        const numericRisk = Number(risk);
        if (!risk || numericRisk <= 0) return alert("Please enter a valid risk percentage.");

        // ITERATION 2 FIX: Hard cap on maximum allowable risk per trade
        if (numericRisk > 5.0) {
            return alert("🛑 FIREWALL BLOCK: Risk exceeds maximum allowable threshold (5.0%). Execution halted to protect account equity.");
        }

        const ticks = Object.values(checkedRules).filter(val => val === true).length;
        if (rulesList.length > 0 && ticks < rulesList.length) {
            const confirmRules = window.confirm(`⚠️ CONFLUENCE WARNING: You only checked ${ticks}/${rulesList.length} rules.\n\nTrading without full confluence reduces your edge. Force trade anyway?`);
            if (!confirmRules) return;
           }

        setEntryTime(new Date());
        setPhase('LIVE');
    };

    const handleCloseTrade = async () => {
    if (!pnl) return alert("Please enter the final PnL");
    
    setLoading(true);
    const numPnL = Number(pnl);
    
    const tradeData = {
        userId: user?._id,
        instrument: instrument,
        direction,
        entryTime,
        exitTime: new Date(),
        pnl: numPnL,
        result: numPnL > 0 ? 'win' : numPnL < 0 ? 'loss' : 'breakeven',
        followedPlan,
        mood,
        notes,
        riskPercentage: Number(risk) 
    };

    // 1. Grab the VIP Badge from Local Storage
    const storedUser = JSON.parse(localStorage.getItem('user'));
    let token = storedUser?.token;

    // THE FIX: Aggressively clean the token of any hidden quotation marks
    if (token) {
        token = String(token).replace(/['"]+/g, '');
    } else {
        // Fallback just in case you stored it under 'token' directly earlier
        const rawToken = localStorage.getItem('token');
        token = rawToken ? rawToken.replace(/['"]+/g, '') : '';
    }

    // 2. Create the Authorization Header with the clean token
    const config = {
        headers: { Authorization: `Bearer ${token}` }
    };

    try {
        await axios.post(`${API_BASE}/api/trades`, tradeData, config);
        
        if (onTradeSuccess) onTradeSuccess(); 
        if (onClose) onClose();              
    } catch (err) {
        console.error("Save Error:", err.response?.data || err);
        // Added better error logging so you can see exactly why it fails if it ever does again
        alert("Save failed: " + (err.response?.data?.msg || "Check database connection"));
    } finally {
        setLoading(false);
    }
};

    // --- DYNAMIC STYLES ---
    const styles = {
        overlay: { position: 'fixed', inset: 0, backgroundColor: 'rgba(9, 30, 66, 0.54)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
        card: { backgroundColor: 'var(--surface)', borderRadius: '16px', width: '100%', maxWidth: '500px', padding: '32px', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)', position: 'relative', border: '1px solid var(--border)' },
        closeX: { position: 'absolute', top: '20px', right: '24px', background: 'none', border: 'none', fontSize: '28px', cursor: 'pointer', color: 'var(--text-muted)', lineHeight: '1' },
        header: { fontSize: '20px', fontWeight: '900', color: 'var(--text-main)', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' },
        label: { display: 'block', fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '1px' },
        input: { width: '100%', backgroundColor: 'var(--background)', border: '1px solid var(--border)', borderRadius: '8px', padding: '12px 16px', fontSize: '14px', fontWeight: '600', color: 'var(--text-main)', outline: 'none', marginBottom: '20px', boxSizing: 'border-box' },
        btnPrimary: { backgroundColor: 'var(--primary)', color: 'white', padding: '14px', borderRadius: '8px', border: 'none', fontWeight: '800', cursor: 'pointer', width: '100%', letterSpacing: '1px' },
        btnDanger: { backgroundColor: 'var(--danger)', color: 'white', padding: '14px', borderRadius: '8px', border: 'none', fontWeight: '800', cursor: 'pointer', width: '100%', letterSpacing: '1px' },
        btnLocked: { backgroundColor: 'var(--background)', color: 'var(--text-muted)', border: '1px solid var(--border)', padding: '14px', borderRadius: '8px', fontWeight: '800', cursor: 'not-allowed', width: '100%', letterSpacing: '1px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' },
        checkItem: { display: 'flex', alignItems: 'center', gap: '12px', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', backgroundColor: 'var(--background)', marginBottom: '8px', cursor: 'pointer' }
    };

    return (
        <div style={styles.overlay}>
            <div style={styles.card} className="wizard-card">
                <button style={styles.closeX} onClick={onClose}>&times;</button>

                {phase === 'PRE_FLIGHT' && (
                    <>
                        <div style={styles.header}><ShieldCheck size={24} color="var(--primary)" /> Pre-Flight Protocol</div>
                        
                        <div style={{ backgroundColor: isOverLimit ? 'rgba(255, 86, 48, 0.1)' : 'var(--background)', border: `1px solid ${isOverLimit ? 'var(--danger)' : 'var(--border)'}`, borderRadius: '12px', padding: '16px', display: 'flex', justifyContent: 'space-between', marginBottom: '24px' }}>
                            <div>
                                <div style={{ fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', letterSpacing: '1px' }}>DAILY LIMIT</div>
                                <div style={{ fontSize: '18px', fontWeight: '900', color: 'var(--text-main)' }}>{MAX_TRADES}</div>
                            </div>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '11px', fontWeight: '800', color: isOverLimit ? 'var(--danger)' : 'var(--text-muted)', letterSpacing: '1px' }}>TRADES REMAINING</div>
                                <div style={{ fontSize: '18px', fontWeight: '900', color: isOverLimit ? 'var(--danger)' : 'var(--primary)' }}>{tradesRemaining}</div>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr 1fr', gap: '12px' }}>
                            <div>
                                <label style={styles.label}>Asset</label>
                                <select style={styles.input} value={instrument} onChange={e => setInstrument(e.target.value)}>
                                    <option value="" disabled style={{ color: 'black' }}>Select...</option>
                                    <optgroup label="Forex" style={{ color: 'black' }}>
                                        <option value="EUR/USD" style={{ color: 'black' }}>EUR/USD</option>
                                        <option value="GBP/USD" style={{ color: 'black' }}>GBP/USD</option>
                                        <option value="USD/JPY" style={{ color: 'black' }}>USD/JPY</option>
                                        <option value="GBP/JPY" style={{ color: 'black' }}>GBP/JPY</option>
                                    </optgroup>
                                    <optgroup label="Metals" style={{ color: 'black' }}>
                                        <option value="XAU/USD" style={{ color: 'black' }}>XAU/USD (Gold)</option>
                                        <option value="XAG/USD" style={{ color: 'black' }}>XAG/USD (Silver)</option>
                                    </optgroup>
                                    <optgroup label="Indices" style={{ color: 'black' }}>
                                        <option value="US30" style={{ color: 'black' }}>US30 (Dow Jones)</option>
                                        <option value="NAS100" style={{ color: 'black' }}>NAS100 (Nasdaq)</option>
                                    </optgroup>
                                    <optgroup label="Crypto" style={{ color: 'black' }}>
                                        <option value="BTC/USD" style={{ color: 'black' }}>BTC/USD (Bitcoin)</option>
                                        <option value="ETH/USD" style={{ color: 'black' }}>ETH/USD (Ethereum)</option>
                                    </optgroup>
                                </select>
                            </div>
                            <div>
                                <label style={styles.label}>Side</label>
                                <select style={styles.input} value={direction} onChange={e => setDirection(e.target.value)}>
                                    <option value="buy"style={{ color: 'black' }}>Long</option>
                                    <option value="sell" style={{ color: 'black' }}>Short</option>
                                </select>
                            </div>
                            <div>
                                <label style={styles.label}>Risk %</label>
                                <input style={styles.input} type="number" step="0.1" placeholder="1.0" value={risk} onChange={e => setRisk(e.target.value)} />
                            </div>
                        </div>

                        <label style={styles.label}>Verify Confluences</label>
                        <div style={{ maxHeight: '180px', overflowY: 'auto', marginBottom: '24px' }}>
                            {rulesList.length === 0 ? (
                                <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic', padding: '10px 0' }}>No strategy rules configured yet.</div>
                            ) : (
                                rulesList.map((rule, i) => (
                                    <label key={i} style={styles.checkItem}>
                                        <input type="checkbox" style={{ width: '18px', height: '18px' }} checked={!!checkedRules[i]} onChange={e => setCheckedRules({...checkedRules, [i]: e.target.checked})} />
                                        <span style={{ fontSize: '13px', fontWeight: '600', color: 'var(--text-main)' }}>{rule}</span>
                                    </label>
                                ))
                            )}
                        </div>

                        {/* ITERATION 2 FIX: The Comprehensive Hard Lock Protocol */}
                        {isHardLocked ? (
                            <button style={styles.btnLocked} disabled={true}>
                                <Lock size={18} /> 
                                {isOverLimit ? "SYSTEM LOCKED: DAILY LIMIT REACHED" : "SYSTEM LOCKED: CRITICAL REVENGE RISK"}
                            </button>
                        ) : (
                            <button style={styles.btnPrimary} onClick={handleStartTrade}>INITIALIZE EXECUTION</button>
                        )}
                    </>
                )}

                {phase === 'LIVE' && (
                    <div style={{ textAlign: 'center', padding: '40px 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                            <Activity size={48} color="var(--primary)" />
                        </div>
                        <div style={{ backgroundColor: 'rgba(54, 179, 126, 0.1)', color: 'var(--primary)', padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: '900', display: 'inline-block', marginBottom: '16px', letterSpacing: '1px' }}>
                            POSITION ACTIVE
                        </div>
                        <h2 style={{ fontSize: '42px', fontWeight: '900', color: 'var(--text-main)', margin: '0 0 8px 0', textTransform: 'uppercase' }}>{instrument}</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '14px', marginBottom: '40px', fontWeight: '500' }}>Maintain discipline. Adhere to your stop loss and take profit targets.</p>
                        <button style={styles.btnDanger} onClick={() => setPhase('POST_MORTEM')}>TERMINATE POSITION</button>
                    </div>
                )}

                {phase === 'POST_MORTEM' && (
                    <>
                        <div style={styles.header}><AlertTriangle size={24} color="var(--warning)" /> Post-Mortem Debrief</div>
                        
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.5fr', gap: '16px' }}>
                            <div>
                                <label style={styles.label}>PnL ($)</label>
                                <input style={styles.input} type="number" placeholder="-500 or 1200" value={pnl} onChange={e => setPnl(e.target.value)} autoFocus />
                            </div>
                            <div>
                                <label style={styles.label}>Primary Emotion</label>
                                <select style={styles.input} value={mood} onChange={e => setMood(e.target.value)}>
                                    <option value="Calm">Calm & Collected</option>
                                    <option value="Neutral">Neutral</option>
                                    <option value="Anxious">Anxious / Fearful</option>
                                    <option value="Greedy">Overconfident / Greedy</option>
                                    <option value="Angry">Angry / Tilted</option>
                                </select>
                            </div>
                        </div>

                        <label style={styles.label}>Reflective Notes</label>
                        <textarea 
                            style={{ ...styles.input, height: '80px', resize: 'vertical' }} 
                            placeholder="Why did you exit? Did you panic, or hit your target?" 
                            value={notes} 
                            onChange={e => setNotes(e.target.value)} 
                        />
                        
                        <label style={{ ...styles.checkItem, marginBottom: '24px' }}>
                            <input type="checkbox" checked={followedPlan} onChange={e => setFollowedPlan(e.target.checked)} />
                            <span style={{ fontSize: '14px', fontWeight: '800', color: 'var(--text-main)' }}>I strictly followed my exit rules</span>
                        </label>
                        
                        <button style={styles.btnPrimary} onClick={handleCloseTrade} disabled={loading}>
                            {loading ? 'SYNCING...' : 'FINALIZE & SYNC LEDGER'}
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default TradeExecutionWizard;