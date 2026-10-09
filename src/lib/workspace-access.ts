import type { User } from "@supabase/supabase-js";
import type { Place } from "./places";

export type WorkspaceAccess =
  | { status: "checking" | "signed-out" | "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; user: User; places: Place[] };

export function createWorkspaceAccess(
  load: (id: string) => Promise<{ user: User; places: Place[] }>,
  publish: (state: WorkspaceAccess) => void,
) {
  let generation = 0;
  let identity: string | null = null;
  let disposed = false;
  return {
    async change(id: string | null) {
      if (disposed || (id && identity === id)) return;
      const revision = ++generation;
      identity = id;
      if (!id) {
        publish({ status: "signed-out" });
        return;
      }
      publish({ status: "loading" });
      try {
        const data = await load(id);
        if (disposed || generation !== revision) return;
        if (data.user.id !== id)
          throw Error("로그인 정보를 다시 확인해 주세요.");
        publish({ status: "ready", ...data });
      } catch {
        if (!disposed && generation === revision) {
          identity = null;
          publish({
            status: "error",
            message: "계정 정보를 불러오지 못했습니다. 다시 로그인해 주세요.",
          });
        }
      }
    },
    dispose() {
      disposed = true;
      generation++;
    },
  };
}
