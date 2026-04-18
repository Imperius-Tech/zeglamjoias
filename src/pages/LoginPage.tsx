import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mail, Lock, ArrowRight, Sun, Moon, ArrowLeft, CheckCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

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
    
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    setIsLoading(false);

    if (error) {
      setErrorMsg('E-mail ou senha incorretos.');
    } else {
      navigate('/conversas');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      // 1. Verificar se o usuário existe
      const { data: checkData, error: checkError } = await supabase.functions.invoke('check-user-exists', {
        body: { email },
      });

      if (checkError || !checkData) {
        throw new Error('Erro ao validar e-mail. Tente novamente.');
      }

      if (checkData.exists === false) {
        setErrorMsg('Este e-mail não está cadastrado em nossa base de dados.');
        setIsLoading(false);
        return;
      }

      // 2. Se existe, envia o reset
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/login`,
      });

      if (error) throw error;
      setSuccessMsg('E-mail de recuperação enviado! Verifique sua caixa de entrada.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao processar solicitação.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      padding: '0 20px',
      background: 'var(--page-bg)',
      transition: 'all 0.5s ease',
    }}>
      {/* Theme Toggle */}
      <div style={{ position: 'absolute', top: 40, right: 40, zIndex: 10 }}>
        <button
          onClick={toggleTheme}
          style={{
            width: 44, height: 44, borderRadius: 12,
            background: 'var(--surface)', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: 'var(--accent)', cursor: 'pointer',
            boxShadow: '0 8px 16px rgba(0,0,0,0.1)',
            transition: 'all 0.2s',
          }}
          onMouseOver={(e) => {
            e.currentTarget.style.transform = 'scale(1.05)';
            e.currentTarget.style.borderColor = 'var(--accent)';
          }}
          onMouseOut={(e) => {
            e.currentTarget.style.transform = 'scale(1)';
            e.currentTarget.style.borderColor = 'var(--border)';
          }}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={theme}
              initial={{ opacity: 0, rotate: -90, scale: 0.5 }}
              animate={{ opacity: 1, rotate: 0, scale: 1 }}
              exit={{ opacity: 0, rotate: 90, scale: 0.5 }}
              transition={{ duration: 0.2 }}
            >
              {theme === 'dark' ? <Sun size={20} /> : <Moon size={20} />}
            </motion.div>
          </AnimatePresence>
        </button>
      </div>

      {/* Background Effects */}
      <div style={{
        position: 'absolute', top: '-10vh', right: '-5vw',
        width: '50vw', height: '50vw',
        minWidth: 500, minHeight: 500,
        borderRadius: '50%',
        border: theme === 'dark' 
          ? '1px solid rgba(212, 175, 55, 0.1)' 
          : '1.5px solid rgba(184, 134, 11, 0.3)',
        boxShadow: theme === 'light' ? '0 0 30px rgba(184, 134, 11, 0.05)' : 'none',
        pointerEvents: 'none',
        zIndex: 0,
      }} />
      
      {theme === 'light' && (
        <>
          <div style={{
            position: 'absolute', top: '10%', right: '10%',
            width: '40vw', height: '40vw',
            background: 'radial-gradient(circle, rgba(212, 175, 55, 0.08) 0%, transparent 70%)',
            filter: 'blur(60px)',
            pointerEvents: 'none', zIndex: 0
          }} />
          <div style={{
            position: 'absolute', bottom: '10%', left: '5%',
            width: '30vw', height: '30vw',
            background: 'radial-gradient(circle, rgba(212, 175, 55, 0.05) 0%, transparent 70%)',
            filter: 'blur(50px)',
            pointerEvents: 'none', zIndex: 0
          }} />
        </>
      )}

      <div style={{
        position: 'absolute', top: '20vh', left: '-10vw',
        width: '35vw', height: '35vw',
        minWidth: 350, minHeight: 350,
        borderRadius: '50%',
        border: theme === 'dark' 
          ? '1px solid rgba(212, 175, 55, 0.08)' 
          : '1.2px solid rgba(184, 134, 11, 0.2)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />
      <div style={{
        position: 'absolute', bottom: '-15vh', right: '15vw',
        width: '25vw', height: '25vw',
        minWidth: 250, minHeight: 250,
        borderRadius: '50%',
        border: theme === 'dark' 
          ? '1px solid rgba(212, 175, 55, 0.05)' 
          : '1px solid rgba(184, 134, 11, 0.15)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
        style={{
          width: '100%',
          maxWidth: 420,
          background: 'var(--surface)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          border: theme === 'light' 
            ? '1.5px solid rgba(184, 134, 11, 0.35)' 
            : '1px solid var(--border)',
          borderRadius: 24,
          padding: '48px 40px',
          boxShadow: theme === 'light' 
            ? '0 20px 40px rgba(0, 0, 0, 0.08), 0 0 20px rgba(184, 134, 11, 0.05)'
            : '0 20px 40px rgba(0, 0, 0, 0.4)',
          position: 'relative',
          overflow: 'hidden',
          transition: 'all 0.3s ease',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <img 
            src="/zeglam.png" 
            alt="Zeglam" 
            style={{ 
              width: 64, height: 64, borderRadius: 16, marginBottom: 24, 
              boxShadow: theme === 'dark' ? '0 8px 16px rgba(0,0,0,0.4)' : '0 8px 16px rgba(0,0,0,0.1)' 
            }} 
          />
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--strong-text)', letterSpacing: '-0.02em', marginBottom: 8 }}>
            {view === 'login' ? 'Painel Zeglam' : 'Recuperar Senha'}
          </h1>
          <p style={{ color: 'var(--fg-muted)', fontSize: 14 }}>
            {view === 'login' 
              ? 'Faça login para gerenciar o atendimento da sua joalheria.'
              : 'Digite seu e-mail para receber um link de redefinição.'}
          </p>
        </div>

        <AnimatePresence mode="wait">
          {view === 'login' ? (
            <motion.form
              key="login-form"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              onSubmit={handleLogin}
              style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
            >
              <div style={{ position: 'relative' }}>
                <Mail size={18} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-subtle)' }} />
                <input
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{
                    width: '100%', height: 48, paddingLeft: 44, paddingRight: 16,
                    borderRadius: 12, background: 'var(--glass)', border: '1px solid var(--border)',
                    fontSize: 15, color: 'var(--strong-text)', outline: 'none', transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                />
              </div>

              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-subtle)' }} />
                <input
                  type="password"
                  placeholder="Senha"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  style={{
                    width: '100%', height: 48, paddingLeft: 44, paddingRight: 16,
                    borderRadius: 12, background: 'var(--glass)', border: '1px solid var(--border)',
                    fontSize: 15, color: 'var(--strong-text)', outline: 'none', transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -8 }}>
                <button
                  type="button"
                  onClick={() => setView('reset')}
                  style={{ background: 'none', border: 'none', fontSize: 13, color: 'var(--accent)', fontWeight: 500, cursor: 'pointer' }}
                >
                  Esqueceu a senha?
                </button>
              </div>

              {errorMsg && (
                <div style={{ color: '#ef4444', fontSize: 13, textAlign: 'center', marginTop: 8, fontWeight: 500 }}>
                  {errorMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                style={{
                  height: 48, width: '100%', borderRadius: 12, marginTop: 8,
                  background: 'linear-gradient(135deg, var(--accent), var(--accent-sec))',
                  color: '#000', fontSize: 15, fontWeight: 700, letterSpacing: '0.02em',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  border: 'none', cursor: isLoading ? 'wait' : 'pointer',
                  boxShadow: '0 8px 20px rgba(212, 175, 55, 0.25)',
                  transition: 'opacity 0.2s, transform 0.2s',
                  opacity: isLoading ? 0.7 : 1,
                }}
                onMouseOver={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
                onMouseOut={(e) => e.currentTarget.style.transform = 'none'}
              >
                {isLoading ? 'Entrando...' : 'Entrar'}
                {!isLoading && <ArrowRight size={18} />}
              </button>
            </motion.form>
          ) : (
            <motion.form
              key="reset-form"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onSubmit={handleResetPassword}
              style={{ display: 'flex', flexDirection: 'column', gap: 20 }}
            >
              <div style={{ position: 'relative' }}>
                <Mail size={18} style={{ position: 'absolute', left: 16, top: '50%', transform: 'translateY(-50%)', color: 'var(--fg-subtle)' }} />
                <input
                  type="email"
                  placeholder="Digite seu e-mail cadastrado"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  style={{
                    width: '100%', height: 48, paddingLeft: 44, paddingRight: 16,
                    borderRadius: 12, background: 'var(--glass)', border: '1px solid var(--border)',
                    fontSize: 15, color: 'var(--strong-text)', outline: 'none', transition: 'border-color 0.2s',
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'var(--accent)'}
                  onBlur={(e) => e.target.style.borderColor = 'var(--border)'}
                />
              </div>

              {errorMsg && (
                <div style={{ color: '#ef4444', fontSize: 13, textAlign: 'center', marginTop: 8, fontWeight: 500 }}>
                  {errorMsg}
                </div>
              )}

              {successMsg && (
                <div style={{ color: 'var(--accent)', fontSize: 13, textAlign: 'center', marginTop: 8, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <CheckCircle size={16} /> {successMsg}
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading || successMsg !== ''}
                style={{
                  height: 48, width: '100%', borderRadius: 12, marginTop: 8,
                  background: 'linear-gradient(135deg, var(--accent), var(--accent-sec))',
                  color: '#000', fontSize: 15, fontWeight: 700, letterSpacing: '0.02em',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  border: 'none', cursor: isLoading ? 'wait' : 'pointer',
                  boxShadow: '0 8px 20px rgba(212, 175, 55, 0.25)',
                  transition: 'opacity 0.2s, transform 0.2s',
                  opacity: (isLoading || successMsg !== '') ? 0.7 : 1,
                }}
                onMouseOver={(e) => { if (!isLoading && !successMsg) e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseOut={(e) => e.currentTarget.style.transform = 'none'}
              >
                {isLoading ? 'Enviando...' : successMsg ? 'E-mail enviado' : 'Enviar Link'}
                {!isLoading && !successMsg && <ArrowRight size={18} />}
              </button>

              <button
                type="button"
                onClick={() => { setView('login'); setErrorMsg(''); setSuccessMsg(''); }}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  background: 'none', border: 'none', color: 'var(--fg-muted)', fontSize: 14,
                  fontWeight: 500, cursor: 'pointer', marginTop: 10
                }}
              >
                <ArrowLeft size={16} /> Voltar para o login
              </button>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
