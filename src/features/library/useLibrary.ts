import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import {
  getAppInfo,
  getLibraryItem,
  queryLibrary,
  listLibraryRoots,
  listScanExclusions,
  listMonitors,
  listWorkSessions,
  getStats,
} from "../../lib/library-api";
import type { LibraryQuery, StatsPeriod } from "../../lib/library-types";

export function useLibraryInfinite(query: Omit<LibraryQuery, "page" | "pageSize">) {
  return useInfiniteQuery({
    queryKey: [
      "library",
      query.search,
      query.status,
      query.sort,
      query.favoriteOnly ?? false,
      query.collectionId ?? null,
    ],
    queryFn: ({ pageParam }) =>
      queryLibrary({
        ...query,
        page: pageParam,
        pageSize: 120,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const loaded = lastPage.page * lastPage.pageSize + lastPage.items.length;
      return loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
    placeholderData: keepPreviousData,
    staleTime: 3_000,
  });
}

export function useHomeLibrary() {
  return useQuery({
    queryKey: ["home-library"],
    queryFn: () =>
      queryLibrary({
        search: "",
        status: "all",
        sort: "added_desc",
        page: 0,
        pageSize: 12,
      }),
    staleTime: 3_000,
  });
}

function useLibrarySlice(
  query: Omit<LibraryQuery, "page" | "pageSize">,
  pageSize = 8,
  enabled = true,
) {
  return useQuery({
    queryKey: [
      "library-slice",
      query.search,
      query.status,
      query.sort,
      query.favoriteOnly ?? false,
      query.collectionId ?? null,
      pageSize,
    ],
    queryFn: () =>
      queryLibrary({
        ...query,
        page: 0,
        pageSize,
      }),
    enabled,
    staleTime: 3_000,
  });
}

export function useRecentPlayed(limit = 8) {
  return useLibrarySlice({ search: "", status: "all", sort: "last_played_desc" }, limit);
}

export function useRecentAdded(limit = 8) {
  return useLibrarySlice({ search: "", status: "all", sort: "added_desc" }, limit);
}

export function useFavoriteGames(limit = 8) {
  return useLibrarySlice(
    { search: "", status: "all", sort: "last_played_desc", favoriteOnly: true },
    limit,
  );
}

export function useQueuedGames(limit = 8) {
  return useLibrarySlice({ search: "", status: "queued", sort: "added_desc" }, limit);
}

export function useGlobalSearchResults(query: string) {
  const trimmed = query.trim();
  return useQuery({
    queryKey: ["global-search", trimmed],
    queryFn: () =>
      queryLibrary({
        search: trimmed,
        status: "all",
        sort: "last_played_desc",
        page: 0,
        pageSize: 8,
      }),
    enabled: trimmed.length > 0,
    staleTime: 5_000,
  });
}

export function useLibrarySummary() {
  return useQuery({
    queryKey: ["library-summary"],
    queryFn: () =>
      queryLibrary({
        search: "",
        status: "all",
        sort: "added_desc",
        page: 0,
        pageSize: 1,
      }),
    staleTime: 3_000,
  });
}

export function useLibraryDetail(id: string | undefined) {
  return useQuery({
    queryKey: ["library-detail", id],
    queryFn: () => getLibraryItem(id),
    enabled: Boolean(id),
    retry: false,
    staleTime: 3_000,
  });
}

export function useLibraryRoots() {
  return useQuery({
    queryKey: ["library-roots"],
    queryFn: listLibraryRoots,
    staleTime: 3_000,
  });
}

export function useAppInfo() {
  return useQuery({
    queryKey: ["app-info"],
    queryFn: getAppInfo,
    staleTime: 30_000,
  });
}

export function useMonitors() {
  return useQuery({
    queryKey: ["monitors"],
    queryFn: listMonitors,
    staleTime: 60_000,
  });
}

export function useWorkSessions(workId: number | undefined) {
  return useQuery({
    queryKey: ["work-sessions", workId],
    queryFn: () => listWorkSessions(workId as number),
    enabled: Number.isInteger(workId),
    staleTime: 1_000,
  });
}

export function useStats(period: StatsPeriod) {
  return useQuery({
    queryKey: ["stats", period],
    queryFn: () => getStats(period),
    placeholderData: keepPreviousData,
    staleTime: 3_000,
  });
}

export function useScanExclusions() {
  return useQuery({
    queryKey: ["scan-exclusions"],
    queryFn: listScanExclusions,
    staleTime: 3_000,
  });
}

export function useInvalidateLibrary() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["library"] });
    void queryClient.invalidateQueries({ queryKey: ["library-detail"] });
    void queryClient.invalidateQueries({ queryKey: ["home-library"] });
    void queryClient.invalidateQueries({ queryKey: ["library-slice"] });
    void queryClient.invalidateQueries({ queryKey: ["library-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["library-roots"] });
    void queryClient.invalidateQueries({ queryKey: ["app-info"] });
    void queryClient.invalidateQueries({ queryKey: ["scan-exclusions"] });
    void queryClient.invalidateQueries({ queryKey: ["work-sessions"] });
    void queryClient.invalidateQueries({ queryKey: ["stats"] });
  }, [queryClient]);
}
