import { useState } from 'react';
import { api } from '../lib/api.ts';
import { useNavigate, Link } from 'react-router-dom';
import { Activity } from 'lucide-react';
import { motion } from 'motion/react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await api.post('/auth/login', { email, password });
      localStorage.setItem('token', res.data.token);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erro ao fazer login');
    }
  };

  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-2 bg-[#020617] text-slate-200">
      
      {/* Visual / Branding Side */}
      <div className="hidden md:flex flex-col items-center justify-center bg-slate-900 border-r border-slate-800 p-12 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-emerald-900/20 via-[#020617] to-[#020617]"></div>
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative z-10 text-center"
        >
            <div className="flex items-center justify-center gap-3 mb-6">
                <div className="bg-emerald-500/10 p-4 rounded-3xl border border-emerald-500/20 shadow-[0_0_30px_rgba(16,185,129,0.15)]">
                    <Activity size={48} className="text-emerald-500" />
                </div>
            </div>
            <h1 className="text-5xl font-extrabold text-white tracking-tight mb-6">FiscalFlow</h1>
            <p className="text-lg text-slate-400 max-w-sm mx-auto font-medium leading-relaxed">
              Plataforma inteligente para gestão e sincronização automática de Notas Fiscais Eletrônicas.
            </p>
        </motion.div>
      </div>

      {/* Form Side */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <motion.div 
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="w-full max-w-md"
        >
            <div className="md:hidden flex flex-col items-center justify-center gap-3 mb-10">
              <div className="bg-emerald-500/10 p-3 rounded-2xl border border-emerald-500/20 shadow-[0_0_20px_rgba(16,185,129,0.15)]">
                <Activity size={32} className="text-emerald-500" />
              </div>
              <h1 className="text-3xl font-extrabold text-white tracking-tight">FiscalFlow</h1>
            </div>

            <div className="mb-10 text-center md:text-left">
                <h2 className="text-3xl sm:text-4xl font-bold text-white tracking-tight mb-3">Bem-vindo(a)</h2>
                <p className="text-slate-500 font-medium tracking-wide">Acesse sua conta para continuar.</p>
            </div>

            {error && (
                <motion.div 
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="bg-rose-500/10 border border-rose-500/20 text-rose-500 p-4 rounded-xl mb-6 text-sm font-bold flex items-center gap-3"
                >
                    <span className="w-2 h-2 rounded-full bg-rose-500 flex-shrink-0 shadow-[0_0_10px_rgba(244,63,94,0.5)]"></span>
                    {error}
                </motion.div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">E-mail</label>
                <input 
                  type="email" 
                  required
                  placeholder="seu@email.com"
                  className="w-full bg-[#020617] border border-slate-800 rounded-xl px-4 py-3.5 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition placeholder-slate-600 text-sm font-medium"
                  value={email} onChange={e => setEmail(e.target.value)}
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500">Senha</label>
                  <a href="#" className="text-[11px] font-bold uppercase tracking-wider text-emerald-500 hover:text-emerald-400 transition">Esqueceu a senha?</a>
                </div>
                <input 
                  type="password" 
                  required
                  placeholder="••••••••"
                  className="w-full bg-[#020617] border border-slate-800 rounded-xl px-4 py-3.5 text-white focus:ring-2 focus:ring-emerald-500 focus:border-transparent outline-none transition placeholder-slate-600 text-sm font-medium"
                  value={password} onChange={e => setPassword(e.target.value)}
                />
              </div>
              
              <button 
                type="submit" 
                className="w-full bg-emerald-600 text-white rounded-xl py-4 mt-2 text-sm font-bold uppercase tracking-wider hover:bg-emerald-500 transition-all shadow-[0_0_20px_rgba(16,185,129,0.2)] hover:shadow-[0_0_30px_rgba(16,185,129,0.3)] active:scale-[0.98]"
              >
                Entrar na Plataforma
              </button>
            </form>
            
            <p className="mt-10 text-center text-sm font-medium text-slate-500">
              Não possui uma conta? <Link to="/register" className="text-emerald-500 font-bold hover:text-emerald-400 transition-colors">Criar agora</Link>
            </p>
        </motion.div>
      </div>

    </div>
  );
}
