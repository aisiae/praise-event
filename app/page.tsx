import EventApp from "@/components/EventApp";
import type { PublicData } from "@/components/EventApp";
import { getCachedPublicData } from "@/lib/data";

export const dynamic = "force-dynamic";

export default async function Page() {
  const initialData = await getCachedPublicData() as PublicData;
  return <EventApp initialData={initialData} />;
}
