import React, { useState, useEffect } from 'react';
import { 
  Inbox, Send, Plus, Activity, X, LogOut, Loader2, Calendar 
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { TelegramBanner } from './components/TelegramBanner';

// --- TYPES ---
interface User { id: string; username: string; }
interface Email { id: string; subject: string; summary: string; sender_address: string; received_at: number; is_read: number; category: string; }
interface Alias { address: string; name: string; }
interface Stats { total_emails: number; spam_blocked: number; scheduled_count: number; }

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

// --- UPDATED AUTH SCREEN (FIXED CRASH) ---
function AuthScreen({ onLogin }: { onLogin: (t: string, u: User) => void }) {
  const [isRegister, setIsRegister] = useState(false);
  const [form, setForm] = useState({ username: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST', 
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });

      const contentType = res.headers.get("content-type");
      let data;
      
      // CRITICAL FIX: Check if response is JSON before parsing
      if (contentType && contentType.includes("application/json")) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(`Server Error (${res.status}): ${text}`);
      }

      if (!res.ok) throw new Error(data.error || 'Request failed');
      
      if (isRegister) { 
        setIsRegister(false); 
        setError('Success. Please log in.'); 
      } else { 
        onLogin(data.token, data.user); 
      }
    } catch (e: any) { 
      console.error("Auth Failed:", e);
      setError(e.message || "An unexpected error occurred"); 
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#09090b] flex items-center justify-center p-4 text-white font-sans">
      <div className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-2xl p-8 shadow-2xl">
        <h1 className="text-3xl font-bold mb-2 text-center text-white">RavArch</h1>
        <p className="text-zinc-500 text-center mb-8">{isRegister ? 'Create your account' : 'Welcome back'}</p>
        
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-sm p-3 rounded-lg mb-4 break-words">
            {error}
          </div>
        )}

        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wider">Username</label>
            <input 
              className="w-full bg-black/50 border border-zinc-700 focus:border-indigo-500 rounded-lg p-3 text-white outline-none transition-colors" 
              placeholder="Enter username" 
              value={form.username}
              onChange={e => setForm({...form, username: e.target.value})} 
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-zinc-500 mb-1 uppercase tracking-wider">Password</label>
            <input 
              className="w-full bg-black/50 border border-zinc-700 focus:border-indigo-500 rounded-lg p-3 text-white outline-none transition-colors" 
              type="password" 
              placeholder="••••••••" 
              value={form.password}
              onChange={e => setForm({...form, password: e.target.value})} 
            />
          </div>
          <button 
            disabled={loading} 
            className="w-full bg-indigo-600 hover:bg-indigo-500 py-3 rounded-lg font-bold text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center mt-6"
          >
            {loading ? <Loader2 className="animate-spin" size={20} /> : (isRegister ? 'Sign Up' : 'Sign In')}
          </button>
        </form>
        
        <div className="mt-6 text-center">
          <button 
            onClick={() => { setIsRegister(!isRegister); setError(''); }} 
            className="text-sm text-zinc-500 hover:text-zinc-300 transition-colors"
          >
            {isRegister ? 'Already have an account? Sign In' : "Don't have an account? Sign Up"}
          </button>
        </div>
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
      .then(r => r.json())
      .then(d => { 
        if(Array.isArray(d)) {
            setAliases(d); 
            if(d.length > 0) setCurrentAlias(d[0].address); 
        }
      })
      .catch(console.error);
  }, [token]);

  return (
    <div className="flex h-screen bg-[#09090b] text-zinc-100 overflow-hidden font-sans">
      <aside className="w-64 bg-[#0c0c0e] border-r border-white/5 flex flex-col p-4 hidden md:flex">
        <div className="font-bold mb-8 text-xl px-2 text-indigo-400">RavArch</div>
        <button onClick={() => setView('compose')} className="w-full bg-white text-black py-2 rounded-lg font-medium mb-6 flex items-center justify-center gap-2 hover:bg-zinc-200"><Plus size={18}/> Compose</button>
        <nav className="space-y-1 flex-1">
          <button onClick={() => setView('inbox')} className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm ${view === 'inbox' ? 'bg-indigo-500/10 text-indigo-400' : 'text-zinc-400 hover:text-white'}`}><Inbox size={18}/> Inbox</button>
          <button className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-zinc-400 hover:text-white cursor-not-allowed opacity-50"><Send size={18}/> Sent</button>
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
        <div className="absolute bottom-4 right-4">
             <TelegramBanner />
        </div>
      </main>
    </div>
  );
}

function InboxView({ token }: { token: string }) {
  const [emails, setEmails] = useState<Email[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/emails', { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => { setEmails(Array.isArray(d) ? d : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  if (loading) return <div className="flex-1 flex items-center justify-center text-zinc-500"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <h2 className="text-2xl font-bold mb-6">Inbox</h2>
      {emails.length === 0 ? <div className="text-zinc-500">No emails found.</div> : 
      emails.map(e => (
        <div key={e.id} className="border-b border-white/5 p-4 hover:bg-white/5 cursor-pointer transition-colors group">
          <div className="flex justify-between text-sm mb-1">
            <span className={e.is_read ? 'text-zinc-500' : 'text-white font-medium group-hover:text-indigo-300'}>{e.sender_address}</span>
            <span className="text-zinc-600">{formatDistanceToNow(e.received_at)} ago</span>
          </div>
          <div className={`mb-1 ${e.is_read ? 'text-zinc-500' : 'text-zinc-200'}`}>{e.subject || "(No Subject)"}</div>
          <div className="text-xs text-zinc-600 truncate flex gap-2 items-center">
            <span className="bg-zinc-800 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">{e.category}</span>
            {e.summary}
          </div>
        </div>
      ))}
    </div>
  );
}

function UsageModal({ token, close }: { token: string, close: () => void }) {
  const [stats, setStats] = useState<Stats | null>(null);
  useEffect(() => { fetch('/api/usage', { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()).then(setStats); }, [token]);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-[#1a1a1a] p-6 rounded-2xl w-96 border border-white/10 relative shadow-2xl">
        <button onClick={close} className="absolute top-4 right-4 text-zinc-500 hover:text-white"><X size={20}/></button>
        <h3 className="font-bold mb-4 flex items-center gap-2"><Activity className="text-indigo-500"/> Usage Analytics</h3>
        {stats ? (
          <div className="space-y-4">
            <div className="bg-black/50 p-3 rounded border border-white/5 flex justify-between"><span>Total Emails</span><span className="font-bold">{stats.total_emails}</span></div>
            <div className="bg-black/50 p-3 rounded border border-white/5 flex justify-between"><span>Spam Blocked</span><span className="font-bold text-red-400">{stats.spam_blocked || 0}</span></div>
            <div className="bg-black/50 p-3 rounded border border-white/5 flex justify-between"><span>Scheduled</span><span className="font-bold text-blue-400">{stats.scheduled_count || 0}</span></div>
          </div>
        ) : <div className="flex justify-center p-4"><Loader2 className="animate-spin text-zinc-500"/></div>}
      </div>
    </div>
  );
}

function Composer({ token, from, close }: { token: string, from: string, close: () => void }) {
  const [form, setForm] = useState({ to: '', subject: '', body: '', scheduleTime: '' });
  const [status, setStatus] = useState('idle');

  const send = async () => {
    setStatus('sending');
    try {
        const res = await fetch('/api/send', {
        method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, from, scheduleTime: form.scheduleTime || undefined })
        });
        if (!res.ok) throw new Error();
        setStatus('sent'); 
        setTimeout(close, 1000);
    } catch {
        setStatus('error');
    }
  };

  return (
    <div className="flex-1 p-8 flex flex-col max-w-3xl mx-auto h-full">
      <div className="flex justify-between mb-6"><h2 className="font-bold text-xl">New Message</h2><button onClick={close} className="hover:text-red-400"><X/></button></div>
      <div className="bg-zinc-900 border border-white/5 rounded-xl flex-1 flex flex-col p-4 overflow-hidden shadow-xl">
        <div className="mb-4 space-y-2 text-sm border-b border-white/5 pb-4">
          <div className="flex gap-2 items-center"><span className="w-16 text-zinc-500">From:</span><span className="text-indigo-400 font-mono bg-indigo-500/10 px-2 rounded">{from}</span></div>
          <div className="flex gap-2 items-center"><span className="w-16 text-zinc-500">To:</span><input className="bg-transparent outline-none flex-1 text-white border-b border-transparent focus:border-zinc-700 transition-colors" placeholder="recipient@example.com" onChange={e => setForm({...form, to: e.target.value})}/></div>
          <div className="flex gap-2 items-center"><span className="w-16 text-zinc-500">Subject:</span><input className="bg-transparent outline-none flex-1 text-white border-b border-transparent focus:border-zinc-700 transition-colors" placeholder="Subject" onChange={e => setForm({...form, subject: e.target.value})}/></div>
        </div>
        <textarea className="flex-1 bg-transparent outline-none resize-none text-zinc-300 font-sans leading-relaxed" placeholder="Type message..." onChange={e => setForm({...form, body: e.target.value})}/>
        <div className="border-t border-white/5 pt-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Calendar size={16} className="text-zinc-500"/>
            <input type="datetime-local" className="bg-transparent text-xs text-zinc-500 outline-none" onChange={e => setForm({...form, scheduleTime: e.target.value})}/>
          </div>
          <button onClick={send} disabled={status === 'sending'} className={`px-6 py-2 rounded-lg font-bold text-white transition-colors ${status === 'sent' ? 'bg-green-600' : status === 'error' ? 'bg-red-600' : 'bg-indigo-600 hover:bg-indigo-500'}`}>
            {status === 'sending' ? <Loader2 className="animate-spin" size={18}/> : status === 'sent' ? 'Sent!' : status === 'error' ? 'Failed' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
