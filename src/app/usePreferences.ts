import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getPreferences } from "../lib/app-api";

export function usePreferences() {
  return useQuery({
    queryKey: ["preferences"],
    queryFn: getPreferences,
    staleTime: 30_000,
  });
}

export function useInvalidatePreferences() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ["preferences"] });
}
