import React, { useState, useEffect } from 'react';
import { 
  Inbox, Send, Menu, X, Plus, Calendar, LogOut, 
  Activity, Search, Shield, Paperclip 
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

// --- TYPES & HOOKS ---
interface User { id: string; username: string; }
interface Email { id: string; subject: string; summary: string; sender_address: string; received_at: number; is_read: number; category: string; }
interface Alias { address: string; name: string; }

const useAuth = () => {
  const [token, setToken] = useState<string | null>(localStorage.getItem('jwt'));
  const [user, setUser] = useState<User | null>(localStorage.getItem('user') ? JSON.parse(localStorage.getItem('user')!) : null);

  const login = (jwt: string, usr: User) => {
    localStorage.setItem('jwt', jwt);
    localStorage.setItem('user', JSON.stringify(usr));
    setToken(jwt);
    setUser(usr);
  };
  const logout = () => { localStorage.clear(); setToken(null); setUser(null); };
  return { token, user, login, logout };
};

export default function App() {
  const { token, user, login, logout } = useAuth();
  if (!token || !user) return <AuthScreen onLogin={login} />;
  return <Dashboard token={token} user={user} onLogout={logout} />;
}

// --- COMPONENTS ---

function AuthScreen({ onLogin }: { onLogin: (t: string, u: User) => void }) {
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch(isRegister ? '/api/auth/register' : '/api/auth/login', {
      method: 'POST', body: JSON.stringify(form)
    });
    const data = await res.json();
    if (data.error) setError(data.error);
    else if (isRegister) { setIsRegister(false); setError('Success. Login now.'); }
    else onLogin(data.token, data.user);
  };

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4 text-white">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8">
        <h1 className="text-2xl font-bold mb-6 text-center">{isRegister ? 'Register' : 'Login'}</h1>
        {error && <div className="text-red-400 text-sm mb-4">{error}</div>}
        <form onSubmit={submit} className="space-y-4">
          <input className="w-full bg-black/50 border border-zinc-700 rounded p-3" placeholder="Username" onChange={e => setForm({...form, username: e.target.value})} />
          <input className="w-full bg-black/50 border border-zinc-700 rounded p-3" type="password" placeholder="Password" onChange={e => setForm({...form, password: e.target.value})} />
          <button className="w-full bg-indigo-600 py-3 rounded font-bold">{isRegister ? 'Sign Up' : 'Sign In'}</button>
        </form>
        <button onClick={() => setIsRegister(!isRegister)} className="w-full mt-4 text-sm text-zinc-500">
          {isRegister ? 'Have an account?' : 'Create account'}
        </button>
      </div>
    </div>
  );
}

function Dashboard({ token, user, onLogout }: { token: string, user: User, onLogout: () => void }) {
  const [view, setView] = useState('inbox');
  const [showUsage, setShowUsage] = useState(false);
  const [aliases, setAliases] = useState<Alias[]>([]);
  const [currentAlias, setCurrentAlias] = useState('');

  useEffect(() => {
    fetch('/api/aliases', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json()).then(d => { setAliases(d); if(d.length) setCurrentAlias(d[0].address); });
  }, [token]);

  return (
    <div className="flex h-screen bg-[#09090b] text-zinc-100 overflow-hidden font-sans">
      <aside className="w-64 bg-[#0c0c0e] border-r border-white/5 flex flex-col p-4">
        <div className="font-bold mb-8 text-xl px-2">RavArch</div>
        <button onClick={() => setView('compose')} className="w-full bg-white text-black py-2 rounded-lg font-medium mb-6 flex items-center justify-center gap-2"><Plus size={18}/> Compose</button>
        <nav className="space-y-1 flex-1">
          <button onClick={() => setView('inbox')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${view === 'inbox' ? 'bg-indigo-500/10 text-indigo-400' : 'text-zinc-400 hover:text-white'}`}><Inbox size={18}/> Inbox</button>
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-white"><Send size={18}/> Sent</button>
        </nav>
        
        <div className="mt-4 pt-4 border-t border-white/5">
           <div className="text-xs font-bold text-zinc-500 uppercase mb-2">Account</div>
           <select className="w-full bg-black border border-white/10 rounded p-2 text-sm text-zinc-300 mb-4" value={currentAlias} onChange={e => setCurrentAlias(e.target.value)}>
             {aliases.map(a => <option key={a.address} value={a.address}>{a.address}</option>)}
           </select>
           <button onClick={() => setShowUsage(true)} className="w-full flex items-center gap-2 px-3 py-2 text-zinc-500 hover:text-white text-sm"><Activity size={16}/> Usage</button>
           <button onClick={onLogout} className="w-full flex items-center gap-2 px-3 py-2 text-zinc-500 hover:text-red-400 text-sm"><LogOut size={16}/> Sign Out</button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col relative">
        {view === 'inbox' ? <InboxView token={token} /> : <Composer token={token} from={currentAlias} close={() => setView('inbox')} />}
        {showUsage && <UsageModal token={token} close={() => setShowUsage(false)} />}
      </main>
    </div>
  );
}

function InboxView({ token }: { token: string }) {
  const [emails, setEmails] = useState<Email[]>([]);
  useEffect(() => {
    fetch('/api/emails', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).then(setEmails);
  }, [token]);

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <h2 className="text-2xl font-bold mb-6">Inbox</h2>
      {emails.map(e => (
        <div key={e.id} className="border-b border-white/5 p-4 hover:bg-white/5 cursor-pointer">
          <div className="flex justify-between text-sm mb-1">
            <span className={e.is_read ? 'text-zinc-500' : 'text-white font-medium'}>{e.sender_address}</span>
            <span className="text-zinc-600">{formatDistanceToNow(e.received_at)} ago</span>
          </div>
          <div className={e.is_read ? 'text-zinc-500' : 'text-zinc-200'}>{e.subject}</div>
          <div className="text-xs text-zinc-600 truncate">{e.summary}</div>
        </div>
      ))}
    </div>
  );
}

function UsageModal({ token, close }: any) {
  const [stats, setStats] = useState<any>(null);
  useEffect(() => { fetch('/api/usage', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).then(setStats); }, [token]);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="bg-[#1a1a1a] p-6 rounded-2xl w-96 border border-white/10 relative">
        <button onClick={close} className="absolute top-4 right-4 text-zinc-500"><X size={20}/></button>
        <h3 className="font-bold mb-4 flex items-center gap-2"><Activity className="text-indigo-500"/> Usage Analytics</h3>
        {stats ? (
          <div className="space-y-4">
            <div className="bg-black/50 p-3 rounded border border-white/5 flex justify-between"><span>Total Emails</span><span className="font-bold">{stats.total_emails}</span></div>
            <div className="bg-black/50 p-3 rounded border border-white/5 flex justify-between"><span>Spam Blocked</span><span className="font-bold text-red-400">{stats.spam_blocked || 0}</span></div>
            <div className="bg-black/50 p-3 rounded border border-white/5 flex justify-between"><span>Scheduled</span><span className="font-bold text-blue-400">{stats.scheduled_count || 0}</span></div>
          </div>
        ) : <div>Loading...</div>}
      </div>
    </div>
  );
}

function Composer({ token, from, close }: any) {
  const [form, setForm] = useState({ to: '', subject: '', body: '', scheduleTime: '' });
  const [status, setStatus] = useState('idle');

  const send = async () => {
    setStatus('sending');
    await fetch('/api/send', {
      method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, from, scheduleTime: form.scheduleTime || undefined })
    });
    setStatus('sent'); setTimeout(close, 1000);
  };

  return (
    <div className="flex-1 p-8 flex flex-col max-w-3xl mx-auto h-full">
      <div className="flex justify-between mb-6"><h2 className="font-bold text-xl">New Message</h2><button onClick={close}><X/></button></div>
      <div className="bg-zinc-900 border border-white/5 rounded-xl flex-1 flex flex-col p-4 overflow-hidden">
        <div className="mb-4 space-y-2 text-sm">
          <div className="flex gap-2"><span className="w-16 text-zinc-500">From:</span><span className="text-white">{from}</span></div>
          <div className="flex gap-2"><span className="w-16 text-zinc-500">To:</span><input className="bg-transparent outline-none flex-1 text-white" placeholder="Recipient" onChange={e => setForm({...form, to: e.target.value})}/></div>
          <div className="flex gap-2"><span className="w-16 text-zinc-500">Subject:</span><input className="bg-transparent outline-none flex-1 text-white" placeholder="Subject" onChange={e => setForm({...form, subject: e.target.value})}/></div>
        </div>
        <textarea className="flex-1 bg-transparent outline-none resize-none text-zinc-300" placeholder="Type message..." onChange={e => setForm({...form, body: e.target.value})}/>
        <div className="border-t border-white/5 pt-4 flex justify-between items-center">
          <input type="datetime-local" className="bg-transparent text-xs text-zinc-500" onChange={e => setForm({...form, scheduleTime: e.target.value})}/>
          <button onClick={send} disabled={status !== 'idle'} className="bg-indigo-600 px-6 py-2 rounded-lg font-bold text-white">{status === 'sending' ? 'Sending...' : status === 'sent' ? 'Sent!' : 'Send'}</button>
        </div>
      </div>
    </div>
  );
}
