import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { useDashboardStore } from '@/lib/store';
import ConversasPage from '@/pages/ConversasPage';
import ConhecimentoPage from '@/pages/ConhecimentoPage';
import ClientesPage from '@/pages/ClientesPage';
import ComprovantesPage from '@/pages/ComprovantesPage';
import AutomacoesPage from '@/pages/AutomacoesPage';
import MetricasPage from '@/pages/MetricasPage';
import ConfiguracoesPage from '@/pages/ConfiguracoesPage';
import LoginPage from '@/pages/LoginPage';

export default function App() {
  const loadConversations = useDashboardStore((s) => s.loadConversations);
  const loadKnowledgeEntries = useDashboardStore((s) => s.loadKnowledgeEntries);
  const subscribeRealtime = useDashboardStore((s) => s.subscribeRealtime);

  useEffect(() => {
    loadConversations();
    loadKnowledgeEntries();
    const unsubscribe = subscribeRealtime();
    return unsubscribe;
  }, [loadConversations, loadKnowledgeEntries, subscribeRealtime]);

  return (
    <div className="noise">
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route 
          path="/*" 
          element={
            <DashboardShell>
              <Routes>
                <Route path="/" element={<Navigate to="/conversas" replace />} />
                <Route path="/conversas" element={<ConversasPage />} />
                <Route path="/conhecimento" element={<ConhecimentoPage />} />
                <Route path="/clientes" element={<ClientesPage />} />
                <Route path="/comprovantes" element={<ComprovantesPage />} />
                <Route path="/automacoes" element={<AutomacoesPage />} />
                <Route path="/metricas" element={<MetricasPage />} />
                <Route path="/configuracoes" element={<ConfiguracoesPage />} />
              </Routes>
            </DashboardShell>
          } 
        />
      </Routes>
    </div>
  );
}
