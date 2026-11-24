import {archiveAiInput} from './archive.js';

export const reviewedNoticeTemplates = [{
  templateId: 'official-277842',
  title: "[취업지원팀] 2026학년도 동계 직무 부트캠프 안내(현직자 멘토와 직무 경험)",
  category: '진로',
  department: '취업지원팀',
  sourceUrl: 'https://www.catholic.ac.kr/ko/campuslife/notice.do?mode=view&articleNo=277842',
  summary: archiveAiInput('277842'),
  label: '실제 공고 초안',
  color: 'green',
  status: 'draft',
  reviewed: false,
  deadline: '2026-12-14',
  deadlineEvidence: '2. 모집일정 : ~ 2026.12.14.(월)',
  applicationUrl: '',
  rules: [{field:'status', op:'eq', value:'재학', label:'재학생', evidence:'1. 모집대상 : 가톨릭대학교 재학생 전체'}],
  tasks: [], questions: [],
  sourceReview: {checkedAt:'2026-11-16',scope:'공고 HTML 본문 발췌',remainingChecks:'신청 경로와 준비물을 원문에서 확인하세요.'},
}];
