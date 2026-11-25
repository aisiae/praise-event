"use client";

import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useRef, useState } from "react";
import { getFirebaseAuth } from "@/lib/firebase-client";

export default function WishGarden({ adminTest }: { adminTest: boolean }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [access, setAccess] = useState<"loading" | "admin" | "denied">("loading");

  useEffect(() => {
    if (!adminTest) return;
    const request = new AbortController();
    const auth = getFirebaseAuth();
    const unsubscribe = onAuthStateChanged(auth, async user => {
      if (!user) {
        setAccess("denied");
        return;
      }
      try {
        const response = await fetch("/api/wish-tree-test/admin", {
          headers: { Authorization: `Bearer ${await user.getIdToken()}` },
          cache: "no-store",
          signal: request.signal,
        });
        if (!request.signal.aborted && auth.currentUser === user) setAccess(response.ok ? "admin" : "denied");
      } catch {
        if (!request.signal.aborted && auth.currentUser === user) setAccess("denied");
      }
    });
    return () => { request.abort(); unsubscribe(); };
  }, [adminTest]);

  useEffect(() => {
    const viewport = window.visualViewport;
    const element = frame.current;
    if (!viewport || !element) return;

    function fitViewport() {
      if (!viewport || !element) return;
      element.style.height = `${Math.floor(viewport.height)}px`;
      element.style.top = `${Math.round(viewport.offsetTop)}px`;
    }

    fitViewport();
    viewport.addEventListener("resize", fitViewport);
    viewport.addEventListener("scroll", fitViewport);
    return () => {
      viewport.removeEventListener("resize", fitViewport);
      viewport.removeEventListener("scroll", fitViewport);
    };
  }, [access, adminTest]);

  if (adminTest && access === "loading") return <p role="status">정원 화면을 불러오는 중이에요.</p>;
  if (adminTest && access === "denied") return <p role="alert">관리자 로그인 후 이벤트 설정에서 관리자 테스트를 열어 주세요.</p>;

  return <iframe
    ref={frame}
    title="2027 소원 나무 정원"
    src={adminTest ? "/wish-village/index.html?admin-test" : "/wish-village/index.html"}
    onLoad={adminTest ? () => {
      frame.current?.contentWindow?.postMessage({ type: "wish-garden-admin-test" }, window.location.origin);
    } : undefined}
    style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100dvh", border: 0, display: "block" }}
  />;
}
