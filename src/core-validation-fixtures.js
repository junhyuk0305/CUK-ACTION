import {createWorkflowTemplates} from './workflow-fixtures.js';
import {addDays, koreanDate} from './test-fixtures.js';

// A separate exercise preserves the original four fixtures and their saved IDs.
export function createCoreValidationTemplates(anchor = koreanDate()) {
  const base = createWorkflowTemplates(anchor)[2];
  const dorm = createWorkflowTemplates(anchor)[1];
  return [{...base, templateId: 'core-cu12', title: '[흐름 테스트] CU12 과목 선택',
    category: '기타', department: '학부대학운영팀',
    applicationUrl: 'https://example.org/cuk-action-test/cu12',
    sourceUrl: 'https://www.catholic.ac.kr/ko/campuslife/notice.do?mode=view&articleNo=277473',
    summary: '학년과 학기에 따른 과목 선택 제한을 확인합니다. 일정은 가상입니다.',
    deadline: addDays(anchor, 3),
    deadlineEvidence: `실제 마감 2026-11-10. 가상 마감 ${addDays(anchor, 3)}. 시각 미확인.`,
    sourceReview: {checkedAt: '2026-11-11', scope: '저장 본문 4항과 본교 개설교과목 표', remainingChecks: '매뉴얼 PDF와 타 대학 과목 목록 미확보. 타 대학 항목은 제한 검사 전용.'},
    rules: [{field: 'manual', op: 'eq', value: '확인', label: '학번별 이수구분과 수업 일정 확인', evidence: '본문 4항: 학번별 적용 영역과 과목별 수업 기간 확인. 첨부 매뉴얼 내부 미확인.'}],
    tasks: ['개설 대학과 수업 일정 확인', '학번별 이수구분 확인', '첨부 매뉴얼 확인'],
    followup: '수강신청 결과는 공식 사이트에서 직접 확인하세요.',
    options: [
      {id: 'home', label: '본교 인간학1', cu12Institution: 'home'},
      {id: 'other', label: '타 대학 과목 / 가상 제한 검사', cu12Institution: 'other'},
    ].map(o => ({...o, deadline: addDays(anchor, 3), deadlineEvidence: `실제 마감 2026-11-10. 가상 마감 ${addDays(anchor, 3)}.`, applicationUrl: 'https://example.org/cuk-action-test/cu12/' + o.id}))
  }, {...dorm, templateId: 'core-dorm-full', title: '[검수 연습] K/A관 입사까지',
    deadlineEvidence: `가상 마감 ${addDays(anchor, 3)}.`,
    sourceReview: {checkedAt: '2026-11-11', scope: '가상 연습 자료. 실제 공고 이미지 내용은 쓰지 않습니다.', remainingChecks: '나머지 페이지 예외 서류 미검수. 실제 건강정보와 파일을 받지 않습니다.'},
    followup: '합격 확인, 호실 신청, 납부 후 입사 시 필수 서류를 확인하세요. 모두 가상 자기보고입니다.',
    followupSteps: [...dorm.followupSteps,
      {id: 'entry-document', label: '입사 시 필수 서류 제출 확인', deadline: addDays(anchor, 12), deadlineTime: '', requires: 'payment',
        evidence: '가상 연습 근거: 입사 전 필수 서류를 제출했는지 학생이 직접 확인합니다. 날짜는 가상이며 건강정보와 파일은 수집하지 않습니다.'}]
  }];
}
