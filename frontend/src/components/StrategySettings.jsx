import React, { useState, useEffect } from 'react';
import { Plus, Trash2, Lock, LockOpen, AlertTriangle, Settings2, Hash, Activity } from 'lucide-react';
import axios from 'axios';
import PageWrapper from './PageWrapper';

export default function StrategySettings({ user, onUpdate }) {
  const [isLocked, setIsLocked] = useState(true);
  const [rules, setRules] = useState([]);
  const [dailyLimit, setDailyLimit] = useState(3);
  const [loading, setLoading] = useState(false);
  
  // Terminal State
  const [ruleName, setRuleName] = useState('');
  const [ruleValue, setRuleValue] = useState('');
  const [ruleCategory, setRuleCategory] = useState('soft'); 

  // 1. INITIALIZE DATA FROM USER PROFILE
  useEffect(() => {
    if (user) {
      setDailyLimit(user.plannedDailyLimit || 3);

      if (user.tradingPlanRules) {
        const parsed = user.tradingPlanRules.map((r, i) => {
          const isHard = r.startsWith('[HARD]');
          const cleanLabel = r.replace('[HARD] ', '');
          return { 
            id: i + Date.now(), 
            label: cleanLabel, 
            fullString: r,
            category: isHard ? 'hard' : 'soft' 
          };
        });
        setRules(parsed);
      }
    }
  }, [user]);

  // 2. ADD RULE LOGIC
  const handleAddRule = () => {
    if (!ruleName || !ruleValue) return;
    const displayLabel = `${ruleName}: ${ruleValue}`;
    const backendString = ruleCategory === 'hard' ? `[HARD] ${displayLabel}` : displayLabel;

    setRules(prev => [...prev, { 
      id: Date.now(), 
      label: displayLabel, 
      fullString: backendString, 
      category: ruleCategory 
    }]);
    
    setRuleName('');
    setRuleValue('');
  };

  const handleRemoveRule = (id) => {
    if (isLocked) return;
    setRules(prev => prev.filter(r => r.id !== id));
  };

  // 3. SAVE LOGIC
  const handleSave = async () => {
    setLoading(true);
    try {
      const ruleStrings = rules.map(r => r.fullString);
      // Attach the JWT — PUT /api/users/:id is now a protected route
      const token = JSON.parse(localStorage.getItem('user'))?.token;
      const config = { headers: { Authorization: `Bearer ${token}` } };
      const res = await axios.put(`http://localhost:5000/api/users/${user._id}`, {
        tradingPlanRules: ruleStrings,
        plannedDailyLimit: parseInt(dailyLimit)
      }, config);

      onUpdate(res.data);
      localStorage.setItem('user', JSON.stringify(res.data));
      
      setIsLocked(true);
      alert("✅ Protocols Updated: Risk Limits Enforced.");
    } catch (err) {
      console.error("Save Error:", err.response || err);
      alert(`System Sync Failed: ${err.response?.status || 'Check Connection'}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageWrapper>
      <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '20px 0' }}>
      
        {/* --- INDUSTRIAL STATUS BANNER --- */}
        <div className="card" style={{ 
          backgroundColor: isLocked ? 'var(--text-main)' : 'var(--surface)',
          color: isLocked ? 'var(--surface)' : 'var(--text-main)',
          border: isLocked ? 'none' : '2px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px'
        }}>
          <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
            <div style={{ padding: '15px', borderRadius: '12px', backgroundColor: isLocked ? 'rgba(255,255,255,0.1)' : 'var(--background)' }}>
              {isLocked ? <Lock size={24} color="var(--primary)" /> : <LockOpen size={24} color="var(--warning)" />}
            </div>
            <div>
              <div style={{ fontSize: '12px', fontWeight: '800', letterSpacing: '2px', opacity: 0.7 }}>STRATEGY STATUS</div>
              <div style={{ fontSize: '20px', fontWeight: '900' }}>{isLocked ? 'ACTIVE & ENFORCED' : 'CONFIGURATION MODE'}</div>
            </div>
          </div>
          <button 
            onClick={isLocked ? () => setIsLocked(false) : handleSave}
            className="btn"
            style={{ 
              backgroundColor: isLocked ? 'var(--primary)' : 'var(--text-main)', 
              color: 'white', 
              padding: '14px 28px', 
              fontSize: '13px', 
              letterSpacing: '1px' 
            }}
          >
            {loading ? 'SYNCING...' : isLocked ? 'UNLOCK PARAMETERS' : 'SEAL & DEPLOY'}
          </button>
        </div>

        {/* --- RISK CONFIGURATION SECTION --- */}
        <div className="card" style={{ marginBottom: '30px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: '15px', alignItems: 'center' }}>
            <div style={{ background: 'rgba(255, 86, 48, 0.1)', padding: '12px', borderRadius: '10px' }}>
              <Activity size={24} color="var(--danger)" />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '900', letterSpacing: '1px', color: 'var(--text-main)' }}>MAXIMUM DAILY TRADES</h3>
              <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: 'var(--text-muted)' }}>
                Hard stop trigger for Impulsivity Index.
              </p>
            </div>
          </div>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button 
              disabled={isLocked || dailyLimit <= 1} 
              onClick={() => setDailyLimit(prev => prev - 1)}
              style={counterBtn(isLocked)}
            >-</button>
            <div style={{ width: '40px', textAlign: 'center', fontSize: '28px', fontWeight: '900', color: 'var(--text-main)' }}>
              {dailyLimit}
            </div>
            <button 
              disabled={isLocked} 
              onClick={() => setDailyLimit(prev => parseInt(prev) + 1)}
              style={counterBtn(isLocked)}
            >+</button>
          </div>
        </div>

        {/* --- RULES GRID --- */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '30px', marginBottom: '30px' }}>
          
          {/* SYSTEM CRITICAL (HARD) RULES */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={sectionHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <AlertTriangle size={18} color="var(--danger)" />
                <span style={headerText}>SYSTEM CRITICAL (HARD)</span>
              </div>
              <div style={ruleCounter}>{rules.filter(r => r.category === 'hard').length}</div>
            </div>
            <div style={ruleScrollArea}>
              {rules.filter(r => r.category === 'hard').map(rule => (
                <div key={rule.id} style={hardRuleItem}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Hash size={14} style={{ opacity: 0.5 }} />
                    <span style={{ fontWeight: '700' }}>{rule.label}</span>
                  </div>
                  {!isLocked && <Trash2 size={16} style={{ cursor: 'pointer', opacity: 0.7 }} onClick={() => handleRemoveRule(rule.id)} />}
                </div>
              ))}
              {rules.filter(r => r.category === 'hard').length === 0 && <div style={emptyState}>NO CRITICAL CONSTRAINTS LOADED</div>}
            </div>
          </div>

          {/* OPERATIONAL (SOFT) GUIDELINES */}
          <div className="card" style={{ padding: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            <div style={sectionHeader}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Settings2 size={18} color="#0052CC" />
                <span style={headerText}>OPERATIONAL (SOFT)</span>
              </div>
              <div style={ruleCounter}>{rules.filter(r => r.category === 'soft').length}</div>
            </div>
            <div style={ruleScrollArea}>
              {rules.filter(r => r.category === 'soft').map(rule => (
                <div key={rule.id} style={softRuleItem}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ height: '6px', width: '6px', borderRadius: '50%', background: '#0052CC' }}></div>
                    <span style={{ fontWeight: '600' }}>{rule.label}</span>
                  </div>
                  {!isLocked && <Trash2 size={16} style={{ cursor: 'pointer', opacity: 0.7 }} onClick={() => handleRemoveRule(rule.id)} />}
                </div>
              ))}
              {rules.filter(r => r.category === 'soft').length === 0 && <div style={emptyState}>NO GUIDELINES LOADED</div>}
            </div>
          </div>
        </div>

        {/* --- COMMAND INPUT TERMINAL --- */}
        {!isLocked && (
          <div className="card" style={{ background: 'var(--background)', border: '2px dashed var(--border)' }}>
            <div style={{ marginBottom: '25px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <Plus size={20} color="var(--text-main)" />
              <span style={{ fontWeight: '900', fontSize: '15px', letterSpacing: '1px', color: 'var(--text-main)' }}>RULE BUILDER TERMINAL</span>
            </div>
            <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-end' }}>
              <div style={{ flex: 2 }}>
                <label style={terminalLabel}>PARAMETER NAME</label>
                <input style={terminalInput} placeholder="e.g. LIQUIDITY DRAW" value={ruleName} onChange={e => setRuleName(e.target.value)} />
              </div>
              <div style={{ flex: 2 }}>
                <label style={terminalLabel}>EXPECTED CONDITION</label>
                <input style={terminalInput} placeholder="e.g. DAILY HIGH SWEPT" value={ruleValue} onChange={e => setRuleValue(e.target.value)} />
              </div>
              <div style={{ flex: 1.2 }}>
                <label style={terminalLabel}>ENFORCEMENT LEVEL</label>
                <div style={modeToggle}>
                  <button onClick={() => setRuleCategory('soft')} style={ruleCategory === 'soft' ? activeMode('#0052CC') : inactiveMode}>SOFT</button>
                  <button onClick={() => setRuleCategory('hard')} style={ruleCategory === 'hard' ? activeMode('var(--danger)') : inactiveMode}>HARD</button>
                </div>
              </div>
              <button className="btn" style={terminalAddBtn} onClick={handleAddRule}>INITIALIZE RULE</button>
            </div>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}

// --- DYNAMIC INLINE STYLES (Using CSS Variables) ---
const counterBtn = (isLocked) => ({
  width: '45px', height: '45px', borderRadius: '8px', 
  border: `1px solid var(--border)`, 
  background: 'var(--background)', 
  cursor: isLocked ? 'not-allowed' : 'pointer', 
  fontSize: '20px', fontWeight: '700', 
  color: 'var(--text-main)',
  opacity: isLocked ? 0.5 : 1
});

const sectionHeader = { padding: '20px 25px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--background)' };
const headerText = { fontWeight: '900', fontSize: '13px', letterSpacing: '1px', color: 'var(--text-main)' };
const ruleCounter = { background: 'var(--text-main)', color: 'white', padding: '4px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: '900' };
const ruleScrollArea = { padding: '20px', minHeight: '220px', flexGrow: 1 };

const hardRuleItem = { display: 'flex', justifyContent: 'space-between', padding: '15px', background: 'rgba(255, 86, 48, 0.05)', border: '1px solid rgba(255, 86, 48, 0.2)', borderRadius: '8px', marginBottom: '10px', fontSize: '13px', color: 'var(--danger)' };
const softRuleItem = { display: 'flex', justifyContent: 'space-between', padding: '15px', background: 'rgba(0, 82, 204, 0.05)', border: '1px solid rgba(0, 82, 204, 0.2)', borderRadius: '8px', marginBottom: '10px', fontSize: '13px', color: '#0052CC' };

const emptyState = { textAlign: 'center', color: 'var(--text-muted)', fontSize: '13px', fontWeight: '600', marginTop: '80px', letterSpacing: '1px' };

const terminalLabel = { display: 'block', fontSize: '11px', fontWeight: '900', color: 'var(--text-muted)', marginBottom: '10px', letterSpacing: '1px' };
const terminalInput = { width: '100%', padding: '14px', borderRadius: '8px', border: '1px solid var(--border)', fontSize: '14px', fontWeight: '600', outline: 'none', backgroundColor: 'var(--surface)', color: 'var(--text-main)' };
const modeToggle = { display: 'flex', background: 'var(--background)', borderRadius: '8px', padding: '4px', border: '1px solid var(--border)' };
const activeMode = (color) => ({ flex: 1, border: 'none', padding: '10px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontWeight: '900', backgroundColor: color, color: '#FFF' });
const inactiveMode = { flex: 1, border: 'none', padding: '10px', background: 'transparent', cursor: 'pointer', fontSize: '12px', fontWeight: '800', color: 'var(--text-muted)' };
const terminalAddBtn = { backgroundColor: 'var(--text-main)', color: 'white', padding: '14px 25px', borderRadius: '8px', fontWeight: '900', fontSize: '13px', letterSpacing: '1px' };