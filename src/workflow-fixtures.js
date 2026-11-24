import {initialProfile} from './data.js';
import {addDays, koreanDate} from './test-fixtures.js';

const manual = (label, evidence) => ({field: 'manual', op: 'eq', value: '확인', label, evidence});
// Pure so production builds drop it when the demo profile picker is compiled out.
export const testStudentProfiles = /*#__PURE__*/ [
  ['정보 미입력', {}], ['1학년 재학생', {year: '1', status: '재학'}],
  ['3학년 경영학과', {year: '3', status: '재학', department: '경영학과', interests: ['진로']}],
  ['휴학생', {year: '2', status: '휴학'}], ['졸업생', {year: '4', status: '졸업'}],
  ['학점 경계값 3.0', {year: '2', status: '재학', gpa: '3.0'}],
  ['학점 미충족 2.99', {year: '2', status: '재학', gpa: '2.99'}],
  ['학점 0 입력', {year: '2', status: '재학', gpa: '0'}],
].map(([label, values]) => ({label, profile: {...initialProfile, interests: [], name: '가상 학생', ...values}}));

// Historical sources only. Dates below are deliberately rebased for repeatable offline exercises.
export function createWorkflowTemplates(anchor = koreanDate()) {
  const base = (id, title, category, department, offset) => ({
    templateId: 'workflow-' + id, title: '[흐름 테스트] ' + title, category, department,
    status: 'draft', reviewed: false, dataKind: 'test', testScenario: true, color: 'blue',
    sourceUrl: 'https://www.catholic.ac.kr/ko/campuslife/notice.do?mode=view&articleNo=' + id,
    applicationUrl: 'https://example.org/cuk-action-test/' + id,
    applicationInstructions: '테스트 경로입니다. 실제 신청이나 파일 전송은 하지 않습니다.',
    deadline: addDays(anchor, offset), deadlineTime: '',
    deadlineEvidence: `흐름 검증용 가상 마감: ${addDays(anchor, offset)}. 실제 모집 일정이 아닙니다.`,
    questions: [], sourceReview: {checkedAt: '2026-11-06', scope: '저장 공고와 공고 인사이트 1·2차 검수 기록. 최신 원문 재확인 없음.', remainingChecks: '외부 신청 화면과 첨부 내부는 미검수. 날짜는 가상 일정으로 바꿨습니다.'},
  });
  return [
    {...base('277447', '바이오헬스 아카데미', '진로', '대학일자리플러스센터', 8),
      summary: '한 공고에서 두 기수를 각각 준비합니다. 일정은 가상입니다.',
      rules: [manual('관심 분야와 교육 일정 확인', '저장 본문: 바이오헬스 분야 취업에 관심 있는 누구나. 학과 제한으로 바꾸지 않습니다.')],
      tasks: ['희망 기수와 교육 일정 확인', '배움인 가입 절차 확인', '선택 기수 신청 여부 확인'],
      followup: '각 기수의 교육 안내와 수료증 발급 조건을 확인하세요.',
      options: [
        {id: 'first', label: '1기 제약바이오·의료기기', deadline: addDays(anchor, 1), deadlineTime: '17:00', deadlineStatus: 'confirmed', deadlineEvidence: '가상 마감 시각 17:00. 저장 자료의 실제 신청 마감은 2026-11-11이며 시각은 미확인.', applicationUrl: 'https://example.org/cuk-action-test/bio/first'},
        {id: 'second', label: '2기 K-뷰티·의료행정', deadline: addDays(anchor, 8), deadlineTime: '', deadlineStatus: 'confirmed', deadlineEvidence: '가상 마감일. 저장 자료의 실제 신청 마감은 2026-11-18이며 시각은 미확인.', applicationUrl: 'https://example.org/cuk-action-test/bio/second'},
      ]},
    {...base('277446', 'K관/A관 기숙사', '기타', '기숙사운영센터', 3),
      summary: '신청 후 합격 확인, 호실 신청, 납부를 순서대로 확인합니다.',
      rules: [{field: 'status', op: 'in', value: ['재학', '휴학'], label: '재학생 또는 휴학생', evidence: '가상 연습 근거: 재학생과 휴학생이 신청할 수 있다고 가정합니다.'}, manual('본교 정규과정 소속 확인', '학부생 또는 대학원생 여부와 나머지 예외 조건은 원문 확인 필요.')],
      tasks: ['거주기간 선택', '포털 입사 신청 항목 확인'],
      followup: '합격한 경우에만 호실 신청과 납부를 진행하세요. 모두 자기보고입니다.',
      followupSteps: [
        {id: 'accepted', label: '합격 여부 확인 / 합격', deadline: addDays(anchor, 5), deadlineTime: '', evidence: '가상 연습 근거: 신청 후 합격 여부를 확인합니다. 날짜는 가상입니다.', requires: ''},
        {id: 'room', label: '호실 신청 완료', deadline: addDays(anchor, 7), deadlineTime: '17:00', evidence: '가상 연습 근거: 합격 후 호실을 신청합니다. 기한은 가상입니다.', requires: 'accepted'},
        {id: 'payment', label: '납부 완료', deadline: addDays(anchor, 9), deadlineTime: '16:00', evidence: '가상 연습 근거: 호실 신청 후 납부합니다. 기한은 가상입니다.', requires: 'room'},
      ]},
    {...base('277144', '나만의 휴식처 만들기', '교류', '학생생활상담소', 3),
      summary: '조건과 일정을 확인하고 간단한 폼 신청을 준비합니다.',
      rules: [manual('우리 대학 기숙사생', '저장 본문: 우리 대학 기숙사생 10명 내외. 현재 프로필로 기숙사 거주를 확인할 수 없습니다.')],
      tasks: ['기숙사 거주 대상 확인', '참석 가능 시간 확인'],
      followup: '저장 자료의 행사 일정은 2026-11-17 17~19시입니다. 현재 진행 여부는 확인하지 않았습니다.'},
    {...base('276935', '일정 확인 필요 사례', '교류', '학생생활상담소', 3),
      summary: '마음건강케어 저장 자료에 가상 마감 충돌을 추가한 테스트입니다.',
      deadlineStatus: 'conflict',
      deadlineEvidence: '가상 상황: 본문과 포스터의 마감일이 다름.',
      rules: [manual('중국인 유학생 대상 확인', '저장 본문: 중국인 유학생 8~15명 내외. 중국어 가능 여부로 대상 자격을 대신 판단하지 않습니다.')],
      tasks: ['담당자에게 일정 확인', '참석 가능 시간 확인'],
      followup: '날짜가 확인되기 전에는 확정 마감으로 안내하지 않습니다.'},
  ];
}
