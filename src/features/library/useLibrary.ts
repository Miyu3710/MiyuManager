import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { getAppInfo, getLibraryItem, queryLibrary, listLibraryRoots } from "../../lib/library-api";
import type { LibraryQuery } from "../../lib/library-types";

export function useLibraryInfinite(query: Omit<LibraryQuery, "page" | "pageSize">) {
  return useInfiniteQuery({
    queryKey: ["library", query.search, query.status, query.sort],
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

export function useInvalidateLibrary() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["library"] });
    void queryClient.invalidateQueries({ queryKey: ["home-library"] });
    void queryClient.invalidateQueries({ queryKey: ["library-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["library-roots"] });
    void queryClient.invalidateQueries({ queryKey: ["app-info"] });
  }, [queryClient]);
}
