import Workspace from "@/components/workspace";
import { getLocalPlaces } from "@/lib/local-places";
export default async function Page() {
  return <Workspace initialPlaces={await getLocalPlaces()} />;
}
