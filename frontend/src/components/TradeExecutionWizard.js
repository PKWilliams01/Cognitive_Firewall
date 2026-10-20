import React, { useState, useEffect } from 'react';
import { AlertTriangle, ShieldCheck, Activity, Lock } from 'lucide-react';
import api, { errorMessage } from '../api/client';
import { useToast } from './Toast';

// Added revengeRisk to the props
const TradeExecutionWizard = ({ userId, onTradeSuccess, user, onClose, revengeRisk = 0, firewall }) => {
    const toast = useToast();
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
                const res = await api.get(`/api/trades/user/${user._id}`);
                const todayStr = new Date().toDateString();
                const count = (res.data || []).filter(t => new Date(t.entryTime || t.timestamp).toDateString() === todayStr).length;
                setTradesToday(count);
            } catch {
                // the server re-checks limits at pre-flight anyway
            }
        };

        fetchTodayTrades();
    }, [user]);

    // --- LIMIT & LOCK CALCULATIONS ---
    const MAX_TRADES = Number(firewall?.dailyLimit || user.plannedDailyLimit || 3);
    const rulesList = user.tradingPlanRules || [];
    // Prefer the server's authoritative count; fall back to the local one.
    const tradesRemaining = firewall?.tradesRemaining ?? Math.max(0, MAX_TRADES - tradesToday);

    const isOverLimit = firewall ? firewall.lockReason === 'daily_limit' : tradesRemaining <= 0;
    const isTilted = firewall ? firewall.lockReason === 'revenge' : revengeRisk >= 80;

    // The system locks if THEY OVERTRADE -OR- THEY ARE TILTED
    const isHardLocked = firewall?.isLocked ?? (isOverLimit || isTilted);

    // --- HANDLERS ---
    const handleStartTrade = async () => {
        if (isHardLocked || loading) return;

        if (!instrument) return toast.error('Select an asset before running the pre-flight.');
        const numericRisk = Number(risk);
        if (!risk || numericRisk <= 0) return toast.error('Enter a risk percentage greater than 0.');

        const ticks = Object.values(checkedRules).filter(val => val === true).length;

        // The server is the authority: lock state, risk cap and strict-confluence mode.
        setLoading(true);
        try {
            await api.post('/api/trades/preflight', {
                instrument,
                direction,
                riskPercentage: numericRisk,
                confluencesChecked: ticks,
                confluencesTotal: rulesList.length,
            });
            if (rulesList.length > 0 && ticks < rulesList.length) {
                toast.info(`Approved with ${ticks}/${rulesList.length} confluences. Trading without full confluence reduces your edge.`);
            }
            setEntryTime(new Date());
            setPhase('LIVE');
        } catch (err) {
            const message = errorMessage(err, 'Pre-flight failed.');
            if (err?.response?.status === 423) toast.lock(message);
            else toast.error(message);
        } finally {
            setLoading(false);
        }
    };

    const handleCloseTrade = async () => {
    if (pnl === '' || !Number.isFinite(Number(pnl))) return toast.error('Enter the final P/L for this trade.');
    
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

    try {
        await api.post('/api/trades', tradeData);
        toast.success('Trade logged. Your metrics are updating.');
        if (onTradeSuccess) onTradeSuccess();
        if (onClose) onClose();
    } catch (err) {
        const message = errorMessage(err, 'Could not save the trade.');
        if (err?.response?.status === 423) toast.lock(message);
        else toast.error(message);
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