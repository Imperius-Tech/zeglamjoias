import { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { useDashboardStore } from '@/lib/store';
import { supabase } from '@/lib/supabase';
import ConversasPage from '@/pages/ConversasPage';
import ConhecimentoPage from '@/pages/ConhecimentoPage';
import TreinamentoPage from '@/pages/TreinamentoPage';
import ClientesPage from '@/pages/ClientesPage';
import ComprovantesPage from '@/pages/ComprovantesPage';
import AutomacoesPage from '@/pages/AutomacoesPage';
import MetricasPage from '@/pages/MetricasPage';
import ConfiguracoesPage from '@/pages/ConfiguracoesPage';
import LoginPage from '@/pages/LoginPage';
import { Loader } from 'lucide-react';

export default function App() {
  const loadInstances = useDashboardStore((s) => s.loadInstances);
  const loadConversations = useDashboardStore((s) => s.loadConversations);
  const loadKnowledgeEntries = useDashboardStore((s) => s.loadKnowledgeEntries);
  const subscribeRealtime = useDashboardStore((s) => s.subscribeRealtime);
  const [session, setSession] = useState<any>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const conversations = useDashboardStore((s) => s.conversations);
  const unreadTotal = conversations.reduce((a, c) => a + c.unreadCount, 0);

  useEffect(() => {
    if (unreadTotal > 0) {
      document.title = `(${unreadTotal}) Zeglam | Painel IA`;
    } else {
      document.title = 'Zeglam | Painel IA';
    }
  }, [unreadTotal]);

  useEffect(() => {
    // Check current session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setAuthLoading(false);
    });

    // Listen for auth changes — só reage a mudança REAL de usuário (login/logout).
    // Ignora TOKEN_REFRESHED (dispara ao voltar a aba) e USER_UPDATED para evitar reload.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'INITIAL_SESSION') {
        setSession((prev: any) => {
          const prevId = prev?.user?.id || null;
          const newId = newSession?.user?.id || null;
          if (prevId === newId) return prev; // user igual — mantém referência pra não disparar effects
          return newSession;
        });
        setAuthLoading(false);
      }
    });

    // Initialize theme
    const savedTheme = localStorage.getItem('zeglam_theme') || 'dark';
    if (savedTheme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }

    return () => subscription.unsubscribe();
  }, []);

  const userId = session?.user?.id || null;
  useEffect(() => {
    if (userId) {
      (async () => {
        await loadInstances();
        await Promise.all([loadConversations(), loadKnowledgeEntries()]);
      })();
      const unsubscribe = subscribeRealtime();
      return unsubscribe;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  if (authLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
        <Loader size={32} className="spin" style={{ color: 'var(--accent)' }} />
      </div>
    );
  }

  return (
    <div className="noise">
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/conversas" replace /> : <LoginPage />} />
        <Route 
          path="/*" 
          element={
            !session ? <Navigate to="/login" replace /> : (
              <DashboardShell>
                <Routes>
                  <Route path="/" element={<Navigate to="/conversas" replace />} />
                  <Route path="/conversas" element={<ConversasPage />} />
                  <Route path="/conhecimento" element={<ConhecimentoPage />} />
                  <Route path="/treinamento" element={<TreinamentoPage />} />
                  <Route path="/clientes" element={<ClientesPage />} />
                  <Route path="/comprovantes" element={<ComprovantesPage />} />
                  <Route path="/automacoes" element={<AutomacoesPage />} />
                  <Route path="/metricas" element={<MetricasPage />} />
                  <Route path="/configuracoes" element={<ConfiguracoesPage />} />
                </Routes>
              </DashboardShell>
            )
          } 
        />
      </Routes>
    </div>
  );
}
