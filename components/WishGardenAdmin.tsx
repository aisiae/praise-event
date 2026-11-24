"use client";

import { useState } from "react";

const path = "/wish-tree-test";

export default function WishGardenAdmin() {
  const [mobile, setMobile] = useState(false);
  const [notice, setNotice] = useState("");
  const url = typeof window === "undefined" ? path : new URL(path, window.location.origin).href;

  return <section className="panel">
    <h2>2027 소원나무 마당 테스트</h2>
    <button className="button secondary" aria-expanded={mobile} onClick={() => setMobile(value => !value)}>
      {mobile ? "모바일 화면 닫기" : "모바일 화면 보기"}
    </button>
    <h3>공유 테스트 링크</h3>
    <p>직원 이름과 사번으로 로그인하면 같은 테스트 마당에 입장합니다. 로그인 없이 조작 체험을 선택하면 성장 단계를 연속으로 확인할 수 있습니다.</p>
    <p><input readOnly aria-label="공유 테스트 링크" value={url} style={{ width: "100%" }} /></p>
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button className="button" onClick={async () => {
        try {
          await navigator.clipboard.writeText(url);
          setNotice("테스트 링크를 복사했어요.");
        } catch {
          setNotice("위 주소를 선택해서 복사해 주세요.");
        }
      }}>공유 테스트 링크 복사</button>
      <a className="button secondary" href={path} target="_blank" rel="noreferrer">테스트 화면 열기 ↗</a>
    </div>
    <p role="status">{notice}</p>
    {mobile && <iframe title="소원나무 마당 모바일 미리보기" src={path} style={{ display: "block", margin: "12px auto", width: "min(390px, 100%)", height: 780, border: "2px solid #244355", borderRadius: 18 }} />}
  </section>;
}
