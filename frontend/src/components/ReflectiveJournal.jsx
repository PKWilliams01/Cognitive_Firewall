import React, { useState } from 'react';
import { FileText, TrendingUp, TrendingDown, Calendar } from 'lucide-react';
import PageWrapper from './PageWrapper';
import api, { errorMessage } from '../api/client';
import { useToast } from './Toast';

export function ReflectiveJournal({ trades, userId, onTradeLogged }) {
  const toast = useToast();
  const [showForm, setShowForm] = useState(false);
  
  // Form State
  const [formData, setFormData] = useState({
    // Default to non-adherent: don't pre-claim the user followed their
    // plan (mirrors the Trade wizard's unchecked-by-default adherence).
    asset: '', direction: 'Long', pnl: '',
    followedPlan: 'no', emotionalState: 'Calm', notes: ''
  });

  const handleSubmit = async () => {
    try {
      const payload = {
        userId,
        instrument: formData.asset.toUpperCase(),
        direction: formData.direction,
        pnl: Number(formData.pnl),
        result: Number(formData.pnl) > 0 ? 'win' : 'loss',
        followedPlan: formData.followedPlan === 'yes',
        mood: formData.emotionalState,
        notes: formData.notes,
        entryTime: new Date(),
        exitTime: new Date(),
        riskPercentage: 1
      };

      await api.post('/api/trades', payload);
      toast.success('Trade logged to your ledger.');
      setShowForm(false);
      onTradeLogged();
    } catch (err) {
      const message = errorMessage(err, 'Could not log the trade.');
      if (err?.response?.status === 423) toast.lock(message);
      else toast.error(message);
    }
  };

  // Helper for Emotion Badge Color using CSS Variables where possible
  const getEmotionColor = (mood) => {
    const map = {
      'Calm': '#0052CC', // Deep Blue
      'Confident': 'var(--primary)', // Green
      'Anxious': 'var(--warning)', // Orange/Yellow
      'Greedy': 'var(--danger)', // Red
      'Angry': 'var(--danger)' // Red
    };
    return map[mood] || 'var(--text-muted)';
  };

  return (
    <PageWrapper>
      <div style={{ maxWidth: '1000px', margin: '0 auto', paddingBottom: '40px' }}>
        
        {/* HEADER */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
          <div>
            <h2 style={{ fontSize: '28px', fontWeight: '900', color: 'var(--text-main)', margin: 0 }}>Reflective Trading Journal</h2>
            <p style={{ color: 'var(--text-muted)', margin: '8px 0 0 0', fontSize: '14px' }}>Analyze your emotional state, plan adherence, and execution psychology.</p>
          </div>
          <button className="btn btn-primary" onClick={() => setShowForm(!showForm)}>
            <FileText size={16} /> {showForm ? 'Cancel Entry' : 'Log Manual Trade'}
          </button>
        </div>

        {/* NEW ENTRY FORM (Toggleable) */}
        {showForm && (
          <div className="card" style={{ borderTop: '4px solid var(--primary)', marginBottom: '30px' }}>
            <h3 style={{ margin: '0 0 24px 0', fontSize: '18px', color: 'var(--text-main)' }}>Log Manual Execution</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '20px' }}>
              
              <div>
                <label style={formLabel}>Asset / Ticker</label>
                <input style={formInput} placeholder="e.g. BTC/USD" value={formData.asset} onChange={e => setFormData({...formData, asset: e.target.value})} />
              </div>
              
              <div>
                <label style={formLabel}>PnL ($)</label>
                <input style={formInput} type="number" placeholder="e.g. 150 or -50" value={formData.pnl} onChange={e => setFormData({...formData, pnl: e.target.value})} />
              </div>
              
              <div>
                <label style={formLabel}>Direction</label>
                <select style={formInput} value={formData.direction} onChange={e => setFormData({...formData, direction: e.target.value})}>
                  <option>Long</option>
                  <option>Short</option>
                </select>
              </div>
              
              <div>
                <label style={formLabel}>Plan Adherence</label>
                <select style={formInput} value={formData.followedPlan} onChange={e => setFormData({...formData, followedPlan: e.target.value})}>
                  <option value="yes">Followed Plan Perfectly</option>
                  <option value="no">Violated Trading Rules</option>
                </select>
              </div>
              
              <div>
                <label style={formLabel}>Emotional State</label>
                <select style={formInput} value={formData.emotionalState} onChange={e => setFormData({...formData, emotionalState: e.target.value})}>
                  <option>Calm</option>
                  <option>Confident</option>
                  <option>Anxious</option>
                  <option>Greedy</option>
                  <option>Angry</option>
                </select>
              </div>
              
              <div style={{ gridColumn: 'span 3' }}>
                <label style={formLabel}>Reflective Notes (Required)</label>
                <textarea 
                  style={{ ...formInput, minHeight: '80px', resize: 'vertical' }} 
                  placeholder="Why did you take this trade? What were you thinking? Were there any emotional triggers?" 
                  value={formData.notes} 
                  onChange={e => setFormData({...formData, notes: e.target.value})} 
                />
              </div>
              
            </div>
            
            <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
              <button className="btn btn-primary" onClick={handleSubmit}>Save to Ledger</button>
            </div>
          </div>
        )}

        {/* TRADE LIST SECTION */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h4 style={{ margin: 0, color: 'var(--text-main)', fontSize: '16px', fontWeight: '700' }}>Execution History</h4>
          <span style={{ fontSize: '12px', fontWeight: '800', color: 'var(--text-muted)', background: 'var(--surface)', padding: '6px 12px', borderRadius: '20px', border: '1px solid var(--border)' }}>
            {trades.length} Entries Logged
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {trades.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '60px 20px', fontSize: '14px', fontStyle: 'italic' }}>
              No trades recorded yet. Start logging your executions to build your behavioral profile.
            </div>
          ) : (
            trades.slice().reverse().map((t) => (
              <div key={t._id} className="card" style={{ 
                padding: '24px', 
                borderLeft: `6px solid ${t.pnl > 0 ? 'var(--primary)' : 'var(--danger)'}`, 
                display: 'grid',
                gridTemplateColumns: '1.2fr 2fr',
                gap: '32px',
                alignItems: 'start'
              }}>
                
                {/* Left Col: Asset & Stats */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: '20px' }}>
                    <div>
                       <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '900', color: 'var(--text-main)' }}>{t.instrument || 'ASSET'}</h3>
                       <div style={{ color: 'var(--text-muted)', fontSize: '12px', marginTop: '4px', fontWeight: '600' }}>
                         <span style={{ textTransform: 'uppercase' }}>{t.direction}</span> • {new Date(t.entryTime).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                       </div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                       <div style={{ fontWeight: '800', fontSize: '20px', color: t.pnl > 0 ? 'var(--primary)' : 'var(--danger)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                         {t.pnl > 0 ? <TrendingUp size={20}/> : <TrendingDown size={20}/>}
                         {t.pnl > 0 ? '+' : ''}${Math.abs(t.pnl).toFixed(2)}
                       </div>
                    </div>
                  </div>
                  
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginTop: '16px' }}>
                     <span style={{ 
                       background: t.followedPlan ? 'rgba(54, 179, 126, 0.1)' : 'rgba(255, 86, 48, 0.1)', 
                       color: t.followedPlan ? 'var(--primary)' : 'var(--danger)', 
                       padding: '6px 12px', 
                       borderRadius: '6px', 
                       fontSize: '11px', 
                       fontWeight: '800',
                       border: `1px solid ${t.followedPlan ? 'rgba(54, 179, 126, 0.2)' : 'rgba(255, 86, 48, 0.2)'}`
                     }}>
                       {t.followedPlan ? '✓ FOLLOWED PLAN' : '⚠ RULE VIOLATION'}
                     </span>
                     <span style={{ 
                       background: getEmotionColor(t.mood), 
                       color: 'white', 
                       padding: '6px 12px', 
                       borderRadius: '6px', 
                       fontSize: '11px', 
                       fontWeight: '800'
                     }}>
                       {t.mood ? t.mood.toUpperCase() : 'NEUTRAL'}
                     </span>
                  </div>
                </div>

                {/* Right Col: Reflection Notes */}
                <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '32px', height: '100%', display: 'flex', flexDirection: 'column' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <Calendar size={14} color="var(--text-muted)" />
                    <h4 style={{ margin: 0, fontSize: '11px', fontWeight: '800', color: 'var(--text-muted)', letterSpacing: '1px', textTransform: 'uppercase' }}>Reflection Notes</h4>
                  </div>
                  <p style={{ margin: 0, fontSize: '14px', lineHeight: '1.6', color: 'var(--text-main)', fontStyle: t.notes ? 'normal' : 'italic', opacity: t.notes ? 1 : 0.6 }}>
                    {t.notes || "No reflection notes added for this execution."}
                  </p>
                </div>

              </div>
            ))
          )}
        </div>

      </div>
    </PageWrapper>
  );
}

// Inline styling helpers for the form
const formLabel = {
  display: 'block',
  fontSize: '11px',
  fontWeight: '800',
  color: 'var(--text-muted)',
  marginBottom: '8px',
  letterSpacing: '1px',
  textTransform: 'uppercase'
};

const formInput = {
  width: '100%',
  padding: '12px 16px',
  borderRadius: '8px',
  border: '1px solid var(--border)',
  background: 'var(--background)',
  color: 'var(--text-main)',
  fontSize: '14px',
  fontWeight: '500',
  outline: 'none',
  transition: 'border 0.2s',
  boxSizing: 'border-box'
};