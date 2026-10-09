import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Place } from "./places";

// Local previews may contain private spreadsheet notes. Never load them in a deployment.
export async function getLocalPlaces(): Promise<Place[]> {
  if (process.env.NODE_ENV !== "development") return [];
  try {
    const data: unknown = JSON.parse(
      await readFile(
        path.join(process.cwd(), ".local-data", "places.json"),
        "utf8",
      ),
    );
    if (
      !Array.isArray(data) ||
      !data.every(
        (p) =>
          p &&
          typeof p.id === "string" &&
          typeof p.name === "string" &&
          typeof p.region === "string",
      )
    ) {
      throw new Error("로컬 장소 데이터 형식이 올바르지 않습니다.");
    }
    return data as Place[];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}
