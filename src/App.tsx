/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Search, AlertCircle, Loader2, Database, LogOut, User as UserIcon } from 'lucide-react';
import { ProductsTable } from './components/ProductsTable';
import { LoginModal } from './components/LoginModal';
import { AuditedProduct } from './types/vtex';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<string | null>(() => localStorage.getItem('vtex_audit_user'));
  const [clusterId, setClusterId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<{ products: AuditedProduct[]; total: number; page: number; pageSize: number } | null>(null);

  useEffect(() => {
    if (user) {
      localStorage.setItem('vtex_audit_user', user);
    } else {
      localStorage.removeItem('vtex_audit_user');
    }
  }, [user]);

  const handleLogin = (username: string) => {
    setUser(username);
  };

  const handleLogout = () => {
    setUser(null);
    setResults(null);
    setClusterId('');
  };

  const handleSearch = async () => {
    if (!clusterId.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/inspect?clusterId=${clusterId}`);
      
      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        console.error("Non-JSON response received:", text);
        
        if (text.includes("<!DOCTYPE html>") || text.includes("<html")) {
          throw new Error("El servidor devolvió una página HTML (Error 500). Esto suele ser un 'Runtime Error' en Vercel. Revisa los logs en el dashboard de Vercel.");
        }
        throw new Error(`Error del servidor (HTTP ${response.status}): ${text.substring(0, 100)}...`);
      }

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || `Error del servidor (HTTP ${response.status})`);
      }
      setResults(data);
    } catch (err: any) {
      setError(err.message);
      setResults(null);
    } finally {
      setLoading(false);
    }
  };

  if (!user) {
    return <LoginModal onLogin={handleLogin} />;
  }

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans selection:bg-emerald-100 selection:text-emerald-900">
      {/* Header */}
      <header className="bg-white border-b border-zinc-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-emerald-200">
              <Database size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-900">VTEX Auditor</h1>
              <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Product Cluster Inspector</p>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-zinc-100 rounded-full text-zinc-600 text-sm font-medium">
              <UserIcon size={14} />
              <span>{user}</span>
            </div>
            <button 
              onClick={handleLogout}
              className="p-2 text-zinc-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
              title="Cerrar Sesión"
            >
              <LogOut size={20} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
        {/* Search Form */}
        <section className="bg-white p-6 rounded-2xl border border-zinc-200 shadow-sm space-y-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold text-zinc-700 uppercase tracking-wider">Nueva Auditoría</h2>
            <p className="text-sm text-zinc-500">Ingresa el ID de la colección o cluster para auditar stock y precios.</p>
          </div>
          
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSearch(); }}
            className="flex flex-col sm:flex-row gap-3"
          >
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-400">
                <Search size={18} />
              </div>
              <input
                type="text"
                value={clusterId}
                onChange={(e) => setClusterId(e.target.value)}
                placeholder="Ej: 145"
                className="block w-full pl-10 pr-3 py-3 bg-zinc-50 border border-zinc-200 rounded-xl text-sm placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={loading || !clusterId.trim()}
              className="px-8 py-3 bg-zinc-900 hover:bg-zinc-800 text-white rounded-xl font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-zinc-200"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : null}
              Consultar
            </button>
          </form>
        </section>

        {/* Error State */}
        <AnimatePresence>
          {error && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-rose-800"
            >
              <AlertCircle className="shrink-0 mt-0.5" size={18} />
              <div className="text-sm">
                <p className="font-semibold">Error de consulta</p>
                <p className="opacity-90">{error}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results */}
        <section>
          {loading && !results ? (
            <div className="flex flex-col items-center justify-center py-24 space-y-4">
              <Loader2 className="animate-spin text-emerald-600" size={48} />
              <p className="text-zinc-500 font-medium">Consultando APIs de VTEX...</p>
              <p className="text-xs text-zinc-400">Esto puede tardar unos segundos dependiendo del tamaño del cluster.</p>
            </div>
          ) : (
            results && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <ProductsTable
                  products={results.products}
                  total={results.total}
                />
              </motion.div>
            )
          )}
        </section>
      </main>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12 text-center">
        <p className="text-xs text-zinc-400 font-medium uppercase tracking-widest">
          VTEX Audit Tool &bull; Built with Next.js & Tailwind
        </p>
      </footer>
    </div>
  );
}
