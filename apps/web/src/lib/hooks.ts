import { useMutation, useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from '../components/toast';
import { api } from './api';

/** GET con caché. */
export function useApi<T>(key: QueryKey, path: string | null, options: { refetchInterval?: number } = {}) {
  return useQuery<T>({
    queryKey: key,
    queryFn: () => api<T>(path!),
    enabled: !!path,
    ...options,
  });
}

/** Mutación que invalida claves de caché y muestra un aviso. */
export function useApiMutation<TVars, TResult = unknown>(
  fn: (vars: TVars) => Promise<TResult>,
  { invalidate = [], success }: { invalidate?: QueryKey[]; success?: string } = {},
) {
  const qc = useQueryClient();
  return useMutation<TResult, Error, TVars>({
    mutationFn: fn,
    onSuccess: async () => {
      await Promise.all(invalidate.map((key) => qc.invalidateQueries({ queryKey: key })));
      if (success) toast.success(success);
    },
    onError: (err) => toast.error(err),
  });
}
