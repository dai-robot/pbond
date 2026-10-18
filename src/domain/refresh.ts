/** 他の利用者の更新を画面へ載せるかどうか。古い応答と、送信中の操作は載せない。 */
export function decideRefresh(input: { ticket: number; epoch: number; pending: boolean; seenRevision: number; status: number | "network"; revision?: number }): "adopt" | "ignore" | "logout" | "retry" {
  if (input.ticket !== input.epoch) return "ignore";
  if (input.status === "network") return "retry";
  if (input.status === 401) return "logout";
  if (input.status !== 200) return "retry";
  if (input.pending) return "ignore";
  if (typeof input.revision !== "number" || input.revision < input.seenRevision) return "ignore";
  return "adopt";
}
