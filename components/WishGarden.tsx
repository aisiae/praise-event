"use client";

import { useEffect, useRef } from "react";

export default function WishGarden() {
  const frame = useRef<HTMLIFrameElement>(null);

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
  }, []);

  return <iframe
    ref={frame}
    title="2027 소원 나무 정원"
    src="/wish-village/index.html"
    style={{ position: "fixed", top: 0, left: 0, width: "100%", height: "100dvh", border: 0, display: "block" }}
  />;
}
