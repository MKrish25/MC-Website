import { useState } from 'react';
import { Link } from 'react-router-dom';
import { SiteAPI } from '../api';

export default function Connect() {
  const [join, setJoin] = useState({ name: '', email: '', interest: 'Photography', link: '', message: '' });
  const [joinSent, setJoinSent] = useState(false);
  const [joinErr, setJoinErr] = useState('');
  const [contact, setContact] = useState({ name: '', email: '', message: '' });
  const [contactSent, setContactSent] = useState(false);
  const [contactErr, setContactErr] = useState('');

  const setJ = (k) => (e) => setJoin((p) => ({ ...p, [k]: e.target.value }));
  const setC = (k) => (e) => setContact((p) => ({ ...p, [k]: e.target.value }));

  async function onJoin(e) {
    e.preventDefault();
    setJoinErr('');
    try {
      await SiteAPI.applications(join);
      setJoinSent(true);
      setJoin({ name: '', email: '', interest: 'Photography', link: '', message: '' });
    } catch (ex) {
      setJoinErr(ex.message);
    }
  }

  async function onContact(e) {
    e.preventDefault();
    setContactErr('');
    try {
      await SiteAPI.messages(contact);
      setContactSent(true);
      setContact({ name: '', email: '', message: '' });
    } catch (ex) {
      setContactErr(ex.message);
    }
  }

  return (
    <>
      <div className="page-title">
        <div className="sec-head"><div className="kicker">Connect</div><span className="frame-tag">FRAME 07/36</span></div>
        <h2 className="sec">Join us, or just say hello.</h2>
      </div>
      <div className="wrap pad">
        <div className="connect-grid">
          <div className="connect-col">
            <h3 className="connect-h">Join</h3>
            <p className="join-login">Already a member? <Link to="/dashboard">Log in to your dashboard</Link></p>
            <div className="form-wrap">
              <form id="joinForm" onSubmit={onJoin}>
                <div className="field"><label>Full name</label><input required type="text" value={join.name} onChange={setJ('name')} /></div>
                <div className="field"><label>Email</label><input required type="email" value={join.email} onChange={setJ('email')} /></div>
                <div className="field"><label>Interested in</label>
                  <select value={join.interest} onChange={setJ('interest')}><option>Photography</option><option>Film</option><option>Not sure yet</option></select>
                </div>
                <div className="field"><label>Link to your work (optional)</label><input type="text" placeholder="Instagram, Drive folder, anything" value={join.link} onChange={setJ('link')} /></div>
                <div className="field"><label>Why do you want to join?</label><textarea value={join.message} onChange={setJ('message')}></textarea></div>
                {joinErr && <p className="note" role="alert" style={{ color: '#e0342c' }}>{joinErr}</p>}
                <button className="submit-btn" type="submit">Send application</button>
                <p className={'confirm' + (joinSent ? ' show' : '')} id="joinConfirm">Got it — applications are reviewed by the committee every Friday. We&apos;ll email you either way.</p>
              </form>
            </div>
          </div>
          <div className="connect-col">
            <h3 className="connect-h">Contact</h3>
            <div className="form-wrap">
              <p style={{ color: 'var(--gray)', lineHeight: 1.7, marginBottom: 28 }}>Questions, collaborations or press: write to the committee directly. We reply within a few days during term.</p>
              <form id="contactForm" onSubmit={onContact}>
                <div className="field"><label>Name</label><input required type="text" value={contact.name} onChange={setC('name')} /></div>
                <div className="field"><label>Email</label><input required type="email" value={contact.email} onChange={setC('email')} /></div>
                <div className="field"><label>Message</label><textarea required value={contact.message} onChange={setC('message')}></textarea></div>
                {contactErr && <p className="note" role="alert" style={{ color: '#e0342c' }}>{contactErr}</p>}
                <button className="submit-btn" type="submit">Send message</button>
                <p className={'confirm' + (contactSent ? ' show' : '')} id="contactConfirm">Message sent. Someone from the committee will get back to you.</p>
              </form>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
