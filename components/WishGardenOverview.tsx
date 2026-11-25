"use client";

import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useRef, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase-client";
import type { WishOverviewTree } from "@/lib/wish-garden";

export default function WishGardenOverview({ mode, onClose }: { mode: "test" | "live"; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const [trees, setTrees] = useState<WishOverviewTree[] | null>(null);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  useEffect(() => {
    const auth = getFirebaseAuth();
    const controller = new AbortController();
    const unsubscribe = onAuthStateChanged(auth, async user => {
      setTrees(null);
      setError("");
      if (!user) {
        setError("관리자로 로그인한 뒤 전체 현황을 열어 주세요.");
        return;
      }
      try {
        const response = await fetch("/api/wish-tree-test?view=admin-overview&mode=" + mode, {
          headers: { Authorization: "Bearer " + await user.getIdToken() },
          cache: "no-store",
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        if (!controller.signal.aborted && auth.currentUser === user) setTrees(data.trees);
      } catch (cause) {
        if (!controller.signal.aborted && auth.currentUser === user) {
          setError(cause instanceof Error ? cause.message : "정원을 불러오지 못했어요.");
        }
      }
    });
    return () => { controller.abort(); unsubscribe(); };
  }, [mode, reload]);

  useEffect(() => {
    if (!trees) return;
    function onReady(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== frame.current?.contentWindow ||
          event.data?.type !== "wish-garden-overview-ready") return;
      frame.current?.contentWindow?.postMessage({ type: "wish-garden-overview", trees }, window.location.origin);
    }
    window.addEventListener("message", onReady);
    return () => window.removeEventListener("message", onReady);
  }, [trees]);

  return <dialog ref={dialog} aria-labelledby="wish-overview-title" onCancel={event => { event.preventDefault(); onClose(); }}
    style={{ position: "fixed", inset: 0, margin: "auto", width: "100%", height: "100dvh", maxWidth: "none", maxHeight: "none", padding: 0, border: 0 }}>
    <div style={{ height: "100%", display: "grid", gridTemplateRows: "auto minmax(0, 1fr)", background: "#f9f6f1" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, padding: "8px 12px" }}>
        <strong id="wish-overview-title">{mode === "test" ? "테스트 정원 전체 현황" : "운영 정원 전체 현황"}</strong>
        <button type="button" className="button secondary" autoFocus onClick={onClose}>이벤트 현황으로 돌아가기</button>
      </header>
      {trees ? <iframe ref={frame} title="관리자 소원 나무 전체 현황" src="/wish-village/index.html?overview"
        onLoad={() => frame.current?.contentWindow?.postMessage({ type: "wish-garden-overview", trees }, window.location.origin)}
        style={{ display: "block", width: "100%", height: "100%", border: 0 }} />
        : <div style={{ padding: 16 }}>
          {error ? <><p role="alert">{error}</p><button type="button" className="button secondary" onClick={() => setReload(value => value + 1)}>다시 불러오기</button></>
            : <p role="status">정원 전체 현황을 불러오는 중이에요.</p>}
        </div>}
    </div>
  </dialog>;
}
