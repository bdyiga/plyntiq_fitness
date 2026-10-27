import { useQuery } from "@tanstack/react-query";
import { api, ApiRequestError, queryKeys } from "./api";

/** Current athlete; `data` is null when signed out (401). */
export function useMe() {
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: async () => {
      try {
        return await api.me();
      } catch (err) {
        if (err instanceof ApiRequestError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}
