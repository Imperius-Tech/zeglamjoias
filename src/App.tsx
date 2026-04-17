import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { useDashboardStore } from '@/lib/store';
import ConversasPage from '@/pages/ConversasPage';
import ConhecimentoPage from '@/pages/ConhecimentoPage';
import ClientesPage from '@/pages/ClientesPage';
import ComprovantesPage from '@/pages/ComprovantesPage';
import ConfiguracoesPage from '@/pages/ConfiguracoesPage';
import PlaceholderPage from '@/pages/PlaceholderPage';
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
                <Route
                  path="/metricas"
                  element={
                    <PlaceholderPage
                      title="Métricas"
                      description="Em breve, acompanhe métricas de atendimento, taxa de resolução da IA, tempo de resposta e satisfação dos clientes."
                      icon="BarChart3"
                    />
                  }
                />
                <Route path="/configuracoes" element={<ConfiguracoesPage />} />
              </Routes>
            </DashboardShell>
          } 
        />
      </Routes>
    </div>
  );
}
