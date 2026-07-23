"use client";

import { FormEvent, useEffect, useState } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

type Employee = { id?: string; employeeId?: string; name: string; status?: string };
type Prize = { id?: string; name: string; amount: number; quantity: number; active?: boolean };
type Settings = {
  eventName: string;
  intro: string;
  startDate: string;
  endDate: string;
  showResults: boolean;
  minChars: number;
};
type PublicData = {
  settings: Settings;
  employees: Employee[];
  praises: Array<{ id: string; targetName: string; content: string; createdAt?: string }>;
  prizes: Prize[];
  results: Array<{ id: string; prizeName: string; winnerName: string }>;
  stats: { employeeCount: number; praiseCount: number; todayAttendance: number };
};
type AdminData = {
  employees: Employee[];
  prizes: Prize[];
  settings: Settings;
  results: Array<{ id: string; prizeName: string; winnerName: string }>;
};

const emptyPublic: PublicData = {
  settings: {
    eventName: "칭찬 스티커 이벤트",
    intro: "동료에게 따뜻한 칭찬을 전해 보세요.",
    startDate: "",
    endDate: "",
    showResults: false,
    minChars: 20,
  },
  employees: [],
  praises: [],
  prizes: [],
  results: [],
  stats: { employeeCount: 0, praiseCount: 0, todayAttendance: 0 },
};

async function jsonFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "요청을 처리하지 못했습니다.");
  return data;
}

export default function EventApp() {
  const [data, setData] = useState<PublicData>(emptyPublic);
  const [user, setUser] = useState<Employee | null>(null);
  const [login, setLogin] = useState({ name: "", employeeId: "" });
  const [notice, setNotice] = useState("");
  const [targetId, setTargetId] = useState("");
  const [content, setContent] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [admin, setAdmin] = useState<AdminData | null>(null);
  const [adminLogin, setAdminLogin] = useState({ email: "", password: "" });
  const [employeeText, setEmployeeText] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    setData(await jsonFetch<PublicData>("/api/public", { cache: "no-store" }));
  };

  useEffect(() => {
    refresh().catch((error) => setNotice(error.message));
  }, []);

  const employeeLogin = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await jsonFetch<{ employee: Employee; attendanceMessage: string }>(
        "/api/employee/login",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(login),
        },
      );
      setUser(result.employee);
      setNotice(result.attendanceMessage);
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "로그인하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const submitPraise = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      await jsonFetch("/api/praise", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          writerId: user.employeeId,
          writerName: user.name,
          targetId,
          content,
        }),
      });
      setTargetId("");
      setContent("");
      setNotice("칭찬이 등록되었습니다.");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "칭찬을 등록하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const adminRequest = async (body?: unknown) => {
    const current = getFirebaseAuth().currentUser;
    if (!current) throw new Error("관리자 로그인이 필요합니다.");
    const token = await current.getIdToken();
    const result = await jsonFetch<AdminData & { publicData?: PublicData }>("/api/admin", {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    setAdmin(result);
    if (result.publicData) setData(result.publicData);
    return result;
  };

  const loginAdmin = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), adminLogin.email, adminLogin.password);
      await adminRequest();
      setNotice("관리자 모드로 로그인했습니다.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "관리자 로그인에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const runAdmin = async (body: unknown, message: string) => {
    setBusy(true);
    try {
      await adminRequest(body);
      setNotice(message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "작업에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main>
      <header className="hero">
        <div>
          <span className="eyebrow">PRAISE & ATTENDANCE</span>
          <h1>{data.settings.eventName}</h1>
          <p>{data.settings.intro}</p>
        </div>
        <button className="button ghost" onClick={() => setAdminOpen((value) => !value)}>
          {adminOpen ? "직원 화면" : "관리자"}
        </button>
      </header>

      {notice && (
        <button className="notice" onClick={() => setNotice("")} aria-label="알림 닫기">
          {notice}
        </button>
      )}

      {adminOpen ? (
        <section className="admin-area">
          {!admin ? (
            <form className="card narrow" onSubmit={loginAdmin}>
              <span className="section-label">ADMIN</span>
              <h2>관리자 로그인</h2>
              <label>이메일<input type="email" value={adminLogin.email} onChange={(e) => setAdminLogin({ ...adminLogin, email: e.target.value })} required /></label>
              <label>비밀번호<input type="password" value={adminLogin.password} onChange={(e) => setAdminLogin({ ...adminLogin, password: e.target.value })} required /></label>
              <button className="button primary" disabled={busy}>로그인</button>
            </form>
          ) : (
            <>
              <div className="section-head">
                <div><span className="section-label">ADMIN CONSOLE</span><h2>이벤트 관리</h2></div>
                <button className="button ghost dark" onClick={async () => { await signOut(getFirebaseAuth()); setAdmin(null); }}>로그아웃</button>
              </div>
              <div className="admin-grid">
                <section className="card">
                  <h3>직원 명단 일괄 등록</h3>
                  <p className="muted">이름 · 사번 · 상태 순서로 엑셀에서 붙여넣으세요.</p>
                  <textarea rows={8} value={employeeText} onChange={(e) => setEmployeeText(e.target.value)} placeholder={"정지영\t202509004\t재직"} />
                  <button className="button primary" disabled={busy} onClick={() => runAdmin({ action: "importEmployees", text: employeeText }, "직원 명단을 등록했습니다.")}>명단 등록</button>
                </section>
                <section className="card">
                  <h3>이벤트 설정</h3>
                  <label>이벤트명<input value={admin.settings.eventName} onChange={(e) => setAdmin({ ...admin, settings: { ...admin.settings, eventName: e.target.value } })} /></label>
                  <label>소개 문구<input value={admin.settings.intro} onChange={(e) => setAdmin({ ...admin, settings: { ...admin.settings, intro: e.target.value } })} /></label>
                  <div className="two">
                    <label>시작일<input type="date" value={admin.settings.startDate} onChange={(e) => setAdmin({ ...admin, settings: { ...admin.settings, startDate: e.target.value } })} /></label>
                    <label>종료일<input type="date" value={admin.settings.endDate} onChange={(e) => setAdmin({ ...admin, settings: { ...admin.settings, endDate: e.target.value } })} /></label>
                  </div>
                  <label className="check"><input type="checkbox" checked={admin.settings.showResults} onChange={(e) => setAdmin({ ...admin, settings: { ...admin.settings, showResults: e.target.checked } })} /> 추첨 결과 공개</label>
                  <button className="button primary" disabled={busy} onClick={() => runAdmin({ action: "saveSettings", settings: admin.settings }, "설정을 저장했습니다.")}>설정 저장</button>
                </section>
              </div>
              <section className="card">
                <div className="section-head compact">
                  <div><h3>상품 및 추첨</h3><p className="muted">상품을 입력한 뒤 저장하고 추첨을 실행하세요.</p></div>
                  <button className="button ghost dark" onClick={() => setAdmin({ ...admin, prizes: [...admin.prizes, { name: "", amount: 0, quantity: 1 }] })}>상품 추가</button>
                </div>
                <div className="prize-editor">
                  {admin.prizes.map((prize, index) => (
                    <div className="prize-row" key={prize.id || index}>
                      <input aria-label="상품명" placeholder="상품명" value={prize.name} onChange={(e) => { const prizes = [...admin.prizes]; prizes[index] = { ...prize, name: e.target.value }; setAdmin({ ...admin, prizes }); }} />
                      <input aria-label="금액" type="number" placeholder="금액" value={prize.amount} onChange={(e) => { const prizes = [...admin.prizes]; prizes[index] = { ...prize, amount: Number(e.target.value) }; setAdmin({ ...admin, prizes }); }} />
                      <input aria-label="수량" type="number" min="1" value={prize.quantity} onChange={(e) => { const prizes = [...admin.prizes]; prizes[index] = { ...prize, quantity: Number(e.target.value) }; setAdmin({ ...admin, prizes }); }} />
                      <button className="icon-button" onClick={() => setAdmin({ ...admin, prizes: admin.prizes.filter((_, i) => i !== index) })}>삭제</button>
                    </div>
                  ))}
                </div>
                <div className="actions">
                  <button className="button primary" disabled={busy} onClick={() => runAdmin({ action: "savePrizes", prizes: admin.prizes }, "상품을 저장했습니다.")}>상품 저장</button>
                  <button className="button accent" disabled={busy} onClick={() => confirm("추첨을 실행할까요?") && runAdmin({ action: "runDraw" }, "추첨이 완료되었습니다.")}>추첨 실행</button>
                  <button className="button ghost dark" disabled={busy} onClick={() => confirm("추첨 결과를 삭제할까요?") && runAdmin({ action: "resetResults" }, "추첨 결과를 초기화했습니다.")}>결과 초기화</button>
                </div>
              </section>
              <section className="card">
                <h3>등록 직원 <span className="count">{admin.employees.length}</span></h3>
                <div className="table-wrap"><table><thead><tr><th>사번</th><th>이름</th><th>상태</th></tr></thead><tbody>{admin.employees.map((employee) => <tr key={employee.id}><td>{employee.id}</td><td>{employee.name}</td><td><select value={employee.status} onChange={(e) => runAdmin({ action: "updateEmployeeStatus", employeeId: employee.id, status: e.target.value }, "상태를 변경했습니다.")}><option>재직</option><option>휴직</option><option>퇴직</option></select></td></tr>)}</tbody></table></div>
              </section>
            </>
          )}
        </section>
      ) : !user ? (
        <section className="login-stage">
          <form className="card narrow" onSubmit={employeeLogin}>
            <span className="section-label">WELCOME</span>
            <h2>직원 로그인</h2>
            <p className="muted">재직 중인 직원만 이용할 수 있습니다.</p>
            <label>이름<input value={login.name} onChange={(e) => setLogin({ ...login, name: e.target.value })} required /></label>
            <label>사번<input inputMode="numeric" value={login.employeeId} onChange={(e) => setLogin({ ...login, employeeId: e.target.value })} required /></label>
            <button className="button primary" disabled={busy}>입장하고 출석 스티커 받기</button>
          </form>
        </section>
      ) : (
        <>
          <section className="welcome-row">
            <div><span className="section-label">HELLO</span><h2>{user.name}님, 오늘도 반갑습니다.</h2></div>
            <button className="button ghost dark" onClick={() => setUser(null)}>로그아웃</button>
          </section>
          <section className="metrics">
            <article><span>등록된 칭찬</span><strong>{data.stats.praiseCount}</strong></article>
            <article><span>재직 대상자</span><strong>{data.stats.employeeCount}</strong></article>
            <article><span>오늘 출석</span><strong>{data.stats.todayAttendance}</strong></article>
          </section>
          <section className="content-grid">
            <form className="card" onSubmit={submitPraise}>
              <span className="section-label">SEND PRAISE</span>
              <h2>칭찬 작성하기</h2>
              <label>칭찬할 직원<select value={targetId} onChange={(e) => setTargetId(e.target.value)} required><option value="">선택해 주세요</option>{data.employees.filter((employee) => employee.id !== user.employeeId).map((employee) => <option key={employee.id} value={employee.id}>{employee.name} ({employee.id})</option>)}</select></label>
              <label>칭찬 내용<textarea rows={8} value={content} onChange={(e) => setContent(e.target.value)} placeholder="구체적인 상황과 고마웠던 점을 작성해 주세요." required /></label>
              <div className="counter">공백 제외 {content.replace(/\s/g, "").length} / {data.settings.minChars}자</div>
              <button className="button primary" disabled={busy}>칭찬 등록</button>
            </form>
            <section className="card praise-list">
              <span className="section-label">PRAISE WALL</span>
              <h2>칭찬 게시판</h2>
              {data.praises.length ? data.praises.map((praise) => <article key={praise.id}><strong>To. {praise.targetName}</strong><p>{praise.content}</p></article>) : <p className="empty">아직 등록된 칭찬이 없습니다.</p>}
            </section>
          </section>
          {data.results.length > 0 && <section className="card results"><span className="section-label">WINNERS</span><h2>추첨 결과</h2><div className="result-grid">{data.results.map((result) => <article key={result.id}><span>{result.prizeName}</span><strong>{result.winnerName}</strong></article>)}</div></section>}
        </>
      )}
    </main>
  );
}
