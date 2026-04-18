import { useCallback, useRef } from 'react';
import { getSettings } from '@/lib/storage';

const SOUNDS = {
  default: 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3', // Soft bell
  elegant: 'https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3', // Simple chime
  modern: 'https://assets.mixkit.co/active_storage/sfx/2361/2361-preview.mp3',  // Digital beep
};

export function useSoundEffects() {
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const playNotification = useCallback(async () => {
    const settings = await getSettings();
    const notifySettings = settings.notifications;

    if (!notifySettings.sound) return;

    const soundUrl = SOUNDS[notifySettings.incomingSound] || SOUNDS.default;
    
    if (!audioRef.current) {
      audioRef.current = new Audio(soundUrl);
    } else {
      audioRef.current.src = soundUrl;
    }

    audioRef.current.volume = notifySettings.soundVolume || 0.5;
    
    try {
      await audioRef.current.play();
    } catch (err) {
      console.warn('Falha ao reproduzir áudio (interação do usuário necessária?):', err);
    }
  }, []);

  const testSound = useCallback(async (type: keyof typeof SOUNDS, volume: number) => {
    try {
      const soundUrl = SOUNDS[type];
      console.log('Testando som:', type, 'URL:', soundUrl, 'Volume:', volume);
      const audio = new Audio(soundUrl);
      audio.volume = volume;
      
      // Ensure it's loaded before playing
      await audio.play();
    } catch (err) {
      console.error('Erro ao testar som:', err);
      // Fallback simple beep if CDN fails? No, better to just log for now.
    }
  }, []);

  return { playNotification, testSound };
}
