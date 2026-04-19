import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { Mail, Lock, ArrowRight, Sun, Moon, ArrowLeft, Sparkles, ShieldCheck, Zap } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

// --- Background Component ---
function LiquidGoldBackground({ theme }: { theme: 'dark' | 'light' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let time = 0;

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    const draw = () => {
      time += 0.003;
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      const drawLayer = (color: string, scale: number, opacity: number, speedMult: number) => {
        ctx.globalAlpha = opacity;
        for (let i = 0; i < 4; i++) {
          const x = canvas.width * (0.5 + Math.cos(time * speedMult * (1 + i * 0.1) + i) * 0.4 * scale);
          const y = canvas.height * (0.5 + Math.sin(time * speedMult * (0.8 + i * 0.15) + i * 2) * 0.4 * scale);
          const radius = Math.min(canvas.width, canvas.height) * (0.5 + i * 0.1) * scale;

          const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
          gradient.addColorStop(0, color);
          gradient.addColorStop(1, 'transparent');
          ctx.fillStyle = gradient;
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
      };

      if (theme === 'dark') {
        drawLayer('rgba(212, 175, 55, 0.12)', 1.3, 0.7, 1);
        drawLayer('rgba(255, 215, 0, 0.08)', 1.0, 0.5, 1.2);
        drawLayer('rgba(11, 12, 16, 0.9)', 1.8, 0.6, 0.5);
      } else {
        drawLayer('rgba(212, 175, 55, 0.08)', 1.2, 0.3, 0.8);
        drawLayer('rgba(255, 255, 255, 0.8)', 1.5, 0.9, 0.5);
      }

      animationFrameId = requestAnimationFrame(draw);
    };

    window.addEventListener('resize', resize);
    resize();
    draw();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [theme]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute', inset: 0, zIndex: 0, pointerEvents: 'none', filter: 'blur(60px)',
      }}
    />
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<'login' | 'reset'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(
    (document.documentElement.getAttribute('data-theme') as 'light' | 'dark') || 'dark'
  );

  const mouseX = useMotionValue(0);
  const mouseY = useMotionValue(0);
  const springX = useSpring(mouseX, { damping: 40, stiffness: 80 });
  const springY = useSpring(mouseY, { damping: 40, stiffness: 80 });

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      mouseX.set((e.clientX / window.innerWidth) - 0.5);
      mouseY.set((e.clientY / window.innerHeight) - 0.5);
    };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, [mouseX, mouseY]);

  const toggleTheme = () => {
    const newTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('zeglam_theme', newTheme);
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setIsLoading(false);
    if (error) setErrorMsg('E-mail ou senha incorretos.');
    else navigate('/conversas');
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');
    try {
      const { data: checkData, error: checkError } = await supabase.functions.invoke('check-user-exists', { body: { email } });
      if (checkError || !checkData || !checkData.exists) {
        setErrorMsg('E-mail não cadastrado em nossa base.');
        return;
      }
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/login` });
      if (error) throw error;
      setSuccessMsg('E-mail de recuperação enviado!');
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao processar.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      height: '100vh', width: '100vw', display: 'flex', alignItems: 'center', justifyContent: 'center',
      position: 'relative', background: theme === 'dark' ? '#07080a' : '#f8fafc',
      overflow: 'hidden', padding: 20,
    }}>
      <LiquidGoldBackground theme={theme} />

      {/* Galaga-inspired Minimalist Grid */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
        perspective: '1000px', overflow: 'hidden'
      }}>
        <div style={{
          position: 'absolute', bottom: '-50%', left: '-50%', right: '-50%', height: '200%',
          backgroundImage: `
            linear-gradient(to right, ${theme === 'dark' ? 'rgba(212, 175, 55, 0.05)' : 'rgba(184, 134, 11, 0.12)'} 1px, transparent 1px),
            linear-gradient(to bottom, ${theme === 'dark' ? 'rgba(212, 175, 55, 0.05)' : 'rgba(184, 134, 11, 0.12)'} 1px, transparent 1px)
          `,
          backgroundSize: '60px 60px',
          transform: 'rotateX(60deg)',
          maskImage: 'linear-gradient(to top, black, transparent)',
          WebkitMaskImage: 'linear-gradient(to top, black, transparent)',
          opacity: 0.8,
        }} />
      </div>

      {/* Grid Pattern Overlay (Twinkling Stars / Particles) */}
      <div style={{
        position: 'absolute', inset: 0, opacity: theme === 'dark' ? 0.05 : 0.1,
        backgroundImage: theme === 'dark' 
          ? 'radial-gradient(white 1px, transparent 1px)' 
          : 'radial-gradient(rgba(184, 134, 11, 0.4) 1px, transparent 1px)',
        backgroundSize: '50px 50px', pointerEvents: 'none', zIndex: 1
      }} />

      {/* Main Centered Container */}
      <div style={{
        display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        gap: 80, width: '100%', maxWidth: 1200, zIndex: 10, position: 'relative',
        flexWrap: 'wrap'
      }}>
        {/* Left Side: Branding & Experience */}
        <div style={{
          flex: '1 1 400px', display: 'flex', flexDirection: 'column',
          justifyContent: 'center', zIndex: 10,
        }}>
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 1, ease: [0.16, 1, 0.3, 1] }}
          >
            <img src="/zeglam.png" alt="Zeglam" style={{ width: 80, height: 80, borderRadius: 20, marginBottom: 32, boxShadow: '0 20px 40px rgba(0,0,0,0.3)' }} />
            <h2 style={{ fontSize: 40, fontWeight: 900, color: 'var(--strong-text)', letterSpacing: '-0.04em', lineHeight: 1.1, marginBottom: 20 }}>
              Excelência em cada <br /> 
              <span style={{ color: 'var(--accent)', transition: 'color 0.5s' }}>detalhe digital.</span>
            </h2>
            <p style={{ fontSize: 16, color: 'var(--fg-muted)', maxWidth: 440, lineHeight: 1.6, fontWeight: 400 }}>
              A plataforma de gestão inteligente que transforma o atendimento da sua joalheria em uma experiência de luxo.
            </p>

            <div style={{ display: 'flex', gap: 24, marginTop: 40 }}>
              {[
                { icon: ShieldCheck, label: 'Segurança' },
                { icon: Zap, label: 'Velocidade' },
                { icon: Sparkles, label: 'IA Pura' }
              ].map((item, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, color: 'var(--fg-muted)' }}>
                  <item.icon size={18} style={{ color: 'var(--accent)' }} />
                  <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>{item.label}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        {/* Right Side: Login Form */}
        <div style={{
          flex: '0 0 460px', display: 'flex', alignItems: 'center',
          justifyContent: 'center', zIndex: 20, position: 'relative',
        }}>
          <motion.div
            style={{
              translateX: useTransform(springX, (v) => v * 5),
              translateY: useTransform(springY, (v) => v * 5),
              width: '100%',
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.98, x: 20 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              transition={{ duration: 0.8, delay: 0.2 }}
              style={{
                background: theme === 'dark' ? 'rgba(15, 17, 23, 0.6)' : 'rgba(255, 255, 255, 0.7)',
                backdropFilter: 'blur(40px) saturate(180%)',
                border: `1px solid ${theme === 'dark' ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}`,
                borderRadius: 32, padding: '64px 56px',
                boxShadow: theme === 'dark' ? '0 40px 100px rgba(0,0,0,0.6)' : '0 40px 100px rgba(0,0,0,0.05)',
                position: 'relative', overflow: 'hidden'
              }}
            >
              {/* Top Shine */}
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: 'linear-gradient(90deg, transparent, var(--accent), transparent)', opacity: 0.4 }} />

              <AnimatePresence mode="wait">
                {view === 'login' ? (
                  <motion.div
                    key="login-view"
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div style={{ marginBottom: 40 }}>
                      <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--strong-text)', letterSpacing: '-0.02em', marginBottom: 8 }}>Acesse sua conta</h1>
                      <p style={{ color: 'var(--fg-muted)', fontSize: 14, fontWeight: 500 }}>Informe seus dados para entrar no sistema.</p>
                    </div>

                    <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--fg-faint)', letterSpacing: '0.1em' }}>E-MAIL</label>
                        <div style={{ position: 'relative' }}>
                          <Mail size={18} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-faint)' }} />
                          <input
                            type="email" placeholder="email@exemplo.com" value={email}
                            onChange={(e) => setEmail(e.target.value)} required
                            style={{
                              width: '100%', height: 52, paddingLeft: 48, borderRadius: 14,
                              background: 'rgba(0,0,0,0.05)', border: '1px solid var(--border)',
                              fontSize: 15, color: 'var(--strong-text)', outline: 'none', transition: 'all 0.3s'
                            }}
                            onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 15px var(--accent)22'; }}
                            onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                          />
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--fg-faint)', letterSpacing: '0.1em' }}>SENHA</label>
                          <button type="button" onClick={() => setView('reset')} style={{ fontSize: 11, color: 'var(--accent)', fontWeight: 700 }}>Esqueceu a senha?</button>
                        </div>
                        <div style={{ position: 'relative' }}>
                          <Lock size={18} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-faint)' }} />
                          <input
                            type="password" placeholder="••••••••" value={password}
                            onChange={(e) => setPassword(e.target.value)} required
                            style={{
                              width: '100%', height: 52, paddingLeft: 48, borderRadius: 14,
                              background: 'rgba(0,0,0,0.05)', border: '1px solid var(--border)',
                              fontSize: 15, color: 'var(--strong-text)', outline: 'none', transition: 'all 0.3s'
                            }}
                            onFocus={(e) => { e.target.style.borderColor = 'var(--accent)'; e.target.style.boxShadow = '0 0 15px var(--accent)22'; }}
                            onBlur={(e) => { e.target.style.borderColor = 'var(--border)'; e.target.style.boxShadow = 'none'; }}
                          />
                        </div>
                      </div>

                      {errorMsg && <p style={{ color: '#fb7185', fontSize: 13, textAlign: 'center', fontWeight: 600 }}>{errorMsg}</p>}

                      <button
                        type="submit" disabled={isLoading}
                        style={{
                          height: 56, width: '100%', borderRadius: 14, marginTop: 8,
                          background: 'var(--accent)', color: '#000', fontSize: 16, fontWeight: 800,
                          border: 'none', cursor: isLoading ? 'wait' : 'pointer',
                          boxShadow: '0 12px 24px rgba(212, 175, 55, 0.3)',
                          transition: 'all 0.3s cubic-bezier(0.16,1,0.3,1)',
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                        onMouseLeave={(e) => e.currentTarget.style.transform = 'none'}
                      >
                        {isLoading ? 'Entrando...' : 'Entrar no Sistema'}
                      </button>
                    </form>
                  </motion.div>
                ) : (
                  <motion.div
                    key="reset-view"
                    initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.3 }}
                  >
                    <div style={{ marginBottom: 40 }}>
                      <h1 style={{ fontSize: 28, fontWeight: 800, color: 'var(--strong-text)', letterSpacing: '-0.02em', marginBottom: 8 }}>Recuperar Acesso</h1>
                      <p style={{ color: 'var(--fg-muted)', fontSize: 14, fontWeight: 500 }}>Enviaremos um link de recuperação para seu e-mail.</p>
                    </div>

                    <form onSubmit={handleResetPassword} style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        <label style={{ fontSize: 11, fontWeight: 800, color: 'var(--fg-faint)', letterSpacing: '0.1em' }}>E-MAIL</label>
                        <div style={{ position: 'relative' }}>
                          <Mail size={18} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-faint)' }} />
                          <input
                            type="email" placeholder="seu-email@joalheria.com" value={email}
                            onChange={(e) => setEmail(e.target.value)} required
                            style={{
                              width: '100%', height: 52, paddingLeft: 48, borderRadius: 14,
                              background: 'rgba(0,0,0,0.05)', border: '1px solid var(--border)',
                              fontSize: 15, color: 'var(--strong-text)', outline: 'none', transition: 'all 0.3s'
                            }}
                          />
                        </div>
                      </div>

                      {errorMsg && <p style={{ color: '#fb7185', fontSize: 13, textAlign: 'center', fontWeight: 600 }}>{errorMsg}</p>}
                      {successMsg && <p style={{ color: 'var(--accent)', fontSize: 13, textAlign: 'center', fontWeight: 600 }}>{successMsg}</p>}

                      <button
                        type="submit" disabled={isLoading || !!successMsg}
                        style={{
                          height: 56, width: '100%', borderRadius: 14, marginTop: 8,
                          background: 'var(--accent)', color: '#000', fontSize: 16, fontWeight: 800,
                          border: 'none', cursor: isLoading ? 'wait' : 'pointer',
                          boxShadow: '0 12px 24px rgba(212, 175, 55, 0.3)',
                        }}
                      >
                        {isLoading ? 'Enviando...' : successMsg ? 'E-mail Enviado' : 'Recuperar Senha'}
                      </button>

                      <button
                        type="button" onClick={() => { setView('login'); setErrorMsg(''); setSuccessMsg(''); }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--fg-muted)', fontSize: 14, fontWeight: 600 }}
                      >
                        <ArrowLeft size={16} /> Voltar ao Login
                      </button>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          </motion.div>
        </div>
      </div>

      {/* Controls */}
      <div style={{ position: 'absolute', bottom: 40, right: 40, display: 'flex', gap: 16, zIndex: 100 }}>
        <button
          onClick={toggleTheme}
          style={{
            width: 44, height: 44, borderRadius: 12, background: 'var(--surface)',
            border: '1px solid var(--border)', color: 'var(--accent)', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </div>
    </div>
  );
}
