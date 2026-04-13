import { motion } from 'framer-motion';
import { ConversationList } from '@/components/conversas/ConversationList';
import { ChatView } from '@/components/conversas/ChatView';

export default function ConversasPage() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }}
      style={{ display: 'flex', height: '100%' }}>
      <ConversationList />
      <ChatView />
    </motion.div>
  );
}
