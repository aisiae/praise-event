import { FieldValue } from "firebase-admin/firestore";
import { eventCollection } from "@/lib/events";

const september2026QuizSource = [
  { date: "2026-09-03", subject: "최준혁 센터장", question: "최준혁 센터장님이 가장 좋아하는 음식은 무엇일까요?", options: ["김치찜", "떡볶이", "만두", "해산물"], correctIndex: 2, facilitatorComment: "센터장님의 최애 메뉴는 만두입니다." },
  { date: "2026-09-04", subject: "직장인 공감", question: "월요일 아침, 직장인의 몸에서 가장 무거운 것은?", options: ["가방", "눈꺼풀", "발걸음", "책임감"], correctIndex: 2, facilitatorComment: "출근 방향으로 갈수록 중력이 강해집니다." },
  { date: "2026-09-05", subject: "지유경 주임", question: "지유경 주임님이 쉬는 날 가장 하고 싶은 일은 무엇일까요?", options: ["집에서 푹 쉬기", "여행 가기", "산책하기", "취미생활 하기"], correctIndex: 1, facilitatorComment: "쉬는 날엔 여행 모드 ON!" },
  { date: "2026-09-06", subject: "초성·출제자 사심", question: "초성 퀴즈. 출제자의 사심이 담긴 퀴즈입니다. ‘ㅅㄱ’의 정답은 무엇일까요?", options: ["상금", "소금", "사과", "수건"], correctIndex: 0, facilitatorComment: "사과도 좋지만 상금은 더 좋습니다." },
  { date: "2026-09-07", subject: "정지영 강사", question: "정지영 강사님이 어린 시절 꿈꿨던 직업은 무엇일까요?", options: ["디자이너", "유치원교사", "조각가", "가수"], correctIndex: 0, facilitatorComment: "어린 시절의 꿈은 디자이너였습니다." },
  { date: "2026-09-08", subject: "눈치·심리", question: "비밀번호를 틀렸을 때 가장 먼저 하는 행동은?", options: ["재설정한다", "키보드를 의심한다", "고객센터에 전화한다", "같은 비밀번호를 더 천천히 입력한다"], correctIndex: 3, facilitatorComment: "잘못 입력했다고 생각하고 천천히 다시 입력해 보는 게 국룰이죠." },
  { date: "2026-09-09", subject: "염민경 파트장", question: "염민경 파트장님의 의외의 특기는 무엇일까요?", options: ["코딩", "바이올린", "전기수리", "수세미 뜨기"], correctIndex: 1, facilitatorComment: "반전 매력의 정답은 바이올린!" },
  { date: "2026-09-10", subject: "초성·출제자 사심", question: "초성 퀴즈. ‘ㅌㄱ’ 중 출제자가 가장 하고 싶은 것은 무엇일까요?", options: ["탁구", "특근", "퇴근", "탐구"], correctIndex: 2, facilitatorComment: "저만 그런가요?" },
  { date: "2026-09-11", subject: "임초원 강사", question: "임초원 강사님이 가장 가고 싶어 하는 여행지는 어디일까요?", options: ["몰디브", "하와이", "아이슬란드", "스위스"], correctIndex: 2, facilitatorComment: "오로라의 나라 아이슬란드입니다." },
  { date: "2026-09-12", subject: "직장인 공감", question: "‘간단하게 이야기할게요’라는 말의 실제 의미는?", options: ["1분 안에 끝난다", "결론만 말한다", "이제부터 길게 말한다", "정말 간단하다"], correctIndex: 2, facilitatorComment: "진짜 간단하게 하는 사람은 거의 없어요~" },
  { date: "2026-09-13", subject: "김정경 파트장", question: "김정경 파트장님의 스트레스 해소 방법은 무엇일까요?", options: ["푹 자기", "맛있는 음식 먹기", "드라마·영화 보기", "산책하기"], correctIndex: 2, facilitatorComment: "화면 속 이야기로 스트레스를 날립니다." },
  { date: "2026-09-14", subject: "넌센스", question: "컴퓨터가 갑자기 느려졌을 때 가장 먼저 하는 말은?", options: ["얘가 오늘 왜 이러지?", "업데이트 때문인가?", "재부팅해 보자", "메모리를 확인해보자"], correctIndex: 0, facilitatorComment: "갑자기 이상해진 사람에 빗대어 표현하곤 하죠." },
  { date: "2026-09-15", subject: "유시은 파트장", question: "유시은 파트장님이 현재 즐기고 있는 취미는 무엇일까요?", options: ["낚시", "퍼즐", "골프", "온라인 게임"], correctIndex: 2, facilitatorComment: "현재 취미는 골프입니다." },
  { date: "2026-09-16", subject: "사심형", question: "출제자가 ‘정답은 없습니다’라고 말한 문제의 진짜 정답은?", options: ["1번", "2번", "출제자가 고른 답", "정말 정답이 없다"], correctIndex: 2, facilitatorComment: "정답은 없어도 출제자의 사심은 있습니다." },
  { date: "2026-09-17", subject: "지유경 주임", question: "지유경 주임님이 가장 자신 있게 만들 수 있는 음식은 무엇일까요?", options: ["계란볶음밥", "무우국", "강된장", "밑반찬"], correctIndex: 2, facilitatorComment: "밥 한 공기 소환하는 강된장입니다." },
  { date: "2026-09-18", subject: "초성·출제자 사심", question: "초성 퀴즈. 출제자의 사심이 담긴 퀴즈입니다. ‘ㅂㅅ’의 정답은 무엇일까요?", options: ["복수", "보상", "박수", "보석"], correctIndex: 1, facilitatorComment: "열심히 한 만큼 보상도 받고 싶어요~" },
  { date: "2026-09-19", subject: "최준혁 센터장", question: "최준혁 센터장님이 가장 좋아하는 동물은 무엇일까요?", options: ["고양이", "사막여우", "강아지", "늑대"], correctIndex: 3, facilitatorComment: "센터장님의 선택은 카리스마 넘치는 늑대!" },
  { date: "2026-09-20", subject: "눈치·심리", question: "단체사진을 찍은 뒤 사람들이 가장 먼저 확인하는 것은?", options: ["사진의 구도", "옆 사람의 표정", "자신의 얼굴", "회사 로고"], correctIndex: 2, facilitatorComment: "단체사진이지만 대부분 자신의 얼굴이 잘 나왔는지를 가장 먼저 봅니다." },
  { date: "2026-09-21", subject: "염민경 파트장", question: "염민경 파트장님이 노래방에서 가장 먼저 부르는 노래는 무엇일까요?", options: ["비와 당신", "나에게로의 초대", "우연히", "서시"], correctIndex: 1, facilitatorComment: "첫 곡부터 분위기를 잡는 ‘나에게로의 초대’입니다." },
  { date: "2026-09-22", subject: "넌센스", question: "내 통장에 자주 나타나는 계절은?", options: ["봄", "여름", "가을", "겨울"], correctIndex: 3, facilitatorComment: "내 통장은 늘 쌀쌀하네요." },
  { date: "2026-09-23", subject: "김정경 파트장", question: "김정경 파트장님이 가장 가고 싶어 하는 여행지는 어디일까요?", options: ["보라보라섬", "유럽", "스위스", "여수밤바다"], correctIndex: 2, facilitatorComment: "알프스가 기다리는 스위스입니다." },
  { date: "2026-09-24", subject: "직장인 공감", question: "회의가 길어질수록 가장 빠르게 줄어드는 것은?", options: ["회의 자료", "참석자의 집중력", "회사의 전기", "팀장님의 이야기"], correctIndex: 1, facilitatorComment: "자료는 그대로인데 집중력만 로그아웃됩니다." },
  { date: "2026-09-25", subject: "임초원 강사", question: "임초원 강사님의 의외의 특기는 무엇일까요?", options: ["길을 잘 찾는다", "노래", "힘이 세다", "통찰력"], correctIndex: 2, facilitatorComment: "보기보다 강한 반전 특기, 힘이 세다!" },
  { date: "2026-09-26", subject: "추억의 유행어", question: "세상에서 가장 쉬운 숫자는?", options: ["0", "19", "100", "190000"], correctIndex: 3, facilitatorComment: "십구만 > 쉽구만!" },
  { date: "2026-09-27", subject: "유시은 파트장", question: "유시은 파트장님의 의외의 특기는 무엇일까요?", options: ["전기수리를 잘한다", "한 번 간 길을 잘 기억한다", "바이올린을 켠다", "힘이 세다"], correctIndex: 1, facilitatorComment: "내비게이션이 긴장할 만한 길 찾기 능력입니다." },
  { date: "2026-09-28", subject: "넌센스", question: "오늘 출제자가 가장 두려워하는 것은 무엇일까요?", options: ["오답자가 많은 것", "상품이 부족한 것", "아무도 이 문제를 풀지 않는 것", "야근"], correctIndex: 2, facilitatorComment: "열심히 준비했는데 아무도 보지 않으면 무서워요~" },
  { date: "2026-09-29", subject: "정지영 강사", question: "정지영 강사님이 현재 즐기고 있는 취미는 무엇일까요?", options: ["중드 시청", "골프", "코딩", "퍼즐"], correctIndex: 2, facilitatorComment: "정답을 고르는 이 순간에도 코드는 돌아갑니다." },
  { date: "2026-09-30", subject: "의외의 정답", question: "출제자가 퀴즈 상품을 받으려면 몇 문제를 맞혀야 할까요?", options: ["1문제", "전체 문제", "출근 일수 만큼", "못받음"], correctIndex: 3, facilitatorComment: "저는 모든 정답을 알고 있으니까요~ 제가 문제를 풀면 아무도 이길 수 없죠~" },
] as const;

const answerPositions = [2, 1, 3, 0, 2, 3, 2, 1, 0, 3, 2, 1, 0, 3, 1, 2, 0, 3, 1, 0, 2, 1, 0, 3, 1, 2, 3, 0];

export const september2026Quizzes = september2026QuizSource.map((quiz, index) => {
  const options = [...quiz.options];
  const [answer] = options.splice(quiz.correctIndex, 1);
  const correctIndex = answerPositions[index];
  options.splice(correctIndex, 0, answer);
  return { ...quiz, options, correctIndex };
});

export async function ensureSeptember2026Quizzes(eventId: string) {
  const refs = september2026Quizzes.map((quiz) => eventCollection(eventId, "quizzes").doc(quiz.date));
  const snapshots = await eventCollection(eventId, "quizzes").firestore.getAll(...refs);
  const outdated = snapshots.flatMap((snapshot, index) => snapshot.data()?.seedVersion === 2 ? [] : [september2026Quizzes[index]]);
  if (!outdated.length) return;
  const batch = eventCollection(eventId, "quizzes").firestore.batch();
  for (const quiz of outdated) {
    batch.set(eventCollection(eventId, "quizzes").doc(quiz.date), { ...quiz, seedVersion: 2, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  }
  await batch.commit();
}
