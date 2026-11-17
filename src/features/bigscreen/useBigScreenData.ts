import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { queryLibrary } from "../../lib/library-api";
import type { LibraryItem } from "../../lib/library-types";
import { useLibrarySummary, useStats } from "../library/useLibrary";
import { bigScreenCategorySpec, type BigScreenCategory } from "./bigscreenCategories";

export function useBigScreenData(category: BigScreenCategory, search = "") {
  const spec = bigScreenCategorySpec(category);
  const trimmedSearch = search.trim();
  const active = useQuery({
    queryKey: ["library", "big-screen", category, trimmedSearch],
    queryFn: () =>
      queryLibrary({
        search: trimmedSearch,
        status: spec.status,
        sort: spec.sort,
        page: 0,
        pageSize: trimmedSearch ? 80 : spec.favoriteOnly ? 200 : 80,
      }),
    placeholderData: keepPreviousData,
    staleTime: 3_000,
  });
  const summary = useLibrarySummary();
  const stats = useStats("week");

  const items = useMemo(() => {
    let list: LibraryItem[] = active.data?.items ?? [];
    if (spec.favoriteOnly) {
      list = list.filter((item) => item.favorite);
    }
    if (spec.playedOnly) {
      list = list.filter((item) => item.lastPlayedAt !== null);
    }
    return list;
  }, [active.data?.items, spec.favoriteOnly, spec.playedOnly]);

  return {
    active,
    summary,
    stats,
    items,
    libraryCount: summary.data?.total ?? 0,
    loading: active.isLoading,
    error: active.error,
    refetch: async () => {
      await Promise.all([active.refetch(), summary.refetch(), stats.refetch()]);
    },
  };
}
