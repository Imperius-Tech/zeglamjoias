import { motion } from 'framer-motion';
import { ConversationList } from '@/components/conversas/ConversationList';
import { ChatView } from '@/components/conversas/ChatView';
import { useDashboardStore } from '@/lib/store';

export default function ConversasPage() {
  const selectedId = useDashboardStore((s) => s.selectedConversationId);
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.5 }}
      className={`mobile-master-detail ${selectedId ? 'detail-active' : ''}`}
      style={{ display: 'flex', height: '100%' }}
    >
      <div className="master-pane" style={{ display: 'flex', minWidth: 0, flexShrink: 0 }}>
        <ConversationList />
      </div>
      <div className={`detail-pane ${selectedId ? '' : 'detail-empty'}`} style={{ display: 'flex', flex: 1, minWidth: 0 }}>
        <ChatView />
      </div>
    </motion.div>
  );
}
