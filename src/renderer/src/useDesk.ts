import { useCallback, useEffect, useRef, useState } from 'react';
import type { DeskCommand, DeskResponse, DeskSnapshot } from '../../shared/types';
import { createDeskClient } from './client';

export function useDesk() {
  const client = useRef(createDeskClient());
  const seq = useRef(0);
  const [snapshot, setSnapshot] = useState<DeskSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const refresh = useCallback(async () => {
    const id = ++seq.current;
    try {
      const response = await client.current.handle({ type: 'getState' });
      if (id !== seq.current) return;
      setSnapshot(response.snapshot);
      if (!response.ok) setError(response.error);
    } catch (caught) {
      if (id !== seq.current) return;
      setError(caught instanceof Error ? caught.message : 'Could not reach Desk.');
    }
  }, []);

  const dispatch = useCallback(async (command: DeskCommand): Promise<DeskResponse | null> => {
    const id = ++seq.current;
    setPending(true);
    try {
      const response = await client.current.handle(command);
      if (id !== seq.current) return response;
      setSnapshot(response.snapshot);
      setError(response.ok ? null : response.error);
      return response;
    } catch (caught) {
      if (id !== seq.current) return null;
      setError(caught instanceof Error ? caught.message : 'Could not reach Desk.');
      return null;
    } finally {
      if (id === seq.current) setPending(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 3000);
    return () => clearInterval(timer);
  }, [refresh]);

  return { snapshot, error, pending, dispatch, refresh };
}
