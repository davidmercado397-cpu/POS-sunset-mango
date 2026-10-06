import { useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken, refreshAccessToken } from './api';

/**
 * Conexión en tiempo real con la sede. Cada evento invalida las consultas indicadas
 * y ejecuta `onEvent` (por ejemplo, para sonar una alerta).
 */
export function useBranchSocket(branchId: string | null, invalidate: QueryKey[], onEvent?: () => void) {
  const qc = useQueryClient();
  const [connected, setConnected] = useState(false);
  const handler = useRef(onEvent);
  handler.current = onEvent;
  const keys = useRef(invalidate);
  keys.current = invalidate;

  useEffect(() => {
    if (!branchId) return;
    const socket: Socket = io({
      path: '/api/socket.io',
      transports: ['websocket', 'polling'],
      auth: (cb) => cb({ token: getAccessToken(), branchId }),
    });
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', async (reason) => {
      setConnected(false);
      // El servidor cierra la conexión si el token expiró: se renueva y se reintenta.
      if (reason === 'io server disconnect') {
        await refreshAccessToken();
        setTimeout(() => socket.connect(), 1000);
      }
    });
    socket.on('kitchen:changed', () => {
      keys.current.forEach((key) => void qc.invalidateQueries({ queryKey: key }));
      handler.current?.();
    });
    return () => {
      socket.removeAllListeners();
      socket.disconnect();
    };
  }, [branchId, qc]);

  return connected;
}

/** Pitido corto con Web Audio (no requiere archivos de sonido). */
export function beep() {
  try {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 880;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.4);
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
    osc.onended = () => void ctx.close();
  } catch {
    /* el navegador bloqueó el audio */
  }
}
