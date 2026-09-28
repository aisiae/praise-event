import EventApp from "@/components/EventApp";
import type { PublicData } from "@/components/EventApp";
import { getCachedPublicData } from "@/lib/data";

export const dynamic = "force-dynamic";

const samplePhoto = (label: string, from: string, to: string) => `data:image/svg+xml,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="900" height="900"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs><rect width="900" height="900" fill="url(#g)"/><circle cx="700" cy="180" r="95" fill="#fff8"/><path d="M0 700 270 410 470 620 610 490 900 760V900H0Z" fill="#fff5"/><text x="60" y="105" fill="white" font-size="48" font-family="sans-serif" font-weight="700">${label}</text></svg>`)}`;

function instagramPreviewData(): PublicData {
  return {
    preview: true,
    event: { id: "instagram-2026-10", type: "instagram", status: "draft" },
    settings: { id: "instagram-2026-10", type: "instagram", status: "draft", eventName: "나도 인스타!", intro: "타임스탬프로 포착한 특별한 일상을 사진과 함께 공유해 보세요.", startDate: "2026-10-01", endDate: "2026-10-31", showResults: false, minChars: 5, detailSchedule: "2026년 10월 1일부터 10월 31일까지 특별한 일상을 공유해 주세요.", detailAttendance: "게시글 3점 · 댓글 2점 · 좋아요 1점으로 활동 점수를 합산합니다.", detailPrizes: "총 30만원 상당의 상품권을 지급합니다.", detailNotes: "사진에는 촬영 일시를 확인할 수 있는 타임스탬프가 보여야 합니다. 동점은 인기 게시글 순으로 선정합니다." },
    employees: [{ id: "preview", employeeId: "preview", name: "미리보기" }], praises: [], quiz: null, results: [],
    prizes: [{ id: "1", name: "1등 상품권", amount: 100000, quantity: 1 }, { id: "2", name: "2등 상품권", amount: 50000, quantity: 2 }, { id: "3", name: "3등 상품권", amount: 30000, quantity: 2 }, { id: "4", name: "인기 게시글 상품권", amount: 20000, quantity: 2 }],
    socialPosts: [
      { id: "sample-1", employeeId: "1001", authorName: "김화물", caption: "퇴근길에 만난 멋진 노을! 오늘도 수고 많으셨습니다.", imageData: samplePhoto("오늘의 노을", "#ff9966", "#6a3dc8"), capturedAt: "2026-10-07T18:24", createdAt: "2026-10-07T09:24:00.000Z", likedBy: ["preview", "1002", "1003"], comments: [{ id: "c1", employeeId: "1002", authorName: "이맨", content: "색감이 정말 예뻐요!", createdAt: "2026-10-07T09:30:00.000Z" }] },
      { id: "sample-2", employeeId: "1002", authorName: "이맨", caption: "점심시간에 발견한 작은 행운을 공유합니다.", imageData: samplePhoto("작은 행운", "#54c6a1", "#3384d6"), capturedAt: "2026-10-08T12:31", createdAt: "2026-10-08T03:31:00.000Z", likedBy: ["1001"], comments: [] },
    ], stats: { employeeCount: 1, praiseCount: 0, todayAttendance: 0 },
  };
}

export default async function Page({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  if ((await searchParams).preview === "instagram") return <EventApp initialData={instagramPreviewData()} />;
  const initialData = await getCachedPublicData() as PublicData;
  return <EventApp initialData={initialData} />;
}
