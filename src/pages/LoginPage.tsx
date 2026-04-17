import { useState } from 'react';
import { motion } from 'framer-motion';
import { Mail, Lock, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setErrorMsg('');
    
    // Faz o login real no Supabase
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

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
      padding: '0 20px',
    }}>
      {/* Efeito de Fundo - Anéis Minimalistas (Tema Joias) */}
      <div style={{
        position: 'absolute', top: '-20vh', right: '-10vw',
        width: '60vw', height: '60vw',
        minWidth: 600, minHeight: 600,
        borderRadius: '50%',
        border: '1px solid rgba(212, 175, 55, 0.06)',
        pointerEvents: 'none',
        zIndex: 0,
      }} />
      <div style={{
        position: 'absolute', bottom: '-20vh', left: '-10vw',
        width: '40vw', height: '40vw',
        minWidth: 400, minHeight: 400,
        borderRadius: '50%',
        border: '1px solid rgba(212, 175, 55, 0.04)',
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
          border: '1px solid var(--border)',
          borderRadius: 24,
          padding: '48px 40px',
          boxShadow: '0 24px 40px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255,255,255,0.05)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <img 
            src="/zeglam.png" 
            alt="Zeglam" 
            style={{ width: 64, height: 64, borderRadius: 16, marginBottom: 24, boxShadow: '0 8px 16px rgba(0,0,0,0.4)' }} 
          />
          <h1 style={{ fontSize: 24, fontWeight: 700, color: 'var(--strong-text)', letterSpacing: '-0.02em', marginBottom: 8 }}>
            Painel Zeglam
          </h1>
          <p style={{ color: 'var(--fg-muted)', fontSize: 14 }}>
            Faça login para gerenciar o atendimento da sua joalheria.
          </p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
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
            <a href="#" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 500 }}>
              Esqueceu a senha?
            </a>
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
        </form>
      </motion.div>
    </div>
  );
}
