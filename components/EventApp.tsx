"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { signInWithEmailAndPassword, signOut } from "firebase/auth";
import Image from "next/image";
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
  id?: string;
  type?: "praise" | "quiz";
  status?: "draft" | "active" | "closed";
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
type EventSummary = Settings & { id: string; type: "praise" | "quiz"; status: "draft" | "active" | "closed" };
type Quiz = { id?: string; date: string; question: string; options: string[]; correctIndex: number; subject?: string; explanation?: string };
type QuizSubmission = { id?: string; answer?: number; correct?: boolean };
type StickerStatus = { attendance: number; sent: number; received: number; total: number };
type PublishedResult = { rank: number; prizeName: string; amount: number; employeeId: string; winnerName: string; tickets: number };
type PublicData = {
  event: { id: string; type: "praise" | "quiz"; status: string };
  quiz: Quiz | null;
  settings: Settings;
  employees: Employee[];
  praises: Praise[];
  prizes: Prize[];
  results: PublishedResult[];
  stats: { employeeCount: number; praiseCount: number; todayAttendance: number };
};
type AdminData = {
  events: EventSummary[];
  activeEventId: string;
  selectedEventId: string;
  employees: Employee[];
  prizes: Prize[];
  settings: Settings;
  results: Array<{ id: string; prizeName: string; winnerName: string }>;
  standings: Array<{ employeeId: string; name: string; attendance: number; sent: number; received: number; tickets: number }>;
  praises: Praise[];
  quizzes: Quiz[];
  responses: Array<{ id: string; date: string; employeeId: string; name: string; correct: boolean }>;
  hasPublishedResult: boolean;
  resultPublished: boolean;
};

const emptyPublic: PublicData = {
  event: { id: "praise-legacy", type: "praise", status: "active" },
  quiz: null,
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
  const [resultOpen, setResultOpen] = useState(false);
  const [attendanceAwarded, setAttendanceAwarded] = useState(false);
  const [stickerStatus, setStickerStatus] = useState<StickerStatus>(emptyStickerStatus);
  const [praiseTab, setPraiseTab] = useState<"all" | "received" | "sent">("all");
  const [receivedPraises, setReceivedPraises] = useState<Praise[]>([]);
  const [sentPraises, setSentPraises] = useState<Praise[]>([]);
  const [selectedPraise, setSelectedPraise] = useState<Praise | null>(null);
  const [editPraiseContent, setEditPraiseContent] = useState("");
  const [editingPraise, setEditingPraise] = useState(false);
  const [adminTab, setAdminTab] = useState<"employees" | "settings" | "quizzes" | "prizes" | "posts" | "status" | "results">("settings");
  const [notice, setNotice] = useState("");
  const [targetId, setTargetId] = useState("");
  const [content, setContent] = useState("");
  const [adminOpen, setAdminOpen] = useState(false);
  const [admin, setAdmin] = useState<AdminData | null>(null);
  const [adminLogin, setAdminLogin] = useState({ email: "", password: "" });
  const [rememberAdminEmail, setRememberAdminEmail] = useState(false);
  const [employeeText, setEmployeeText] = useState("");
  const [busy, setBusy] = useState(false);
  const [quizAnswer, setQuizAnswer] = useState<number | null>(null);
  const [quizSubmission, setQuizSubmission] = useState<QuizSubmission | null>(null);
  const [quizResult, setQuizResult] = useState<{ correct: boolean; correctIndex: number; explanation: string } | null>(null);

  const refresh = async () => setData(await jsonFetch<PublicData>("/api/public"));

  useEffect(() => {
    // Initial client hydration must load the active event from the server.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refresh().catch((error) => setNotice(error.message));
    const savedAdminEmail = window.localStorage.getItem("praise-admin-email");
    if (savedAdminEmail) {
      setAdminLogin((value) => ({ ...value, email: savedAdminEmail }));
      setRememberAdminEmail(true);
    }
  }, []);

  useEffect(() => {
    if (!loginOpen && !stickerOpen && !loginResultOpen && !eventDetailOpen && !resultOpen && !selectedPraise) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setLoginOpen(false);
        setStickerOpen(false);
        setLoginResultOpen(false);
        setEventDetailOpen(false);
        setResultOpen(false);
        setSelectedPraise(null);
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [loginOpen, stickerOpen, loginResultOpen, eventDetailOpen, resultOpen, selectedPraise]);

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
        eventType: "praise" | "quiz";
        quizSubmission: QuizSubmission | null;
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
      setQuizSubmission(result.quizSubmission);
      setNotice(result.attendanceMessage);
      setLoginOpen(false);
      setLoginResultOpen(result.eventType === "praise");
      setPraiseTab("received");
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "로그인하지 못했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const submitQuiz = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || quizAnswer === null) return;
    setBusy(true);
    try {
      const result = await jsonFetch<{ correct: boolean; correctIndex: number; explanation: string; message: string }>("/api/quiz", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employeeId: user.employeeId, name: user.name, answer: quizAnswer }),
      });
      setQuizSubmission({ answer: quizAnswer, correct: result.correct });
      setQuizResult(result);
      setNotice(result.message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "퀴즈를 제출하지 못했습니다.");
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
    const adminUrl = !body && admin?.selectedEventId ? `/api/admin?eventId=${encodeURIComponent(admin.selectedEventId)}` : "/api/admin";
    const result = await jsonFetch<AdminData & { publicData?: PublicData }>(adminUrl, {
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
      const payload = body && typeof body === "object" && !Array.isArray(body)
        ? { eventId: admin?.selectedEventId, ...(body as Record<string, unknown>) }
        : body;
      await adminRequest(payload);
      setNotice(message);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "작업에 실패했습니다.");
    } finally {
      setBusy(false);
    }
  };

  const logoutEmployee = () => {
    setUser(null);
    setStickerStatus(emptyStickerStatus);
    setReceivedPraises([]);
    setSentPraises([]);
    setPraiseTab("all");
    setQuizSubmission(null);
    setQuizResult(null);
    setQuizAnswer(null);
  };

  return (
    <main>
      <header className="topbar">
        <button className="brand" onClick={() => setAdminOpen(false)} aria-label="메인 화면으로">
          <Image className="brand-logo" src="/hwamulman-logo.png" alt="화물맨" width={44} height={34} priority />
          <span>화물맨 이벤트</span>
        </button>
        <div className="top-actions">
          {user && (
            <>
              <span className="user-chip">{user.name}님</span>
              {data.event.type === "praise" && <button className="button status-button" onClick={() => setStickerOpen(true)}>
                <span aria-hidden="true">★</span> 내 스티커 현황
              </button>}
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
            <span className="eyebrow">{data.event.type === "quiz" ? "DAILY QUIZ & ATTENDANCE" : "PRAISE & ATTENDANCE"}</span>
            <h1>{data.settings.eventName}</h1>
            <p>{data.settings.intro}</p>
            <div className="hero-info-actions"><EventPeriod settings={data.settings} /><button className="detail-button" onClick={() => setEventDetailOpen(true)}>상세보기 <span>→</span></button><button className="detail-button result-view-button" onClick={() => setResultOpen(true)}>결과 보기 <span>→</span></button></div>
          </div>
          <div className="hero-deco" aria-hidden="true">
            {data.event.type === "quiz" ? <><span>오늘의</span><span>?</span><span>퀴즈!</span></> : <><span>칭찬</span><span>♥</span><span>고마워요!</span></>}
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
              <div className="admin-workspace">
                <aside className="event-sidebar panel">
                  <div className="event-sidebar-head"><strong>이벤트 목록</strong><span>{admin.events.length}</span></div>
                  <div className="event-list">
                    {admin.events.map((event) => <button key={event.id} className={admin.selectedEventId === event.id ? "active" : ""} onClick={() => adminRequest({ action: "loadEvent", eventId: event.id })}>
                      <span>{event.type === "quiz" ? "Q" : "♥"}</span><div><strong>{event.eventName}</strong><small>{event.status === "active" ? "진행 중" : event.status === "closed" ? "종료" : "준비 중"}</small></div>
                    </button>)}
                  </div>
                  <div className="event-create-actions">
                    <button className="button secondary" disabled={busy} onClick={() => runAdmin({ action: "createEvent", type: "quiz" }, "새 퀴즈 이벤트를 만들었습니다.")}>+ 퀴즈 이벤트</button>
                    <button className="button secondary" disabled={busy} onClick={() => runAdmin({ action: "createEvent", type: "praise" }, "새 칭찬 이벤트를 만들었습니다.")}>+ 칭찬 이벤트</button>
                    <button className="button secondary" disabled={busy} onClick={() => runAdmin({ action: "copyEvent" }, "이벤트 설정을 복사했습니다.")}>선택 이벤트 복사</button>
                  </div>
                </aside>
                <div className="admin-content">
              <nav className="admin-tabs" aria-label="관리자 메뉴">
                {([
                  ["settings", "이벤트 설정"],
                  ...(admin.settings.type === "quiz" ? [["quizzes", "퀴즈 관리"]] : []),
                  ["prizes", "상품 관리"],
                  ...(admin.settings.type === "praise" ? [["posts", "게시글 관리"]] : []),
                  ["status", "이벤트 현황"],
                  ["results", "결과"],
                  ["employees", "명단 관리"],
                ] as Array<[typeof adminTab, string]>).map(([id, label]) => <button key={id} className={adminTab === id ? "active" : ""} onClick={() => setAdminTab(id)}>{label}</button>)}
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
                  <div className="section-head compact"><div><h3>이벤트 설정</h3><p className="muted">{admin.settings.type === "quiz" ? "오늘의 퀴즈" : "칭찬 우체국"} · {admin.settings.status === "active" ? "진행 중" : admin.settings.status === "closed" ? "종료" : "준비 중"}</p></div>{admin.activeEventId !== admin.selectedEventId && <button className="button accent" disabled={busy} onClick={() => confirm("이 이벤트를 일반 화면에 활성화할까요? 현재 활성 이벤트는 종료 처리됩니다.") && runAdmin({ action: "activateEvent" }, "선택한 이벤트를 활성화했습니다.")}>이벤트 활성화</button>}</div>
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
                  <button className="button primary" disabled={busy} onClick={() => runAdmin({ action: "saveSettings", settings: admin.settings }, "설정을 저장했습니다.")}>설정 저장</button>
              </section>}

              {adminTab === "quizzes" && admin.settings.type === "quiz" && <section className="panel admin-section">
                <div className="section-head compact"><div><h3>일자별 퀴즈</h3><p className="muted">날짜별로 한 문제를 등록합니다. 직원은 해당 날짜의 문제만 볼 수 있습니다.</p></div><button className="button secondary" onClick={() => setAdmin({ ...admin, quizzes: [...admin.quizzes, { date: "", question: "", options: ["", "", "", ""], correctIndex: 0, subject: "", explanation: "" }] })}>문제 추가</button></div>
                <div className="quiz-editor-list">
                  {admin.quizzes.map((quiz, quizIndex) => <article className="quiz-editor" key={quiz.id || quizIndex}>
                    <div className="quiz-editor-head"><label>공개일<input type="date" value={quiz.date} onChange={(e) => { const quizzes = [...admin.quizzes]; quizzes[quizIndex] = { ...quiz, date: e.target.value }; setAdmin({ ...admin, quizzes }); }} /></label><label>주인공 또는 주제<input value={quiz.subject || ""} onChange={(e) => { const quizzes = [...admin.quizzes]; quizzes[quizIndex] = { ...quiz, subject: e.target.value }; setAdmin({ ...admin, quizzes }); }} placeholder="예: 정지영 강사" /></label><button className="icon-button" onClick={() => setAdmin({ ...admin, quizzes: admin.quizzes.filter((_item, index) => index !== quizIndex) })}>삭제</button></div>
                    <label>문제<input value={quiz.question} onChange={(e) => { const quizzes = [...admin.quizzes]; quizzes[quizIndex] = { ...quiz, question: e.target.value }; setAdmin({ ...admin, quizzes }); }} placeholder="정지영 강사가 가장 좋아하는 색깔은?" /></label>
                    <div className="quiz-option-editor">{quiz.options.map((option, optionIndex) => <label key={optionIndex}><span>{optionIndex + 1}번</span><input value={option} onChange={(e) => { const quizzes = [...admin.quizzes]; const options = [...quiz.options]; options[optionIndex] = e.target.value; quizzes[quizIndex] = { ...quiz, options }; setAdmin({ ...admin, quizzes }); }} /></label>)}</div>
                    <div className="two"><label>정답<select value={quiz.correctIndex} onChange={(e) => { const quizzes = [...admin.quizzes]; quizzes[quizIndex] = { ...quiz, correctIndex: Number(e.target.value) }; setAdmin({ ...admin, quizzes }); }}>{quiz.options.map((_option, index) => <option value={index} key={index}>{index + 1}번</option>)}</select></label><label>정답 공개 설명<input value={quiz.explanation || ""} onChange={(e) => { const quizzes = [...admin.quizzes]; quizzes[quizIndex] = { ...quiz, explanation: e.target.value }; setAdmin({ ...admin, quizzes }); }} placeholder="정답과 함께 보여줄 한마디" /></label></div>
                  </article>)}
                  {!admin.quizzes.length && <div className="empty-state compact-empty"><strong>등록된 퀴즈가 없습니다.</strong><p>문제 추가 버튼으로 첫 문제를 만들어 주세요.</p></div>}
                </div>
                <button className="button primary" disabled={busy} onClick={() => runAdmin({ action: "saveQuizzes", quizzes: admin.quizzes }, "퀴즈를 저장했습니다.")}>전체 퀴즈 저장</button>
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
                <div className="section-head compact"><div><h3>{admin.settings.type === "quiz" ? "직원별 퀴즈 참여 현황" : "직원별 스티커 현황"}</h3><p className="muted">{admin.settings.type === "quiz" ? "제출한 날짜 수와 정답 수를 확인합니다." : "출석과 칭찬 활동을 합산한 현재 스코어입니다."}</p></div><button className="button secondary" onClick={() => adminRequest()}>새로고침</button></div>
                <div className="table-wrap"><table><thead><tr><th>순위</th><th>직원</th><th>{admin.settings.type === "quiz" ? "참여 일수" : "출석"}</th><th>{admin.settings.type === "quiz" ? "정답 수" : "보낸 칭찬"}</th>{admin.settings.type === "praise" && <th>받은 칭찬</th>}<th>{admin.settings.type === "quiz" ? "추첨권" : "총 스티커"}</th></tr></thead><tbody>{admin.standings.map((row, index) => <tr key={row.employeeId}><td>{index + 1}</td><td><strong>{row.name}</strong><small>{row.employeeId}</small></td><td>{row.attendance}</td><td>{admin.settings.type === "quiz" ? row.received : row.sent}</td>{admin.settings.type === "praise" && <td>{row.received}</td>}<td><strong className="score">{row.tickets}</strong></td></tr>)}</tbody></table></div>
              </section>}

              {adminTab === "results" && <section className="admin-result-grid admin-section">
                <section className="panel">
                  <div className="section-head compact"><div><h3>현재 직원 스코어</h3><p className="muted">스티커가 많은 순서입니다.</p></div><button className="button secondary" onClick={() => adminRequest()}>실시간 새로고침</button></div>
                  <ol className="score-list">{admin.standings.map((row) => <li key={row.employeeId}><span>{row.name}</span><strong>{row.tickets}장</strong></li>)}</ol>
                </section>
                <section className="panel">
                  <div className="section-head compact"><div><h3>실시간 상품 순위</h3><p className="muted">스티커 스코어가 바뀌면 직원 순위도 자동으로 변경됩니다.</p></div></div>
                  <div className="ranked-prizes">{admin.prizes.flatMap((prize) => Array.from({ length: Math.max(1, prize.quantity) }, () => prize)).map((prize, index) => { const employee = admin.standings[index]; return <article key={`${prize.id || prize.name}-${index}`}><span className="rank-badge">{index + 1}위</span><div className="live-rank-info"><strong>{prize.name || "상품명 미입력"} {prize.amount > 0 && `${prize.amount.toLocaleString("ko-KR")}원`}</strong><p>{employee ? `${employee.name} · ${employee.tickets}장` : "해당 순위 직원 없음"}</p></div></article>; })}</div>
                  <div className="publish-result-box">
                    <div><strong>{admin.resultPublished ? "현재 결과가 공개되어 있습니다." : admin.hasPublishedResult ? "현재 결과가 숨김 상태입니다." : "이벤트 기간을 확인하세요."}</strong><p>{admin.hasPublishedResult ? "저장된 결과를 숨기거나 다시 공개할 수 있습니다." : "결과 공개 시점의 순위가 별도 자료로 보관됩니다."}</p></div>
                    {admin.resultPublished
                      ? <button className="button secondary" disabled={busy} onClick={() => runAdmin({ action: "toggleResultsVisibility", visible: false }, "결과를 숨겼습니다.")}>결과 숨기기</button>
                      : admin.hasPublishedResult
                        ? <button className="button primary" disabled={busy} onClick={() => runAdmin({ action: "toggleResultsVisibility", visible: true }, "결과를 다시 공개했습니다.")}>다시 공개</button>
                        : <button className="button primary" disabled={busy} onClick={() => confirm("현재 순위를 최종 결과로 공개할까요?") && runAdmin({ action: "publishResults" }, "이벤트 결과를 공개했습니다.")}>결과 공개</button>}
                  </div>
                </section>
              </section>}
                </div>
              </div>
            </>
          )}
        </section>
      ) : (
        <>
          {data.event.type === "praise" ? <>
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
          </> : <>
            <section className="entry-strip quiz-entry-strip">
              <div className="entry-message"><span className="entry-icon">Q</span><div><strong>{user ? `${user.name}님, 오늘의 문제가 도착했어요!` : "직원 인증 후 오늘의 퀴즈에 참여해 보세요"}</strong><span>정답 여부와 관계없이 제출하면 오늘의 출석으로 인정됩니다.</span></div></div>
              {!user && <button className="button entry-button" onClick={() => setLoginOpen(true)}>직원 인증하고 참여하기 <span>→</span></button>}
            </section>
            <section className="quiz-stage">
              <div className="quiz-stage-heading"><span className="section-label">TODAY&apos;S QUIZ</span><h2>오늘의 한 문제</h2><p>동료의 새로운 모습을 가볍게 알아보세요.</p></div>
              {!user ? <div className="panel quiz-locked"><span>?</span><strong>직원 인증 후 문제가 공개됩니다.</strong><p>이름과 사번만 입력하면 바로 참여할 수 있어요.</p><button className="button primary" onClick={() => setLoginOpen(true)}>문제 확인하기</button></div>
                : !data.quiz ? <div className="panel quiz-locked"><span>☕</span><strong>오늘은 등록된 문제가 없습니다.</strong><p>다음 문제를 기다려 주세요.</p></div>
                : <form className="panel daily-quiz-card" onSubmit={submitQuiz}>
                    <div className="quiz-day"><span>오늘의 주인공</span><strong>{data.quiz.subject || "우리 동료"}</strong></div>
                    <h2>{data.quiz.question}</h2>
                    <div className="quiz-options">{data.quiz.options.map((option, index) => <label className={quizAnswer === index ? "selected" : ""} key={index}><input type="radio" name="quiz-answer" checked={quizAnswer === index} onChange={() => setQuizAnswer(index)} disabled={Boolean(quizSubmission)} /><span>{index + 1}</span><strong>{option}</strong></label>)}</div>
                    {quizSubmission ? <div className="quiz-complete"><strong>✓ 오늘의 출석 완료</strong><p>{quizResult?.explanation || "오늘의 퀴즈에 참여해 주셔서 감사합니다."}</p></div> : <button className="button primary full" disabled={busy || quizAnswer === null}>{busy ? "제출하고 있어요…" : "정답 제출하고 출석하기"}</button>}
                  </form>}
            </section>
          </>}
        </>
      )}

      {(loginOpen || stickerOpen || loginResultOpen || eventDetailOpen || resultOpen || selectedPraise) && (
        <div className="modal-backdrop" onMouseDown={(event) => {
          if (event.currentTarget === event.target) {
            setLoginOpen(false); setStickerOpen(false); setLoginResultOpen(false); setEventDetailOpen(false); setResultOpen(false); setSelectedPraise(null);
          }
        }}>
          {loginOpen && (
            <form className="modal" onSubmit={employeeLogin}>
              <button type="button" className="modal-close" onClick={() => setLoginOpen(false)} aria-label="닫기">×</button>
              <div className="modal-symbol">★</div>
              <span className="section-label">WELCOME</span>
              <h2>직원 인증하고 입장하기</h2>
              <p className="muted">이름과 사번으로 재직 직원 여부를 확인합니다.</p>
              <label>이름<input autoFocus value={login.name} onChange={(e) => setLogin({ ...login, name: e.target.value })} placeholder="이름을 입력해 주세요" required /></label>
              <label>사번<input inputMode="numeric" value={login.employeeId} onChange={(e) => setLogin({ ...login, employeeId: e.target.value })} placeholder="사번을 입력해 주세요" required /></label>
              <button className="button primary full" disabled={busy}>{busy ? "확인하고 있어요…" : data.event.type === "quiz" ? "인증하고 퀴즈 보기" : "입장하고 스티커 받기"}</button>
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
              <h2>{data.settings.eventName} 안내</h2>
              <div className="event-detail-list">
                <article><span className="detail-number">01</span><div><h3>이벤트 일정</h3><p>{data.settings.detailSchedule}</p><EventPeriod settings={data.settings} /></div></article>
                <article><span className="detail-number">02</span><div><h3>{data.event.type === "quiz" ? "퀴즈 참여 및 출석 기준" : "출석 스티커 제공 기준"}</h3><p>{data.settings.detailAttendance}</p></div></article>
                <article><span className="detail-number">03</span><div><h3>상품 내용</h3><p>{data.settings.detailPrizes}</p>{data.prizes.length > 0 && <ul>{data.prizes.map((prize, index) => <li key={prize.id || index}><strong>{index + 1}위</strong> {prize.name} · {prize.quantity}개</li>)}</ul>}</div></article>
                <article><span className="detail-number">04</span><div><h3>유의사항</h3><p>{data.settings.detailNotes}</p></div></article>
              </div>
              <button className="button primary full" onClick={() => setEventDetailOpen(false)}>확인</button>
            </section>
          )}
          {resultOpen && (
            <section className="modal event-result-modal">
              <button className="modal-close" onClick={() => setResultOpen(false)} aria-label="닫기">×</button>
              <span className="section-label">EVENT RESULTS</span>
              <h2>이벤트 결과</h2>
              {data.results.length ? <div className="public-result-list">{data.results.map((result) => <article key={result.rank}><span className="rank-badge">{result.rank}위</span><div><strong>{result.prizeName} {result.amount > 0 && `${result.amount.toLocaleString("ko-KR")}원`}</strong><p>{result.winnerName ? `${result.winnerName} · ${result.tickets}장` : "해당 순위 없음"}</p></div></article>)}</div> : <div className="result-waiting"><span>★</span><strong>이벤트 진행중입니다.</strong><p>이벤트가 마감되고 결과가 공개되면 이곳에서 확인할 수 있어요.</p></div>}
              <button className="button primary full" onClick={() => setResultOpen(false)}>확인</button>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
