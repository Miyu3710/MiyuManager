import {
  keepPreviousData,
  useInfiniteQuery,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback } from "react";
import { listCollections, queryLibrary } from "../../lib/library-api";

export function useCollections() {
  return useQuery({
    queryKey: ["collections"],
    queryFn: listCollections,
    staleTime: 5_000,
  });
}

export function useCollectionItems(collectionId: number | null) {
  return useInfiniteQuery({
    queryKey: ["collection-items", collectionId],
    queryFn: ({ pageParam }) =>
      queryLibrary({
        search: "",
        status: "all",
        sort: "added_desc",
        page: pageParam,
        pageSize: 120,
        collectionId,
      }),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const loaded = lastPage.page * lastPage.pageSize + lastPage.items.length;
      return loaded < lastPage.total ? lastPage.page + 1 : undefined;
    },
    enabled: collectionId !== null,
    placeholderData: keepPreviousData,
    staleTime: 3_000,
  });
}

export function useInvalidateCollections() {
  const queryClient = useQueryClient();
  return useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["collections"] });
    void queryClient.invalidateQueries({ queryKey: ["collection-items"] });
    void queryClient.invalidateQueries({ queryKey: ["library"] });
    void queryClient.invalidateQueries({ queryKey: ["home-library"] });
    void queryClient.invalidateQueries({ queryKey: ["library-summary"] });
    void queryClient.invalidateQueries({ queryKey: ["stats"] });
  }, [queryClient]);
}
