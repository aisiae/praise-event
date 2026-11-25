import Link from "next/link";
import WishGarden from "@/components/WishGarden";
import { getWishPublication } from "@/lib/wish-garden-server";

export const dynamic = "force-dynamic";
export const viewport = { viewportFit: "cover" };
export const metadata = { title: "2027 소원 나무 정원" };

export default async function WishTreePage() {
  const publication = await getWishPublication().catch(() => null);
  if (publication?.state === "open") return <WishGarden live />;

  return <main className="panel" style={{ margin: "36px auto", maxWidth: 480, padding: 24 }}>
    <h1>2027 소원 나무 정원</h1>
    <p>{publication?.state === "scheduled" && publication.schedule
      ? publication.schedule.startsAt.replace("T", " ") + " (한국시간)에 정원이 열려요."
      : publication?.state === "ended" ? "정원 운영이 종료됐어요."
      : publication ? "정원 개장을 준비 중이에요." : "운영 일정을 불러오지 못했어요. 잠시 후 다시 열어 주세요."}</p>
    <Link href="/" className="button secondary">현재 이벤트 보기</Link>
  </main>;
}
