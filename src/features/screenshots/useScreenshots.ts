import { useQuery } from "@tanstack/react-query";
import { listScreenshots } from "../../lib/screenshots-api";

export function useScreenshots(workId?: number) {
  return useQuery({
    queryKey: ["screenshots", workId ?? "all"],
    queryFn: () => listScreenshots(workId),
    staleTime: 10_000,
  });
}
