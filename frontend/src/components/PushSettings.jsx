import React, { useEffect, useState } from 'react';
import { Send, Smartphone } from 'lucide-react';
import { errorMessage } from '../api/client';
import { useToast } from './Toast';
import { pushSupported, isIos, isStandalone, currentSubscription, enablePush, disablePush, sendTestPush } from '../utils/push';

// Per-device opt-in: each browser or installed app subscribes separately.
export default function PushSettings() {
  const toast = useToast();
  const [on, setOn] = useState(false);
  const [busy, setBusy] = useState(false);
  const supported = pushSupported();
  const iosNeedsInstall = isIos() && !isStandalone();
  const blocked = supported && Notification.permission === 'denied';

  useEffect(() => {
    currentSubscription().then((s) => setOn(Boolean(s))).catch(() => {});
  }, []);

  const toggle = async () => {
    setBusy(true);
    try {
      if (on) {
        await disablePush();
        setOn(false);
        toast.info('Alerts turned off on this device.');
      } else {
        await enablePush();
        setOn(true);
        toast.success('Alerts are on for this device.');
      }
    } catch (err) {
      toast.error(errorMessage(err, err.message || 'Could not change notification settings'));
    } finally {
      setBusy(false);
    }
  };

  const test = async () => {
    try {
      await sendTestPush();
      toast.success('Test alert sent. It should appear in a few seconds.');
    } catch (err) {
      toast.error(errorMessage(err, 'Could not send a test alert'));
    }
  };

  if (iosNeedsInstall) {
    return (
      <div className="settings-summary">
        <Smartphone size={15} />
        <span>On iPhone and iPad, alerts only work from the installed app. Tap <strong>Share → Add to Home Screen</strong>, open Cognitive Firewall from your Home Screen, then turn alerts on here.</span>
      </div>
    );
  }
  if (!supported) {
    return <p className="settings-hint" style={{ margin: 0 }}>This browser doesn't support push notifications.</p>;
  }

  return (
    <>
      <label className="toggle-row">
        <span>
          <span className="toggle-title">Alerts on this device</span>
          <span className="toggle-desc">
            Amber when revenge risk passes 50% or a prop-firm limit is half used, red past 75%, and a lock alert the moment execution locks. You'll also hear when the firewall reopens.
          </span>
        </span>
        <span className={`toggle ${on ? 'is-on' : ''}`}>
          <input type="checkbox" role="switch" checked={on} onChange={toggle} disabled={busy || blocked} aria-label="Alerts on this device" />
          <span className="toggle-knob" />
        </span>
      </label>
      {blocked && <p className="brokers-error">Notifications are blocked for this site. Allow them in your browser's site settings to turn alerts on.</p>}
      {on && (
        <div className="settings-row">
          <span className="settings-hint" style={{ margin: 0 }}>Alerts go to every device you turn them on for.</span>
          <button className="btn btn-ghost" onClick={test}><Send size={15} /> Send a test alert</button>
        </div>
      )}
    </>
  );
}

