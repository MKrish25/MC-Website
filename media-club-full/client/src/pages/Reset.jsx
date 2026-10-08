import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { AuthAPI } from '../api';

function ResetRequest() {
  const [email, setEmail] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) { setErr('Enter a valid email.'); return; }
    try {
      await AuthAPI.forgot(email.trim());
      setDone(true);
    } catch (ex) {
      setErr('Could not send the link — try again.');
    }
  }

  if (done) {
    return (
      <p className="note">If an account exists, a reset link is on its way. Check your inbox (and spam folder).</p>
    );
  }
  return (
    <>
      <p className="note" style={{ margin: '0 0 22px' }}>Enter your account email and we&apos;ll send you a reset link (valid 1 hour).</p>
      <form id="rsForgot" noValidate onSubmit={onSubmit}>
        <div className="field"><label>Email</label><input id="rsEmail" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <p className="note" role="alert" id="rsErr" style={{ display: err ? 'block' : 'none', color: '#e0342c' }}>{err}</p>
        <button className="submit-btn" style={{ width: '100%' }}>Send reset link</button>
      </form>
    </>
  );
}

function ResetWithToken({ token }) {
  const [state, setState] = useState('checking');
  const [p1, setP1] = useState('');
  const [p2, setP2] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    setState('checking');
    AuthAPI.resetVerify(token).then(
      () => { if (live) setState('ready'); },
      () => { if (live) setState('invalid'); }
    );
    return () => { live = false; };
  }, [token]);

  async function onSubmit(e) {
    e.preventDefault();
    setErr('');
    if (p1.length < 8) { setErr('Password: 8+ characters.'); return; }
    if (p1 !== p2) { setErr('Passwords do not match.'); return; }
    try {
      await AuthAPI.reset(token, p1);
      setState('done');
    } catch (ex) {
      setErr(ex.message || 'Could not reset — the link may have expired.');
    }
  }

  if (state === 'checking') return <p className="note">Checking your reset link…</p>;
  if (state === 'invalid') return <p className="note">This reset link is invalid or expired. <Link to="/reset">Request a fresh one</Link>.</p>;
  if (state === 'done') return <p className="note">Password set. <Link to="/dashboard">Log in with your new password →</Link></p>;
  return (
    <>
      <p className="note" style={{ margin: '0 0 22px' }}>That link checks out — choose a new password (8+ characters).</p>
      <form id="rsForm" noValidate onSubmit={onSubmit}>
        <div className="field"><label>New password</label><input id="rsP1" type="password" autoComplete="new-password" minLength={8} required value={p1} onChange={(e) => setP1(e.target.value)} /></div>
        <div className="field"><label>Confirm new password</label><input id="rsP2" type="password" autoComplete="new-password" minLength={8} required value={p2} onChange={(e) => setP2(e.target.value)} /></div>
        <p className="note" role="alert" id="rsErr" style={{ display: err ? 'block' : 'none', color: '#e0342c' }}>{err}</p>
        <button className="submit-btn" style={{ width: '100%' }}>Set new password</button>
      </form>
    </>
  );
}

export default function Reset() {
  const { token } = useParams();
  return (
    <>
      <div className="page-title">
        <div className="sec-head"><div className="kicker">Account</div><span className="frame-tag">FRAME 00/36</span></div>
        <h2 className="sec">Reset your password.</h2>
      </div>
      <div className="wrap pad">
        <div className="form-wrap">
          <div id="resetMount">{token ? <ResetWithToken token={token} /> : <ResetRequest />}</div>
        </div>
      </div>
    </>
  );
}
