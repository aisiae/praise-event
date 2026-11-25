"use client";

import { useEffect, useState, type FormEvent } from "react";
import { getFirebaseAuth } from "@/lib/firebase-client";
import type { WishPublication as Publication } from "@/lib/wish-publication";

const endpoint = "/api/wish-tree-test/admin?mode=live&view=schedule";
const statusText = { draft: "미게시", scheduled: "게시 예약됨", open: "게시 중", ended: "게시 종료" };

async function request(body?: object, signal?: AbortSignal): Promise<Publication> {
  const user = getFirebaseAuth().currentUser;
  if (!user) throw new Error("관리자 로그인이 필요해요.");
  const response = await fetch(endpoint, {
    method: body ? "POST" : "GET",
    headers: { Authorization: "Bearer " + await user.getIdToken(), "Content-Type": "application/json" },
    body: body && JSON.stringify(body),
    cache: "no-store",
    signal,
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "게시 일정을 처리하지 못했어요.");
  return data;
}

export default function WishPublication() {
  const [publication, setPublication] = useState<Publication | null>(null);
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void request(undefined, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      setPublication(data);
      setStartsAt(data.schedule?.startsAt ?? "");
      setEndsAt(data.schedule?.endsAt ?? "");
      setNotice("");
    }).catch(error => {
      if (!controller.signal.aborted) setNotice(error.message);
    });
    return () => controller.abort();
  }, [reload]);

  async function save(action: "schedule" | "unpublish") {
    if (action === "unpublish" && !window.confirm("게시를 취소할까요? 저장된 운영 일정이 지워지고 정원 입장이 중단돼요.")) return;
    setBusy(true);
    setNotice("");
    try {
      const data = await request({ action, startsAt, endsAt });
      setPublication(data);
      setStartsAt(data.schedule?.startsAt ?? "");
      setEndsAt(data.schedule?.endsAt ?? "");
      setNotice(action === "schedule" ? "게시 일정을 저장했어요." : "게시를 취소했어요.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "게시 일정을 저장하지 못했어요.");
    } finally {
      setBusy(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void save("schedule");
  }

  return <div className="bingo-share-box">
    <h3>게시 일정</h3>
    <p><strong>{publication ? statusText[publication.state] : "게시 일정 확인 중"}</strong></p>
    <p>한국시간 기준입니다. 게시 시작 시각부터 종료 시각 전까지 메인 페이지에서 소원 나무 정원이 열립니다. 시작 전에는 현재 이벤트가 계속 표시됩니다.</p>
    <form onSubmit={submit}>
      <label>게시 시작 <input type="datetime-local" required value={startsAt} onChange={event => setStartsAt(event.target.value)} /></label>
      <label>게시 종료 <input type="datetime-local" required min={startsAt || undefined} value={endsAt} onChange={event => setEndsAt(event.target.value)} /></label>
      <div className="actions">
        <button type="submit" className="button primary" disabled={!publication || busy}>게시 일정 저장</button>
        {publication?.schedule && <button type="button" className="button secondary" disabled={busy} onClick={() => void save("unpublish")}>게시 취소</button>}
        {!publication && notice && <button type="button" className="button secondary" onClick={() => setReload(value => value + 1)}>다시 불러오기</button>}
        <a className="button secondary" href="/wish-tree" target="_blank" rel="noreferrer">운영 화면 열기 ↗</a>
      </div>
    </form>
    {notice && <p role="status">{notice}</p>}
  </div>;
}
