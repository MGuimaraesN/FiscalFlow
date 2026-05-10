import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileText, Building, LogOut, Terminal, Menu, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api.ts';
import { useState } from 'react';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
        const res = await api.get('/auth/me');
        return res.data;
    }
  });

  const handleLogout = () => {
    localStorage.removeItem('token');
    navigate('/login');
  };

  const linkClass = (path: string) => {
      const active = location.pathname.startsWith(path);
      return `flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
          active ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-white'
      }`;
  };

  const closeMenu = () => setIsMobileMenuOpen(false);

  return (
    <div className="h-[100dvh] w-full bg-[#020617] text-slate-200 flex overflow-hidden font-sans">
      
      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm z-40 lg:hidden"
          onClick={closeMenu}
        />
      )}

      {/* Sidebar Navigation */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 shrink-0 border-r border-slate-800 bg-[#020617] flex flex-col p-6 transition-transform duration-300 ease-in-out lg:static lg:translate-x-0 ${isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between gap-3 mb-10">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-emerald-500 shrink-0 rounded-lg flex items-center justify-center font-bold text-slate-950">F</div>
            <h1 className="text-xl font-bold tracking-tight text-white truncate">FiscalFlow</h1>
          </div>
          <button className="lg:hidden text-slate-400 hover:text-white" onClick={closeMenu}>
            <X size={24} />
          </button>
        </div>

        <nav className="space-y-1 flex-1">
          <Link to="/dashboard" className={linkClass('/dashboard')} onClick={closeMenu}>
            <LayoutDashboard size={20} />
            <span className="text-sm font-medium">Dashboard</span>
          </Link>
          <Link to="/nfe" className={linkClass('/nfe')} onClick={closeMenu}>
            <FileText size={20} />
            <span className="text-sm font-medium">Notas Fiscais</span>
          </Link>
          <Link to="/companies" className={linkClass('/companies')} onClick={closeMenu}>
            <Building size={20} />
            <span className="text-sm font-medium">Empresas</span>
          </Link>
          {user?.role === 'SUPERADMIN' && (
            <Link to="/admin/logs" className={linkClass('/admin/logs')} onClick={closeMenu}>
              <Terminal size={20} />
              <span className="text-sm font-medium">Logs (Admin)</span>
            </Link>
          )}
        </nav>

        <div className="mt-auto">
          <button 
            onClick={handleLogout}
            className="flex items-center gap-3 px-3 py-2 w-full text-left rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition-colors mt-4"
          >
            <LogOut size={20} />
            <span className="text-sm font-medium">Sair</span>
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header / Top Bar */}
        <header className="h-16 border-b border-slate-800 flex items-center justify-between px-4 sm:px-8 bg-[#020617]/50 backdrop-blur-md shrink-0">
          <div className="flex items-center gap-4">
            <button className="lg:hidden text-slate-400 hover:text-white" onClick={() => setIsMobileMenuOpen(true)}>
              <Menu size={24} />
            </button>
            <div className="hidden sm:block px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-bold uppercase tracking-wider">
              SEFAZ: Online
            </div>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="px-1 sm:px-3 text-sm font-medium text-slate-300 truncate max-w-[120px] sm:max-w-none">{user?.name}</div>
            <div className="w-8 h-8 shrink-0 rounded-full bg-slate-800 flex items-center justify-center text-xs text-white uppercase">{user?.name?.substring(0,2) || 'Us'}</div>
          </div>
        </header>

        <div className="p-4 sm:p-8 flex-1 overflow-auto">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
