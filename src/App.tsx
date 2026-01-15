import { useState, useEffect } from 'react';
import { TelegramBanner } from './components/TelegramBanner';

// Types
interface Stats {
  users_active: number;
  requests_processed: number;
  latency_ms: number;
  region: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'ai';
  text: string;
}

function App() {
  // State
  const [stats, setStats] = useState<Stats | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: '1', role: 'ai', text: 'Hello! I am your RavArch AI assistant. How can I help you build today?' }
  ]);
  const [input, setInput] = useState('');
  const [isTyping, setIsTyping] = useState(false);

  // Fetch Stats on Load
  useEffect(() => {
    fetch('/api/stats')
      .then(res => res.json())
      .then(setStats)
      .catch(console.error);
    
    // Refresh stats every 5s
    const interval = setInterval(() => {
      fetch('/api/stats')
        .then(res => res.json())
        .then(setStats)
        .catch(console.error);
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // Handle Chat
  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg: ChatMessage = { id: Date.now().toString(), role: 'user', text: input };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsTyping(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg.text })
      });
      const data = await res.json();
      
      const aiMsg: ChatMessage = { id: data.id, role: 'ai', text: data.response };
      setMessages(prev => [...prev, aiMsg]);
    } catch (err) {
      console.error(err);
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-700">
      
      {/* --- HERO SECTION --- */}
      <header className="relative bg-white border-b border-slate-200 overflow-hidden">
        <div className="absolute inset-0 bg-[url('/binary-code_2115955.png')] opacity-5 bg-center bg-repeat"></div>
        <div className="max-w-7xl mx-auto px-6 py-24 relative z-10 text-center">
          <div className="inline-block px-4 py-1.5 mb-6 rounded-full bg-indigo-50 border border-indigo-100 text-indigo-600 text-sm font-semibold tracking-wide uppercase">
            v2.0 Now Available
          </div>
          <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight text-slate-900 mb-6">
            Build Faster on <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-600 to-purple-600">The Edge</span>
          </h1>
          <p className="max-w-2xl mx-auto text-xl text-slate-600 mb-10">
            A complete React 19 Single Page Application template powered by Cloudflare Workers. 
            Scalable, secure, and globally distributed by default.
          </p>
          <div className="flex justify-center gap-4">
            <button onClick={() => window.scrollTo({top: 800, behavior: 'smooth'})} className="px-8 py-3.5 rounded-lg bg-indigo-600 text-white font-bold hover:bg-indigo-700 transition shadow-lg shadow-indigo-200">
              Get Started
            </button>
            <a href="https://developers.cloudflare.com" target="_blank" className="px-8 py-3.5 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold hover:bg-slate-50 transition">
              Documentation
            </a>
          </div>
        </div>
      </header>

      {/* --- STATS GRID --- */}
      <section className="py-12 bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
            <StatCard label="Active Users" value={stats?.users_active} icon="👥" />
            <StatCard label="Requests / Sec" value={stats?.requests_processed.toLocaleString()} icon="⚡" />
            <StatCard label="Global Latency" value={stats ? `${stats.latency_ms}ms` : '-'} icon="🌐" />
            <StatCard label="Edge Region" value={stats?.region} icon="📍" />
          </div>
        </div>
      </section>

      {/* --- MAIN CONTENT & CHAT --- */}
      <main className="max-w-7xl mx-auto px-6 py-16">
        <div className="grid md:grid-cols-2 gap-12 items-start">
          
          {/* Left: Description */}
          <div className="space-y-8">
            <h2 className="text-3xl font-bold text-slate-900">Experience the Power of Agents</h2>
            <p className="text-lg text-slate-600 leading-relaxed">
              This template includes the <code>agents</code> SDK, allowing you to build stateful AI assistants that persist conversations and execute tasks. 
              Try the demo chat on the right to see the API in action.
            </p>
            <ul className="space-y-4">
              <FeatureItem text="React 19 + Vite + TypeScript" />
              <FeatureItem text="Cloudflare Workers API Backend" />
              <FeatureItem text="Tailwind CSS 4.0 Styling" />
              <FeatureItem text="Smart Placement & Asset Optimization" />
            </ul>
            
            {/* Telegram Banner Inserted Here */}
            <TelegramBanner />
          </div>

          {/* Right: Interactive Chat Demo */}
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 overflow-hidden flex flex-col h-[600px]">
            <div className="p-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <span className="font-semibold text-slate-700">RavArch AI Agent</span>
              <span className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse"></span>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50/50">
              {messages.map((msg) => (
                <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] px-4 py-3 rounded-2xl text-sm ${
                    msg.role === 'user' 
                      ? 'bg-indigo-600 text-white rounded-br-none' 
                      : 'bg-white border border-slate-200 text-slate-800 rounded-bl-none shadow-sm'
                  }`}>
                    {msg.text}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex justify-start">
                  <div className="bg-white border border-slate-200 px-4 py-3 rounded-2xl rounded-bl-none shadow-sm">
                    <div className="flex gap-1">
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"></span>
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-100"></span>
                      <span className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce delay-200"></span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <form onSubmit={sendMessage} className="p-4 bg-white border-t border-slate-100 flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your infrastructure..."
                className="flex-1 px-4 py-2 bg-slate-100 border-transparent focus:bg-white focus:border-indigo-500 rounded-lg focus:ring-2 focus:ring-indigo-200 outline-none transition"
              />
              <button 
                type="submit" 
                disabled={!input.trim() || isTyping}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
              >
                Send
              </button>
            </form>
          </div>

        </div>
      </main>

      <footer className="py-8 text-center text-slate-400 text-sm">
        © 2026 RavArch. Powered by Cloudflare Workers.
      </footer>
    </div>
  );
}

// Sub-components
const StatCard = ({ label, value, icon }: { label: string, value: any, icon: string }) => (
  <div className="text-center p-4">
    <div className="text-3xl mb-2">{icon}</div>
    <div className="text-2xl font-bold text-slate-800">{value ?? '...'}</div>
    <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">{label}</div>
  </div>
);

const FeatureItem = ({ text }: { text: string }) => (
  <li className="flex items-center gap-3 text-slate-700">
    <svg className="w-5 h-5 text-green-500 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7"></path></svg>
    {text}
  </li>
);

export default App;
