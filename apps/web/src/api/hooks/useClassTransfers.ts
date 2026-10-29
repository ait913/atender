import { useMutation, useQueryClient } from "@tanstack/react-query";
import type { ClassTransferCreateInput, ClassTransferDeleteResponse, ClassTransferResponse } from "@atender/shared";
import { api } from "@/api/client";

function invalidateClassTransferViews(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["day"] });
  queryClient.invalidateQueries({ queryKey: ["semesters"] });
  queryClient.invalidateQueries({ queryKey: ["stats"] });
  queryClient.invalidateQueries({ queryKey: ["today"] });
  queryClient.invalidateQueries({ queryKey: ["timetable-suspensions"] });
}

export function useCreateClassTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: ClassTransferCreateInput) =>
      api<ClassTransferResponse>("/api/class-transfers", { method: "POST", body }),
    onSuccess: () => invalidateClassTransferViews(queryClient),
  });
}

export function useDeleteClassTransfer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api<ClassTransferDeleteResponse>(`/api/class-transfers/${id}`, { method: "DELETE" }),
    onSuccess: () => invalidateClassTransferViews(queryClient),
  });
}
