
import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-10 bg-indigo-600 rounded-md flex items-center justify-center font-bold text-white shadow-lg shadow-indigo-500/20">
              D
            </div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
              DeckMaster
            </h1>
          </div>
          <nav className="flex items-center gap-4">
            <span className="text-xs uppercase tracking-widest text-slate-500 font-semibold hidden sm:inline">
              Collection Management
            </span>
          </nav>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
      <footer className="border-t border-slate-900 mt-12 py-8 bg-slate-950">
        <div className="max-w-7xl mx-auto px-4 text-center text-slate-600 text-sm">
          &copy; {new Date().getFullYear()} DeckMaster AI. Built for Creators.
        </div>
      </footer>
    </div>
  );
};

export default Layout;
