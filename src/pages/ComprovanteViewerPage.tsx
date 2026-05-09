import { useEffect, useRef, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ZoomIn, ZoomOut, Maximize2, RotateCcw, ExternalLink } from 'lucide-react';

const MIN_SCALE = 0.5;
const MAX_SCALE = 8;
const ZOOM_STEP = 0.25;

export default function ComprovanteViewerPage() {
  const [params] = useSearchParams();
  const url = params.get('url') || '';
  const isPdf = /\.pdf(\?|$)/i.test(url);

  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const [imgSize, setImgSize] = useState<{ w: number; h: number } | null>(null);
  const dragStartRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.title = 'Comprovante · Zeglam';
    document.body.style.background = '#0a0a0a';
    document.body.style.margin = '0';
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.background = '';
      document.body.style.overflow = '';
    };
  }, []);

  const reset = useCallback(() => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  }, []);

  const fitToScreen = useCallback(() => {
    if (!imgSize || !containerRef.current) return;
    const cw = containerRef.current.clientWidth;
    const ch = containerRef.current.clientHeight;
    const s = Math.min(cw / imgSize.w, ch / imgSize.h, 1) * 0.95;
    setScale(s);
    setTranslate({ x: 0, y: 0 });
  }, [imgSize]);

  const zoomAt = useCallback((delta: number, clientX?: number, clientY?: number) => {
    setScale((prev) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, prev + delta));
      if (clientX != null && clientY != null && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const offsetX = clientX - rect.left - cx;
        const offsetY = clientY - rect.top - cy;
        const ratio = next / prev;
        setTranslate((t) => ({
          x: offsetX - (offsetX - t.x) * ratio,
          y: offsetY - (offsetY - t.y) * ratio,
        }));
      }
      return next;
    });
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(ZOOM_STEP * 2); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomAt(-ZOOM_STEP * 2); }
      else if (e.key === '0') { e.preventDefault(); reset(); }
      else if (e.key === 'f' || e.key === 'F') { e.preventDefault(); fitToScreen(); }
      else if (e.key === 'Escape') window.close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [zoomAt, reset, fitToScreen]);

  // Wheel zoom
  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
    zoomAt(delta, e.clientX, e.clientY);
  };

  // Pan via drag
  const onMouseDown = (e: React.MouseEvent) => {
    if (isPdf) return;
    setDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, tx: translate.x, ty: translate.y };
  };
  const onMouseMove = (e: React.MouseEvent) => {
    if (!dragging || !dragStartRef.current) return;
    setTranslate({
      x: dragStartRef.current.tx + (e.clientX - dragStartRef.current.x),
      y: dragStartRef.current.ty + (e.clientY - dragStartRef.current.y),
    });
  };
  const onMouseUp = () => { setDragging(false); dragStartRef.current = null; };

  // Double click to toggle zoom
  const onDoubleClick = (e: React.MouseEvent) => {
    if (isPdf) return;
    if (scale > 1.5) reset();
    else zoomAt(1.5, e.clientX, e.clientY);
  };

  if (!url) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#888', background: '#0a0a0a', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
        URL do comprovante não informada.
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: '#0a0a0a', overflow: 'hidden', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Toolbar superior */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 56, background: 'rgba(15,15,15,0.92)', backdropFilter: 'blur(8px)', borderBottom: '1px solid #1f1f1f', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 16px', zIndex: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#888', fontSize: 13, fontWeight: 600 }}>
          <span style={{ color: '#fbbf24', fontWeight: 800 }}>Zeglam</span>
          <span style={{ color: '#444' }}>·</span>
          <span>Comprovante</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {!isPdf && (
            <>
              <button onClick={() => zoomAt(-ZOOM_STEP * 2)} title="Diminuir zoom (−)" style={btn}>
                <ZoomOut size={16} />
              </button>
              <div style={{ minWidth: 60, textAlign: 'center', fontSize: 12, color: '#bbb', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {Math.round(scale * 100)}%
              </div>
              <button onClick={() => zoomAt(ZOOM_STEP * 2)} title="Aumentar zoom (+)" style={btn}>
                <ZoomIn size={16} />
              </button>
              <div style={{ width: 1, height: 24, background: '#2a2a2a', margin: '0 4px' }} />
              <button onClick={fitToScreen} title="Ajustar à tela (F)" style={btn}>
                <Maximize2 size={16} />
              </button>
              <button onClick={reset} title="Resetar (0)" style={btn}>
                <RotateCcw size={16} />
              </button>
              <div style={{ width: 1, height: 24, background: '#2a2a2a', margin: '0 4px' }} />
            </>
          )}
          <a href={url} target="_blank" rel="noopener noreferrer" title="Baixar / abrir original" style={{ ...btn, textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            <ExternalLink size={15} />
          </a>
        </div>
      </div>

      {/* Área de visualização */}
      <div
        ref={containerRef}
        onWheel={!isPdf ? onWheel : undefined}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        onDoubleClick={onDoubleClick}
        style={{
          position: 'absolute',
          top: 56,
          bottom: !isPdf ? 36 : 0,
          left: 0,
          right: 0,
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: isPdf ? 'default' : (dragging ? 'grabbing' : (scale > 1 ? 'grab' : 'zoom-in')),
          userSelect: 'none',
        }}
      >
        {isPdf ? (
          <iframe src={url} title="Comprovante PDF" style={{ width: '100%', height: '100%', border: 'none', background: '#fff' }} />
        ) : (
          <img
            src={url}
            alt="Comprovante"
            draggable={false}
            onLoad={(e) => {
              const el = e.target as HTMLImageElement;
              setImgSize({ w: el.naturalWidth, h: el.naturalHeight });
            }}
            style={{
              maxWidth: '95%',
              maxHeight: '95%',
              objectFit: 'contain',
              transform: `translate(${translate.x}px, ${translate.y}px) scale(${scale})`,
              transformOrigin: 'center center',
              transition: dragging ? 'none' : 'transform 0.12s ease-out',
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
              borderRadius: 6,
              background: '#fff',
              willChange: 'transform',
              pointerEvents: 'auto',
            }}
          />
        )}
      </div>

      {/* Dicas inferiores */}
      {!isPdf && (
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 36, background: 'rgba(15,15,15,0.88)', backdropFilter: 'blur(8px)', borderTop: '1px solid #1f1f1f', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, fontSize: 11, color: '#666', zIndex: 10 }}>
          <span><kbd style={kbd}>scroll</kbd> zoom</span>
          <span><kbd style={kbd}>arrastar</kbd> mover</span>
          <span><kbd style={kbd}>duplo-clique</kbd> alterna 1x ↔ 2.5x</span>
          <span><kbd style={kbd}>+ −</kbd> zoom</span>
          <span><kbd style={kbd}>F</kbd> ajustar</span>
          <span><kbd style={kbd}>0</kbd> reset</span>
          <span><kbd style={kbd}>Esc</kbd> fechar</span>
        </div>
      )}
    </div>
  );
}

const btn: React.CSSProperties = {
  width: 34, height: 34, borderRadius: 8, background: '#1a1a1a', border: '1px solid #2a2a2a',
  color: '#bbb', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
};

const kbd: React.CSSProperties = {
  background: '#1f1f1f', border: '1px solid #2f2f2f', borderRadius: 4, padding: '1px 6px',
  fontSize: 10, color: '#aaa', fontFamily: 'ui-monospace, monospace', marginRight: 4,
};
