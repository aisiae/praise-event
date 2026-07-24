"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

type Employee = { id?: string; employeeId?: string; name: string; status?: string };
type Prize = { id?: string; name: string; amount: number; quantity: number; active?: boolean };
type Praise = {
  id: string;
  writerId?: string;
  writerName?: string;
  targetId?: string;
  targetName: string;
  content: string;
  createdAt?: string;
};
type Settings = {
  eventName: string;
  intro: string;
  startDate: string;
  endDate: string;
  showResults: boolean;
  minChars: number;
  detailSchedule: string;
  detailAttendance: string;
  detailPrizes: string;
  detailNotes: string;
};
type StickerStatus = { attendance: number; sent: number; received: number; total: number };
type PublicData = {
  settings: Settings;
  employees: Employee[];
  praises: Praise[];
  prizes: Prize[];
  results: Array<{ id: string; prizeName: string; winnerName: string }>;
  stats: { employeeCount: number; praiseCount: number; todayAttendance: number };
};
type AdminData = {
  employees: Employee[];
  prizes: Prize[];
  settings: Settings;
  results: Array<{ id: string; prizeName: string; winnerName: string }>;
  standings: Array<{ employeeId: string; name: string; attendance: number; sent: number; received: number; tickets: number }>;
  praises: Praise[];
};

const emptyPublic: PublicData = {
  settings: {
    eventName: "칭찬 스티커 이벤트",
    intro: "동료에게 따뜻한 칭찬과 고마움을 전하고 행운의 주인공이 되어 보세요.",
    startDate: "",
    endDate: "",
    showResults: false,
    minChars: 20,
    detailSchedule: "이벤트 기간 동안 매일 참여할 수 있으며, 추첨 결과는 이벤트 종료 후 안내합니다.",
    detailAttendance: "이벤트 기간 중 하루 1회 로그인하면 출석 스티커 1장이 지급됩니다.\n칭찬을 작성하거나 받으면 각각 스티커 1장이 추가됩니다.",
    detailPrizes: "보유한 스티커 수를 기준으로 가중치 추첨을 진행합니다.\n등록된 상품과 수량은 이벤트 운영 상황에 따라 변경될 수 있습니다.",
    detailNotes: "동일한 동료에게는 한 번만 칭찬할 수 있으며, 본인에게는 칭찬을 작성할 수 없습니다.",
  },
  employees: [],
  praises: [],
  prizes: [],
  results: [],
  stats: { employeeCount: 0, praiseCount: 0, todayAttendance: 0 },
};

const emptyStickerStatus: StickerStatus = { attendance: 0, sent: 0, received: 0, total: 0 };

async function jsonFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || "요청을 처리하지 못했습니다.");
  return result;
}

function formatDate(value?: string) {
  if (!value) return "";
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric" }).format(new Date(value));
}

function EventPeriod({ settings }: { settings: Settings }) {
  if (!settings.startDate && !settings.endDate) return null;
  return (
    <span className="event-period">
      <span aria-hidden="true">●</span>
      {settings.startDate ? formatDate(settings.startDate) : "시작일 미정"} —{" "}
      {settings.endDate ? formatDate(settings.endDate) : "종료일 미정"}
    </span>
  );
}

function PraiseCard({ praise, onOpen, showWriter }: { praise: Praise; onOpen: () => void; showWriter: boolean }) {
  return (
    <button className="praise-card" onClick={onOpen}>
      <div className="praise-card-top">
        <span className="to-name">To. {praise.targetName}</span>
        <span className="card-date">{formatDate(praise.createdAt)}</span>
      </div>
      <p>{praise.content}</p>
      {showWriter && praise.writerName && <div className="from-name">From. {praise.writerName}</div>}
    </button>
  );
}

export default function EventApp() {
  const [data, setData] = useState<PublicData>(emptyPublic);
  const [user, setUser] = useState<Employee | null>(null);
  const [login, setLogin] = useState({ name: "", employeeId: "" });
  const [loginOpen, setLoginOpen] = useState(false);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [loginResultOpen, setLoginResultOpen] = useState(false);
  const [eventDetailOpen, setEventDetailOpen] = useState(false);
  const [attendanceAwarded, setAttendanceAwarded] = useState(false);
  const [stickerStatus, setStickerStatus] = useState<StickerStatus>(emptyStickerStatus);
  const [praiseTab, setPraiseTab] = useState<"all" | "received" | "sent">("all");
  const [receivedPraises, setReceivedPraises] = useState<Praise[]>([]);
  const [sentPraises, setSentPraises] = useState<Praise[]>([]);
  const [selectedPraise, setSelectedPraise] = useState<Praise | null>(null);
  const [editPraiseContent, setEditPraiseContent] = useState("");
  const [editingPraise, setEditingPraise] = useState(false);
  const [adminTab, setAdminTab] = useState<"employees" | "settings" | "prizes" | "posts" | "status" | "results">("employees");
  const [notice, setNotice] = useState("");
  const [targetId, setTargetId] = useState("");
  const [content, setContent] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [admin, setAdmin] = useState<AdminData | null>(null);
  const [adminLogin, setAdminLogin] = useState({ email: "", password: "" });
  const [rememberAdminEmail, setRememberAdminEmail] = useState(false);
  const [employeeText, setEmployeeText] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = async () => setData(await jsonFetch<PublicData>("/api/public", { cache: "no-store" }));

  useEffect(() => {
    refresh().catch((error) => setNotice(error.message));
    const savedAdminEmail = window.localStorage.getItem("praise-admin-email");
    if (savedAdminEmail) {
      setAdminLogin((value) => ({ ...value, email: savedAdminEmail }));
      setRememberAdminEmail(true);
    }
  }, []);

  useEffect(() => {
    if (!loginOpen && !stickerOpen && !loginResultOpen && !eventDetailOpen && !selectedPraise) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLoginOpen(false);
        setStickerOpen(false);
        setLoginResultOpen(false);
        setEventDetailOpen(false);
        setSelectedPraise(null);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [loginOpen, stickerOpen, loginResultOpen, eventDetailOpen, selectedPraise]);

  const filteredPraises = useMemo(() => {
    if (!user || praiseTab === "all") return data.praises;
    if (praiseTab === "received") return receivedPraises;
    return sentPraises;
  }, [data.praises, praiseTab, receivedPraises, sentPraises, user]);

  const employeeLogin = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const result = await jsonFetch<{
        employee: Employee;
        attendanceAwarded: boolean;
        attendanceMessage: string;
        stickerStatus: StickerStatus;
        personalPraises: { received: Praise[]; sent: Praise[] };
      }>("/api/employee/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(login),
      });
      setUser(result.employee);
      setAttendanceAwarded(result.attendanceAwarded);
      setStickerStatus(result.stickerStatus);
      setReceivedPraises(result.personalPraises.received);
      setSentPraises(result.personalPraises.sent);
      setNotice(result.attendanceMessage);
      setLoginOpen(false);
      setLoginResultOpen(true);
      setPraiseTab("received");
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
      const result = await jsonFetch<{ praise: Praise }>("/api/praise", {
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
      setSentPraises((items) => [result.praise, ...items]);
      setNotice("따뜻한 칭찬이 등록되었습니다.");
      setStickerStatus((status) => ({ ...status, sent: status.sent + 1, total: status.total + 1 }));
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "칭찬을 등록하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const updateMyPraise = async () => {
    if (!user || !selectedPraise) return;
    setBusy(true);
    try {
      await jsonFetch("/api/praise", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ praiseId: selectedPraise.id, writerId: user.employeeId, writerName: user.name, content: editPraiseContent }),
      });
      setSentPraises((items) => items.map((item) => item.id === selectedPraise.id ? { ...item, content: editPraiseContent.trim() } : item));
      setSelectedPraise({ ...selectedPraise, content: editPraiseContent.trim() });
      setEditingPraise(false);
      setNotice("칭찬글을 수정했습니다.");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "칭찬글을 수정하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const deleteMyPraise = async () => {
    if (!user || !selectedPraise || !confirm("작성한 칭찬글을 삭제할까요?")) return;
    setBusy(true);
    try {
      await jsonFetch("/api/praise", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ praiseId: selectedPraise.id, writerId: user.employeeId, writerName: user.name }),
      });
      setSentPraises((items) => items.filter((item) => item.id !== selectedPraise.id));
      setStickerStatus((status) => ({ ...status, sent: Math.max(0, status.sent - 1), total: Math.max(0, status.total - 1) }));
      setSelectedPraise(null);
      setNotice("칭찬글을 삭제했습니다.");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "칭찬글을 삭제하지 못했습니다.");
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
      if (rememberAdminEmail) {
        window.localStorage.setItem("praise-admin-email", adminLogin.email.trim());
      } else {
        window.localStorage.removeItem("praise-admin-email");
      }
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

  useEffect(() => {
    if (!admin || (adminTab !== "status" && adminTab !== "results")) return;
    const timer = window.setInterval(async () => {
      try {
        const current = getFirebaseAuth().currentUser;
        if (!current) return;
        const token = await current.getIdToken();
        const latest = await jsonFetch<AdminData>("/api/admin", {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        });
        setAdmin(latest);
      } catch {
        // 다음 주기에 다시 시도합니다.
      }
    }, 10000);
    return () => window.clearInterval(timer);
  }, [adminTab, admin]);

  const logoutEmployee = () => {
    setUser(null);
    setStickerStatus(emptyStickerStatus);
    setReceivedPraises([]);
    setSentPraises([]);
    setPraiseTab("all");
  };

  return (
    <main>
      <header className="topbar">
        <button className="brand" onClick={() => setAdminOpen(false)} aria-label="메인 화면으로">
          <img className="brand-logo" src="/hwamulman-logo.png" alt="화물맨" />
          <span>칭찬 우체국</span>
        </button>
        <div className="top-actions">
          {user && (
            <>
              <span className="user-chip">{user.name}님</span>
              <button className="button status-button" onClick={() => setStickerOpen(true)}>
                <span aria-hidden="true">★</span> 내 스티커 현황
              </button>
              <button className="text-button" onClick={logoutEmployee}>로그아웃</button>
            </>
          )}
          <button className="admin-link" onClick={() => setAdminOpen((value) => !value)}>
            {adminOpen ? "이벤트 화면" : "관리자"}
          </button>
        </div>
      </header>

      {!adminOpen && (
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">PRAISE & ATTENDANCE</span>
            <h1>{data.settings.eventName}</h1>
            <p>{data.settings.intro}</p>
            <div className="hero-info-actions"><EventPeriod settings={data.settings} /><button className="detail-button" onClick={() => setEventDetailOpen(true)}>상세보기 <span>→</span></button></div>
          </div>
          <div className="hero-deco" aria-hidden="true">
            <span>칭찬</span><span>♥</span><span>고마워요!</span>
          </div>
        </section>
      )}

      {notice && (
        <button className="notice" onClick={() => setNotice("")} aria-label="알림 닫기">
          {notice}
        </button>
      )}

      {adminOpen ? (
        <section className="admin-area">
          {!admin ? (
            <form className="panel narrow" onSubmit={loginAdmin}>
              <span className="section-label">ADMIN</span>
              <h2>관리자 로그인</h2>
              <label>이메일<input type="email" value={adminLogin.email} onChange={(e) => setAdminLogin({ ...adminLogin, email: e.target.value })} required /></label>
              <label>비밀번호<input type="password" value={adminLogin.password} onChange={(e) => setAdminLogin({ ...adminLogin, password: e.target.value })} required /></label>
              <label className="remember-check"><input type="checkbox" checked={rememberAdminEmail} onChange={(e) => setRememberAdminEmail(e.target.checked)} /> 이메일 기억하기</label>
              <button className="button primary" disabled={busy}>로그인</button>
            </form>
          ) : (
            <>
              <div className="section-head">
                <div><span className="section-label">ADMIN CONSOLE</span><h2>이벤트 관리</h2></div>
                <button className="button secondary" onClick={async () => { await signOut(getFirebaseAuth()); setAdmin(null); }}>로그아웃</button>
              </div>
              <nav className="admin-tabs" aria-label="관리자 메뉴">
                {([
                  ["employees", "명단 관리"],
                  ["settings", "이벤트 설정"],
                  ["prizes", "상품 관리"],
                  ["posts", "게시글 관리"],
                  ["status", "이벤트 현황"],
                  ["results", "결과"],
                ] as const).map(([id, label]) => <button key={id} className={adminTab === id ? "active" : ""} onClick={() => setAdminTab(id)}>{label}</button>)}
              </nav>

              {adminTab === "employees" && <div className="admin-grid roster-grid">
                <section className="panel">
                  <h3>직원 명단 일괄 등록</h3>
                  <p className="muted">이름 · 사번 · 상태 순서로 붙여 넣어 주세요.</p>
                  <textarea rows={8} value={employeeText} onChange={(e) => setEmployeeText(e.target.value)} placeholder={"홍길동\t202509004\t재직"} />
                  <button className="button primary" disabled={busy} onClick={() => runAdmin({ action: "importEmployees", text: employeeText }, "직원 명단을 등록했습니다.")}>명단 등록</button>
                </section>
                <section className="panel roster-panel">
                  <h3>등록 직원 <span className="count">{admin.employees.length}</span></h3>
                  <div className="table-wrap"><table><thead><tr><th>이름</th><th>사번</th><th>상태</th><th>관리</th></tr></thead><tbody>{admin.employees.map((employee, index) => <tr key={employee.id}><td><input aria-label={`${employee.name} 이름`} value={employee.name} onChange={(e) => { const employees = [...admin.employees]; employees[index] = { ...employee, name: e.target.value }; setAdmin({ ...admin, employees }); }} /></td><td>{employee.id}</td><td><select value={employee.status} onChange={(e) => { const employees = [...admin.employees]; employees[index] = { ...employee, status: e.target.value }; setAdmin({ ...admin, employees }); }}><option>재직</option><option>휴직</option><option>퇴직</option></select></td><td><div className="employee-actions"><button className="table-action save" disabled={busy} onClick={() => runAdmin({ action: "updateEmployee", employeeId: employee.id, name: employee.name, status: employee.status }, "직원 정보를 수정했습니다.")}>저장</button><button className="table-action delete" disabled={busy} onClick={() => confirm(`${employee.name} 직원을 삭제할까요?`) && runAdmin({ action: "deleteEmployee", employeeId: employee.id }, "직원을 삭제했습니다.")}>삭제</button></div></td></tr>)}</tbody></table></div>
                </section>
              </div>}

              {adminTab === "settings" && <section className="panel admin-section settings-panel">
                  <h3>이벤트 설정</h3>
                  <label>이벤트명<input value={admin.settings.eventName} onChange={(e) => setAdmin({ ...admin, settings: { ...admin.settings, eventName: e.target.value } })} /></label>
                  <label>소개 문구<input value={admin.settings.intro} onChange={(e) => setAdmin({ ...admin, settings: { ...admin.settings, intro: e.target.value } })} /></label>
                  <div className="two">
                    <label>시작일<input type="date" value={admin.settings.startDate} onChange={(e) => setAdmin({ ...admin, settings: { ...admin.settings, startDate: e.target.value } })} /></label>
                    <label>종료일<input type="date" value={admin.settings.endDate} onChange={(e) => setAdmin({ ...admin, settings: { ...admin.settings, endDate: e.target.value } })} /></label>
                  </div>
                  <label>일정 안내<textarea rows={3} value={admin.settings.detailSchedule} onChange={(e) => setAdmin({ ...admin, settings: { ...admin.settings, detailSchedule: e.target.value } })} /></label>
                  <label>스티커 지급 기준<textarea rows={4} value={admin.settings.detailAttendance} onChange={(e) => setAdmin({ ...admin, settings: { ...admin.settings, detailAttendance: e.target.value } })} /></label>
                  <label>상품 안내<textarea rows={4} value={admin.settings.detailPrizes} onChange={(e) => setAdmin({ ...admin, settings: { ...admin.settings, detailPrizes: e.target.value } })} /></label>
                  <label>유의사항<textarea rows={3} value={admin.settings.detailNotes} onChange={(e) => setAdmin({ ...admin, settings: { ...admin.settings, detailNotes: e.target.value } })} /></label>
                  <label className="check"><input type="checkbox" checked={admin.settings.showResults} onChange={(e) => setAdmin({ ...admin, settings: { ...admin.settings, showResults: e.target.checked } })} /> 추첨 결과 공개</label>
                  <button className="button primary" disabled={busy} onClick={() => runAdmin({ action: "saveSettings", settings: admin.settings }, "설정을 저장했습니다.")}>설정 저장</button>
              </section>}

              {adminTab === "prizes" && <section className="panel admin-section">
                <div className="section-head compact">
                  <div><h3>상품 관리</h3><p className="muted">위에서부터 1위, 2위 순으로 상품이 나열됩니다.</p></div>
                  <button className="button secondary" onClick={() => setAdmin({ ...admin, prizes: [...admin.prizes, { name: "", amount: 0, quantity: 1 }] })}>상품 추가</button>
                </div>
                <div className="prize-editor">
                  {admin.prizes.map((prize, index) => (
                    <div className="prize-row" key={prize.id || index}>
                      <span className="prize-rank">{index + 1}위</span>
                      <input aria-label="상품명" placeholder="상품명" value={prize.name} onChange={(e) => { const prizes = [...admin.prizes]; prizes[index] = { ...prize, name: e.target.value }; setAdmin({ ...admin, prizes }); }} />
                      <input aria-label="금액" type="number" placeholder="금액" value={prize.amount} onChange={(e) => { const prizes = [...admin.prizes]; prizes[index] = { ...prize, amount: Number(e.target.value) }; setAdmin({ ...admin, prizes }); }} />
                      <input aria-label="수량" type="number" min="1" value={prize.quantity} onChange={(e) => { const prizes = [...admin.prizes]; prizes[index] = { ...prize, quantity: Number(e.target.value) }; setAdmin({ ...admin, prizes }); }} />
                      <button className="icon-button" onClick={() => setAdmin({ ...admin, prizes: admin.prizes.filter((_, i) => i !== index) })}>삭제</button>
                    </div>
                  ))}
                </div>
                <div className="actions">
                  <button className="button primary" disabled={busy} onClick={() => runAdmin({ action: "savePrizes", prizes: admin.prizes }, "상품을 저장했습니다.")}>상품 저장</button>
                </div>
              </section>}

              {adminTab === "posts" && <section className="panel admin-section">
                <div className="section-head compact"><div><h3>게시글 관리</h3><p className="muted">게시된 칭찬 내용을 확인하고 필요한 경우 삭제할 수 있습니다.</p></div><span className="count">{admin.praises.length}</span></div>
                <div className="admin-post-list">{admin.praises.map((praise) => <article key={praise.id}><div><strong>To. {praise.targetName}</strong><span>From. {praise.writerName}</span><p>{praise.content}</p></div><button className="table-action delete" disabled={busy} onClick={() => confirm("이 칭찬 게시글을 삭제할까요?") && runAdmin({ action: "deletePraise", praiseId: praise.id }, "게시글을 삭제했습니다.")}>삭제</button></article>)}</div>
              </section>}

              {adminTab === "status" && <section className="panel admin-section">
                <div className="section-head compact"><div><h3>직원별 스티커 현황</h3><p className="muted">출석과 칭찬 활동을 합산한 현재 스코어입니다.</p></div><button className="button secondary" onClick={() => adminRequest()}>새로고침</button></div>
                <div className="table-wrap"><table><thead><tr><th>순위</th><th>직원</th><th>출석</th><th>보낸 칭찬</th><th>받은 칭찬</th><th>총 스티커</th></tr></thead><tbody>{admin.standings.map((row, index) => <tr key={row.employeeId}><td>{index + 1}</td><td><strong>{row.name}</strong><small>{row.employeeId}</small></td><td>{row.attendance}</td><td>{row.sent}</td><td>{row.received}</td><td><strong className="score">{row.tickets}</strong></td></tr>)}</tbody></table></div>
              </section>}

              {adminTab === "results" && <section className="admin-result-grid admin-section">
                <section className="panel">
                  <div className="section-head compact"><div><h3>현재 직원 스코어</h3><p className="muted">스티커가 많은 순서입니다.</p></div><button className="button secondary" onClick={() => adminRequest()}>실시간 새로고침</button></div>
                  <ol className="score-list">{admin.standings.map((row) => <li key={row.employeeId}><span>{row.name}</span><strong>{row.tickets}장</strong></li>)}</ol>
                </section>
                <section className="panel">
                  <div className="section-head compact"><div><h3>실시간 상품 순위</h3><p className="muted">스티커 스코어가 바뀌면 직원 순위도 자동으로 변경됩니다.</p></div></div>
                  <div className="ranked-prizes">{admin.prizes.flatMap((prize) => Array.from({ length: Math.max(1, prize.quantity) }, () => prize)).map((prize, index) => { const employee = admin.standings[index]; return <article key={`${prize.id || prize.name}-${index}`}><span className="rank-badge">{index + 1}위</span><div className="live-rank-info"><strong>{prize.name || "상품명 미입력"} {prize.amount > 0 && `${prize.amount.toLocaleString("ko-KR")}원`}</strong><p>{employee ? `${employee.name} · ${employee.tickets}장` : "해당 순위 직원 없음"}</p></div></article>; })}</div>
                </section>
              </section>}
            </>
          )}
        </section>
      ) : (
        <>
          <section className="entry-strip">
            <div className="entry-message">
              <span className="entry-icon">★</span>
              <div>
                <strong>{user ? `${user.name}님, 오늘도 반가워요!` : "오늘의 출석 스티커를 받아보세요"}</strong>
                <span>{user ? "동료에게 따뜻한 칭찬을 전해 보세요." : "직원 인증 후 칭찬을 남기고 스티커를 모을 수 있어요."}</span>
              </div>
            </div>
            {!user ? (
              <button className="button entry-button" onClick={() => setLoginOpen(true)}>입장하고 출석 스티커 받기 <span>→</span></button>
            ) : (
              <button className="button entry-button" onClick={() => document.getElementById("write-praise")?.scrollIntoView({ behavior: "smooth" })}>칭찬 작성하기 <span>→</span></button>
            )}
          </section>

          <section className="wall-head">
            <div>
              <span className="section-label">PRAISE WALL</span>
              <h2>우리의 따뜻한 칭찬</h2>
              <p>서로의 좋은 순간을 발견하고, 함께 나누어요.</p>
            </div>
            <div className="wall-meta"><strong>{data.stats.praiseCount}</strong><span>개의 칭찬이 있어요</span></div>
          </section>

          {user && (
            <div className="tabs" role="tablist" aria-label="칭찬글 분류">
              <button className={praiseTab === "received" ? "active" : ""} onClick={() => setPraiseTab("received")}>나를 칭찬한 글</button>
              <button className={praiseTab === "sent" ? "active" : ""} onClick={() => setPraiseTab("sent")}>내가 칭찬한 글</button>
              <button className={praiseTab === "all" ? "active" : ""} onClick={() => setPraiseTab("all")}>전체 칭찬</button>
            </div>
          )}

          <section className="praise-grid">
            {filteredPraises.length ? filteredPraises.map((praise) => <PraiseCard praise={praise} showWriter={Boolean(user && praiseTab === "received")} onOpen={() => { setSelectedPraise(praise); setEditPraiseContent(praise.content); setEditingPraise(false); }} key={praise.id} />) : (
              <div className="empty-state">
                <span>💌</span>
                <strong>아직 도착한 칭찬이 없어요</strong>
                <p>첫 번째 따뜻한 마음을 전해 보세요.</p>
              </div>
            )}
          </section>

          {user && (
            <section className="write-section" id="write-praise">
              <div className="write-intro">
                <span className="section-label">SEND PRAISE</span>
                <h2>마음을 담아 칭찬해 주세요</h2>
                <p>구체적인 순간과 고마웠던 점을 적으면 마음이 더 잘 전해져요.</p>
              </div>
              <form className="panel write-form" onSubmit={submitPraise}>
                <label>칭찬할 동료<select value={targetId} onChange={(e) => setTargetId(e.target.value)} required><option value="">동료를 선택해 주세요</option>{data.employees.filter((employee) => employee.id !== user.employeeId).map((employee) => <option key={employee.id} value={employee.id}>{employee.name} ({employee.id})</option>)}</select></label>
                <label>칭찬 내용<textarea rows={6} value={content} onChange={(e) => setContent(e.target.value)} placeholder="어떤 순간이 고마웠는지 들려주세요." required /></label>
                <div className="form-bottom">
                  <span className="counter">공백 제외 {content.replace(/\s/g, "").length} / {data.settings.minChars}자</span>
                  <button className="button primary" disabled={busy}>칭찬 보내기</button>
                </div>
              </form>
            </section>
          )}

          {data.results.length > 0 && <section className="panel results"><span className="section-label">WINNERS</span><h2>추첨 결과</h2><div className="result-grid">{data.results.map((result) => <article key={result.id}><span>{result.prizeName}</span><strong>{result.winnerName}</strong></article>)}</div></section>}
        </>
      )}

      {(loginOpen || stickerOpen || loginResultOpen || eventDetailOpen || selectedPraise) && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.currentTarget === event.target) {
            setLoginOpen(false); setStickerOpen(false); setLoginResultOpen(false); setEventDetailOpen(false); setSelectedPraise(null);
          }
        }}>
          {loginOpen && (
            <form className="modal" onSubmit={employeeLogin}>
              <button type="button" className="modal-close" onClick={() => setLoginOpen(false)} aria-label="닫기">×</button>
              <div className="modal-symbol">★</div>
              <span className="section-label">WELCOME</span>
              <h2>직원 인증하고 입장하기</h2>
              <p className="muted">이름과 사번을 입력하면 오늘의 출석 스티커를 받을 수 있어요.</p>
              <label>이름<input autoFocus value={login.name} onChange={(e) => setLogin({ ...login, name: e.target.value })} placeholder="이름을 입력해 주세요" required /></label>
              <label>사번<input inputMode="numeric" value={login.employeeId} onChange={(e) => setLogin({ ...login, employeeId: e.target.value })} placeholder="사번을 입력해 주세요" required /></label>
              <button className="button primary full" disabled={busy}>{busy ? "확인하고 있어요…" : "입장하고 스티커 받기"}</button>
            </form>
          )}
          {loginResultOpen && (
            <section className="modal result-modal" aria-live="polite">
              <button className="modal-close" onClick={() => setLoginResultOpen(false)} aria-label="닫기">×</button>
              <div className="sticker-earned">★</div>
              <span className="section-label">{attendanceAwarded ? "ATTENDANCE COMPLETE" : "WELCOME BACK"}</span>
              <h2>{attendanceAwarded ? "출석 스티커를 받았어요!" : "오늘은 이미 지급되었어요"}</h2>
              <p><strong>{user?.name}님</strong>, {attendanceAwarded ? "오늘도 칭찬 우체국에 와주셔서 고마워요." : "오늘의 출석 스티커는 이미 받으셨습니다."}</p>
              <div className="total-ticket"><span>현재 내 스티커</span><strong>{stickerStatus.total}장</strong></div>
              <button className="button primary full" onClick={() => setLoginResultOpen(false)}>칭찬 보러 가기</button>
            </section>
          )}
          {stickerOpen && (
            <section className="modal status-modal">
              <button className="modal-close" onClick={() => setStickerOpen(false)} aria-label="닫기">×</button>
              <span className="section-label">MY STICKERS</span>
              <h2>{user?.name}님의 스티커 현황</h2>
              <div className="sticker-total"><span>모은 스티커</span><strong>{stickerStatus.total}</strong><em>장</em></div>
              <div className="sticker-breakdown">
                <article><span>출석</span><strong>{stickerStatus.attendance}</strong></article>
                <article><span>보낸 칭찬</span><strong>{stickerStatus.sent}</strong></article>
                <article><span>받은 칭찬</span><strong>{stickerStatus.received}</strong></article>
              </div>
              <p className="status-note">출석하고 칭찬을 주고받을 때마다 추첨 스티커가 쌓여요.</p>
              <button className="button primary full" onClick={() => setStickerOpen(false)}>확인</button>
            </section>
          )}
          {selectedPraise && (
            <section className="modal praise-modal">
              <button className="modal-close" onClick={() => setSelectedPraise(null)} aria-label="닫기">×</button>
              <span className="section-label">PRAISE MESSAGE</span>
              <h2>To. {selectedPraise.targetName}</h2>
              {editingPraise ? <textarea className="praise-edit-textarea" rows={8} value={editPraiseContent} onChange={(e) => setEditPraiseContent(e.target.value)} /> : <p className="praise-full-content">{selectedPraise.content}</p>}
              <div className="praise-full-meta">{user && praiseTab === "received" && selectedPraise.writerName && <span>From. {selectedPraise.writerName}</span>}<span>{formatDate(selectedPraise.createdAt)}</span></div>
              {user && praiseTab === "sent" && <div className="praise-owner-actions">{editingPraise ? <><button className="button secondary" onClick={() => { setEditingPraise(false); setEditPraiseContent(selectedPraise.content); }}>취소</button><button className="button primary" disabled={busy} onClick={updateMyPraise}>수정 저장</button></> : <><button className="button secondary" onClick={() => setEditingPraise(true)}>수정</button><button className="button danger" disabled={busy} onClick={deleteMyPraise}>삭제</button></>}</div>}
            </section>
          )}
          {eventDetailOpen && (
            <section className="modal event-detail-modal">
              <button className="modal-close" onClick={() => setEventDetailOpen(false)} aria-label="닫기">×</button>
              <span className="section-label">EVENT GUIDE</span>
              <h2>칭찬 스티커 이벤트 안내</h2>
              <div className="event-detail-list">
                <article><span className="detail-number">01</span><div><h3>이벤트 일정</h3><p>{data.settings.detailSchedule}</p><EventPeriod settings={data.settings} /></div></article>
                <article><span className="detail-number">02</span><div><h3>출석 스티커 제공 기준</h3><p>{data.settings.detailAttendance}</p></div></article>
                <article><span className="detail-number">03</span><div><h3>상품 내용</h3><p>{data.settings.detailPrizes}</p>{data.prizes.length > 0 && <ul>{data.prizes.map((prize, index) => <li key={prize.id || index}><strong>{index + 1}위</strong> {prize.name} · {prize.quantity}개</li>)}</ul>}</div></article>
                <article><span className="detail-number">04</span><div><h3>유의사항</h3><p>{data.settings.detailNotes}</p></div></article>
              </div>
              <button className="button primary full" onClick={() => setEventDetailOpen(false)}>확인</button>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
