import { useState, useRef, useEffect } from 'react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion } from 'framer-motion';
import { FileText, Check, CheckCheck, AlertCircle, Clock, Reply, Copy, ChevronDown, CreditCard, Image } from 'lucide-react';
import type { Message } from '@/lib/mock-data';

function StatusIcon({ status }: { status?: Message['status'] }) {
  if (!status) return null;
  if (status === 'read') return <CheckCheck size={14} style={{ color: '#53bdeb' }} />;
  if (status === 'delivered') return <CheckCheck size={14} style={{ color: 'var(--fg-faint)' }} />;
  if (status === 'sent') return <Check size={14} style={{ color: 'var(--fg-faint)' }} />;
  if (status === 'error') return <AlertCircle size={12} style={{ color: 'var(--red)' }} />;
  return <Clock size={12} style={{ color: 'var(--fg-faint)' }} />;
}

interface MessageBubbleProps {
  message: Message;
  quotedMessage?: Message | null;
  onReply?: (msg: Message) => void;
}

export function MessageBubble({ message: m, quotedMessage, onReply }: MessageBubbleProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const handleCopy = () => {
    navigator.clipboard.writeText(m.content);
    setMenuOpen(false);
  };

  const handleReply = () => {
    onReply?.(m);
    setMenuOpen(false);
  };

  if (m.author === 'sistema') {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} style={{ display: 'flex', justifyContent: 'center', padding: '8px 0' }}>
        <span style={{ padding: '4px 12px', borderRadius: 999, background: 'var(--glass)', border: '1px solid var(--border)', fontSize: 11, color: 'var(--fg-subtle)' }}>
          {m.content}
        </span>
      </motion.div>
    );
  }

  const isClient = m.author === 'cliente';
  const isAI = m.sentBy === 'ai';
  const isDraft = m.isDraft;
  const isSticker = m.mediaType === 'sticker';
  
  const contentLower = (m.content || '').toLowerCase();
  const isMediaOnly = [
    '[midia]', '[mídia]', '[sticker]', '[audio]', '[áudio]', '[video]', '[vídeo]', '[mensagem]'
  ].includes(contentLower);

  const isVideo = m.mediaType === 'video' || 
                 (m.mediaUrl && /\.(mp4|mov|webm|ogg|avi)$/i.test(m.mediaUrl));
  const isAudio = m.mediaType === 'audio' || 
                 (m.mediaUrl && /\.(mp3|wav|ogg|m4a|aac|opus)$/i.test(m.mediaUrl)) ||
                 contentLower === '[audio]' || contentLower === '[áudio]';
  const isImage = m.mediaType === 'image' || 
                 (m.mediaUrl && /\.(jpg|jpeg|png|gif|webp)$/i.test(m.mediaUrl));

  const contextMenu = (
    <div ref={menuRef} style={{ position: 'relative', display: 'inline-flex' }}>
      <button
        onClick={() => setMenuOpen(!menuOpen)}
        style={{
          padding: 2, borderRadius: 4, background: 'none', border: 'none',
          color: 'var(--fg-faint)', cursor: 'pointer', opacity: 0,
          transition: 'opacity 0.15s',
        }}
        className="msg-menu-btn"
      >
        <ChevronDown size={14} />
      </button>
      {menuOpen && (
        <div style={{
          position: 'absolute', top: '100%', zIndex: 50,
          ...(isClient ? { left: 0 } : { right: 0 }),
          marginTop: 4, minWidth: 160, padding: 4, borderRadius: 10,
          background: 'var(--surface-2)', border: '1px solid var(--border-strong)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
        }}>
          <button onClick={handleReply} style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            padding: '8px 12px', borderRadius: 6, fontSize: 13, color: 'var(--fg-dim)',
            background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <Reply size={14} /> Responder
          </button>
          <button onClick={handleCopy} style={{
            display: 'flex', alignItems: 'center', gap: 10, width: '100%',
            padding: '8px 12px', borderRadius: 6, fontSize: 13, color: 'var(--fg-dim)',
            background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
          }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--hover)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <Copy size={14} /> Copiar
          </button>
        </div>
      )}
    </div>
  );

  // Quoted message preview
  const quotedPreview = quotedMessage ? (
    <div
      style={{
        padding: '6px 10px', marginBottom: 6, borderRadius: 6,
        borderLeft: `3px solid ${quotedMessage.author === 'cliente' ? 'var(--fg-subtle)' : 'var(--emerald)'}`,
        background: 'var(--glass)', cursor: 'pointer',
      }}
    >
      <p style={{ fontSize: 10, fontWeight: 600, color: quotedMessage.author === 'cliente' ? 'var(--fg-muted)' : 'var(--emerald-light)', marginBottom: 2 }}>
        {quotedMessage.author === 'cliente' ? 'Cliente' : 'Você'}
      </p>
      <p style={{ fontSize: 12, color: 'var(--fg-subtle)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>
        {quotedMessage.content}
      </p>
    </div>
  ) : null;

  // Sticker render
  if (isSticker && m.mediaUrl) {
    return (
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
        style={{ display: 'flex', justifyContent: isClient ? 'flex-start' : 'flex-end' }}
        className="msg-row"
      >
        <div style={{ display: 'flex', alignItems: isClient ? 'flex-start' : 'flex-end', gap: 4 }}>
          {!isClient && contextMenu}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: isClient ? 'flex-start' : 'flex-end' }}>
            <img src={m.mediaUrl} alt="Sticker" style={{ width: 128, height: 128, objectFit: 'contain' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, paddingLeft: 4 }}>
              <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>
                {format(m.timestamp, 'HH:mm', { locale: ptBR })}
              </span>
              {!isClient && <StatusIcon status={m.status} />}
            </div>
          </div>
          {isClient && contextMenu}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      style={{ display: 'flex', justifyContent: isClient ? 'flex-start' : 'flex-end' }}
      className="msg-row"
    >
      <div style={{ maxWidth: '75%', display: 'flex', alignItems: 'flex-start', gap: 4 }}>
        {!isClient && contextMenu}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: isClient ? 'flex-start' : 'flex-end' }}>
          {!isClient && (
            <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: isAI ? 'var(--accent)' : 'var(--emerald-light)', marginBottom: 4, paddingLeft: 4 }}>
              {isAI ? (isDraft ? 'IA · Rascunho' : 'IA') : 'Zevaldo'}
            </span>
          )}
          <div style={{
            padding: '10px 16px',
            borderRadius: isClient ? '16px 16px 16px 4px' : '16px 16px 4px 16px',
            fontSize: 14, lineHeight: 1.6, color: 'var(--fg-dim)',
            background: isClient ? 'var(--glass-strong)' : isAI ? 'rgba(255,77,0,0.08)' : 'rgba(16,185,129,0.08)',
            border: isClient ? 'none' : `1px ${isDraft ? 'dashed' : 'solid'} ${isAI ? 'var(--accent-border)' : 'rgba(16,185,129,0.2)'}`,
            opacity: isDraft ? 0.7 : 1,
          }}>
            {/* Imagem / Sticker */}
            {m.mediaUrl && (isImage || isSticker) && (
              <div style={{ marginBottom: !isMediaOnly ? 8 : 0 }}>
                <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
                  <img src={m.mediaUrl} alt="Mídia" style={{ maxWidth: '100%', maxHeight: 240, borderRadius: 8, display: 'block' }} />
                </a>
              </div>
            )}

            {/* Vídeo */}
            {m.mediaUrl && isVideo && (
              <div style={{ marginBottom: !isMediaOnly ? 8 : 0, width: '100%', minWidth: 240 }}>
                <video 
                  src={m.mediaUrl} 
                  controls 
                  style={{ width: '100%', maxHeight: 300, borderRadius: 8, background: '#000' }}
                />
              </div>
            )}

            {/* Áudio */}
            {m.mediaUrl && isAudio && (
              <div style={{ marginBottom: !isMediaOnly ? 8 : 0, minWidth: 240 }}>
                <audio 
                  src={m.mediaUrl} 
                  controls 
                  style={{ width: '100%', height: 40 }}
                />
              </div>
            )}

            {/* Documento (Se não for vídeo/áudio/imagem já tratado) */}
            {m.mediaUrl && m.mediaType === 'document' && !isVideo && !isAudio && !isImage && (
              <div style={{ marginBottom: !isMediaOnly ? 8 : 0 }}>
                <a href={m.mediaUrl} target="_blank" rel="noopener noreferrer"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 12px', borderRadius: 8,
                    background: 'var(--glass-strong)', textDecoration: 'none',
                  }}
                >
                  <FileText size={18} style={{ color: 'var(--fg-subtle)', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--fg-dim)' }}>{m.content.length > 20 ? 'Documento' : m.content}</span>
                </a>
              </div>
            )}

            {/* Análise de Mídia (Comprovantes, etc) */}
            {m.mediaUrl && m.mediaAnalysis && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 4,
                marginBottom: 8, padding: '3px 8px', borderRadius: 6,
                background: m.mediaAnalysis.is_payment_proof ? 'rgba(16,185,129,0.12)' : 'var(--glass)',
                border: `1px solid ${m.mediaAnalysis.is_payment_proof ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
              }}>
                {m.mediaAnalysis.is_payment_proof ? <CreditCard size={10} style={{ color: 'var(--emerald)' }} /> : <Image size={10} style={{ color: 'var(--fg-subtle)' }} />}
                <span style={{ fontSize: 9, fontWeight: 600, color: m.mediaAnalysis.is_payment_proof ? 'var(--emerald-light)' : 'var(--fg-subtle)' }}>
                  {m.mediaAnalysis.is_payment_proof ? 'Comprovante' : m.mediaAnalysis.description || m.mediaAnalysis.type || 'Análise de Mídia'}
                </span>
                {m.mediaAnalysis.payment_value && (
                  <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--emerald-light)' }}> · {m.mediaAnalysis.payment_value}</span>
                )}
              </div>
            )}

            {!isMediaOnly && m.content && m.content}
            {isMediaOnly && !m.mediaUrl && (
              <span style={{ fontStyle: 'italic', color: 'var(--fg-muted)', fontSize: 13 }}>
                {isAudio ? '🎵 Mensagem de áudio' : isVideo ? '🎥 Vídeo' : '📎 Arquivo de mídia (carregando...)'}
              </span>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2, paddingLeft: 4 }}>
            <span style={{ fontSize: 10, color: 'var(--fg-faint)' }}>
              {format(m.timestamp, 'HH:mm', { locale: ptBR })}
            </span>
            {!isClient && <StatusIcon status={m.status} />}
          </div>
        </div>
        {isClient && contextMenu}
      </div>
    </motion.div>
  );
}
