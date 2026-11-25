import {notices as originalNotices} from './data.js';

export const testNoticeBundles=[
 {id:'projects',title:'프로젝트와 공모전',description:'팀 활동과 개인 공모전의 작성 문항을 비교하세요.'},
 {id:'scholarships',title:'장학과 생활 지원',description:'학점, 거주 기간, 별도 증빙 조건을 확인하세요.'},
 {id:'careers',title:'진로와 직무 경험',description:'간단한 폼 신청부터 면담 준비까지 체험하세요.'},
 {id:'exchange',title:'교류와 캠퍼스 활동',description:'일정 확인과 선발 이후 절차를 준비하세요.'},
];
export const FIXTURE_VERSION=3;
export const activityTypes=['view','interest','start','complete','link'];
export const koreanDate=(date=new Date())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
export function addDays(day,offset){return new Date(Date.parse(day+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);}
const rule=(field,op,value,label,evidence)=>({field,op,value,label,evidence:'가상 모집 요강: '+evidence});
const enrolled=()=>rule('status','eq','재학','재학생','재학 중인 학생이 신청할 수 있습니다.');
const years=values=>rule('year','in',values,values.join('·')+'학년',values.join(', ')+'학년을 대상으로 합니다.');
const manual=(label,evidence)=>rule('manual','eq','확인',label,evidence);
const question=(label,hint,max=1000)=>({label,hint,max});

export function createTestNotices(anchor=koreanDate()){
 const specifications=[
  {base:originalNotices[0],title:'학생 프로젝트 모집',bundleId:'projects',owner:'a',offset:7},
  {base:originalNotices[0],title:'캠퍼스 아이디어 공모',bundleId:'projects',owner:'b',offset:4,summary:'캠퍼스에서 바꾸고 싶은 한 가지를 제안하는 가상 공모전입니다.',questions:[question('해결하고 싶은 문제','어떤 학생이 언제 불편을 겪는지 직접 적어 주세요.'),question('개선 제안','실행 방법과 확인할 결과를 적어 주세요.',1500)],tasks:['문제와 개선 제안 작성','참고 자료 정리','제출 양식 확인']},
  {title:'지역 문제 해결 리빙랩',bundleId:'projects',owner:'a',offset:21,status:'draft',category:'프로젝트',department:'학생지원팀',summary:'지역 기관과 팀을 꾸리는 가상 프로그램입니다. 모집 일정은 검수 전입니다.',rules:[enrolled(),manual('팀 구성 기준 확인','3~5명 팀의 구성원별 참여 가능 시간을 확인해야 합니다.')],tasks:['팀 구성 확인','프로젝트 제안서 작성','참여 일정 조율'],questions:[question('프로젝트 제안','해결할 지역 문제와 팀의 역할을 적어 주세요.')],followup:'선발 후 기관 담당자와 첫 미팅 일정을 조율합니다.'},
  {title:'학업 지속 장학금',bundleId:'scholarships',owner:'a',offset:2,category:'장학',department:'장학지원팀',summary:'학점 기준과 학업 계획을 함께 확인하는 가상 장학 공고입니다.',rules:[enrolled(),rule('gpa','min',3,'평균 학점 3.0 이상','직전 학기 평균 학점은 3.0 이상이어야 합니다.')],tasks:['학업 계획 직접 작성','성적증명서 준비','신청 양식 확인'],questions:[question('다음 학기 학업 계획','학업 목표와 장학금 활용 계획을 적어 주세요.',1500)],followup:'선발 결과와 추가 증빙 요청을 확인합니다.'},
  {title:'지역 거주 생활지원금',bundleId:'scholarships',owner:'a',offset:9,category:'장학',department:'장학지원팀',summary:'거주 기간과 별도 증빙을 확인하는 가상 지원금 공고입니다.',rules:[enrolled(),rule('residence','min',12,'지역 거주 12개월 이상','대상 지역 거주 기간이 12개월 이상이어야 합니다.'),manual('대상 지역과 증빙 확인','거주 지역과 증빙 발급일은 원문 기준을 별도로 확인해야 합니다.')],tasks:['대상 지역과 거주 기간 확인','주민등록 관련 증빙 준비','서류 발급일 확인'],questions:[],followup:'서류 보완 요청이 있으면 안내된 기한 안에 제출합니다.'},
  {title:'성장 경험 장학 에세이',bundleId:'scholarships',owner:'b',offset:-5,status:'archived',category:'장학',department:'장학지원팀',summary:'모집 종료 후 집계와 후속 안내를 확인하는 가상 공고입니다.',rules:[enrolled(),years(['2','3','4'])],tasks:['성장 경험 직접 작성','재학증명서 준비','제출 내용 확인'],questions:[question('성장 경험','학업 중 배운 점과 변화한 행동을 적어 주세요.',2000)],followup:'가상 심사 결과 안내와 장학금 지급 일정 확인 단계입니다.'},
  {title:'직무 탐색 오픈클래스',bundleId:'careers',owner:'a',offset:1,category:'진로',department:'취업지원팀',summary:'별도 지원서 없이 일정과 신청 폼만 확인하는 가상 강연입니다.',rules:[enrolled()],tasks:['참여 가능 시간 확인','질문 한 가지 준비','신청 폼 항목 확인'],questions:[],followup:'행사 전 장소와 입장 시간을 확인합니다.'},
  {title:'현직자 포트폴리오 피드백',bundleId:'careers',owner:'a',offset:6,category:'진로',department:'취업지원팀',summary:'포트폴리오 링크와 사전 질문을 준비하는 가상 상담입니다.',rules:[enrolled(),years(['3','4']),manual('포트폴리오 공개 범위 확인','상담용 링크가 담당자에게 열리는지 직접 확인해야 합니다.')],tasks:['상담 목표 직접 작성','포트폴리오 링크 권한 확인','사전 질문 정리','상담 가능 시간 선택'],questions:[question('상담 목표','포트폴리오에서 피드백받고 싶은 부분을 적어 주세요.',800),question('사전 질문','현직자에게 직접 물어볼 내용을 적어 주세요.',600)],followup:'배정된 상담 시간과 접속 안내를 확인합니다.'},
  {title:'겨울 직무 체험 프로그램',bundleId:'careers',owner:'b',offset:18,status:'draft',category:'진로',department:'취업지원팀',summary:'모집 조건과 일정을 검수하는 가상 임시저장 공고입니다.',rules:[enrolled(),years(['2','3','4'])],tasks:['지원 동기 작성','활동 일정 확인','참여 동의서 준비'],questions:[question('지원 동기','관심 직무와 배우고 싶은 내용을 적어 주세요.')],followup:'선발 후 사전 교육과 직무 배정 내용을 확인합니다.'},
  {title:'글로벌 버디 매칭',bundleId:'exchange',owner:'a',offset:12,category:'교류',department:'국제교류팀',summary:'관심 문화와 활동 가능 시간을 확인하는 가상 교류 프로그램입니다.',rules:[enrolled(),manual('활동 시간 참여 가능 여부','격주 모임 일정에 참여할 수 있는지 확인해야 합니다.')],tasks:['자기소개 직접 작성','활동 일정 확인','연락 동의 항목 확인'],questions:[question('자기소개','관심 있는 문화와 함께하고 싶은 활동을 적어 주세요.')],followup:'매칭 결과를 확인하고 첫 모임에 참여합니다.'},
  {title:'캠퍼스 문화기획단',bundleId:'exchange',owner:'b',offset:3,category:'교류',department:'학생지원팀',summary:'학과와 관계없이 행사 기획 경험을 쌓는 가상 활동입니다.',rules:[enrolled(),years(['1','2','3'])],tasks:['참여 동기 작성','담당하고 싶은 역할 선택','활동 일정 확인'],questions:[question('참여 동기','해 보고 싶은 캠퍼스 행사와 맡고 싶은 역할을 적어 주세요.')],followup:'선발 안내에서 오리엔테이션 날짜와 준비물을 확인합니다.'},
  {title:'국제교류 준비 워크숍',bundleId:'exchange',owner:'a',offset:-3,status:'archived',category:'교류',department:'국제교류팀',summary:'모집이 끝난 프로그램의 후속 절차와 집계를 확인하는 가상 공고입니다.',rules:[enrolled()],tasks:['참여 신청 항목 확인','여권 관련 안내 확인','사전 질문 준비'],questions:[],followup:'행사 자료와 참여 확인 안내를 확인합니다.'},
 ];
 return specifications.map((s,index)=>{
  const {base={},owner,offset,...overrides}=s;
  const status=s.status||'published';
  return {...structuredClone(base),...overrides,id:`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,title:'[테스트] '+s.title,owner_id:'test-manager-'+owner,status,dataKind:'test',isDemo:false,updated_at:addDays(anchor,-index)+'T09:00:00+09:00',deadline:addDays(anchor,offset),reviewed:status!=='draft',sourceUrl:'https://example.org/cuk-action-test',applicationUrl:'https://example.org/cuk-action-test/apply',applicationInstructions:'테스트 신청 경로입니다. 실제 신청이나 파일 제출을 받지 않습니다. 준비 흐름만 확인하세요.',deadlineEvidence:`화면 검증을 위해 정한 가상 마감일입니다: ${addDays(anchor,offset)}. 실제 모집 일정이 아닙니다.`,summary:s.summary||'학생과 담당자의 이용 흐름을 확인하는 가상 공고입니다. 실제 모집이 아닙니다.',label:'가상 테스트 공고',color:{장학:'orange',진로:'green',교류:'purple'}[s.category||base.category]||'blue'};
 });
}

export function createTestDatabase(anchor=koreanDate()){
 return {fixtureVersion:FIXTURE_VERSION,fixtureAnchorDate:anchor,students:{},events:[],notices:createTestNotices(anchor)};
}

export function migrateTestDatabase(db,anchor=koreanDate()){
 if(db.fixtureVersion>=FIXTURE_VERSION)return {db,changed:false};
 const fixtures=createTestNotices(anchor),byId=new Map(fixtures.map(n=>[n.id,n]));
 const ids=new Set(db.notices.map(n=>n.id));
 // Add bundle metadata only. Authored fields, student work and activity stay intact.
 const notices=db.notices.map(n=>!n.bundleId&&byId.has(n.id)?{...n,bundleId:byId.get(n.id).bundleId}:n);
 return {db:{...db,fixtureVersion:FIXTURE_VERSION,fixtureAnchorDate:db.fixtureAnchorDate||anchor,notices:[...notices,...fixtures.filter(n=>!ids.has(n.id))]},changed:true};
}

export function createScenarioEvents(anchor=koreanDate()){
 const events=[];
 createTestNotices(anchor).filter(n=>n.status!=='draft').forEach((notice,index)=>{
  const amount=80+index*17,last=notice.status==='archived'?-8:0;
  const limits={view:amount,interest:Math.floor(amount*(.43+(index%3)*.07)),start:Math.floor(amount*(.26+(index%2)*.08)),link:Math.floor(amount*.22),complete:Math.floor(amount*(.09+(index%3)*.035))};
  for(let person=0;person<amount;person++){
   const first=-29+Math.floor(((person*17)%amount)/amount*(30+last));
   const user_id='scenario-student-'+((person+index*47)%420);
   for(const [type,delay] of [['view',0],['interest',1],['start',2],['link',3],['complete',4]]){
    if(person>=limits[type])continue;
    const day=addDays(anchor,Math.min(last,first+delay));
    events.push({notice_id:notice.id,user_id,type,created_at:day+'T12:00:00+09:00'});
   }
  }
 });
 return events;
}

// Manager accounts are left out like migration 202611250002; only student activity is counted.
export function aggregateOverview({notices,events,ownerId,managerIds=[],fromDate,toDate,source}){
 const validDay=s=>typeof s==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(s)&&Number.isFinite(Date.parse(s+'T00:00:00Z'))&&new Date(s+'T00:00:00Z').toISOString().slice(0,10)===s;
 if(!validDay(fromDate)||!validDay(toDate)||fromDate>toDate||(Date.parse(toDate)-Date.parse(fromDate))/86400000>366)throw Error('집계 기간은 올바른 날짜로 최대 367일까지 선택하세요.');
 if(!['sample','activity'].includes(source))throw Error('집계 데이터 구분을 확인하세요.');
 const owned=notices.filter(n=>n.owner_id===ownerId),ids=new Set(owned.map(n=>n.id));
 const from=Date.parse(fromDate+'T00:00:00+09:00'),to=Date.parse(addDays(toDate,1)+'T00:00:00+09:00');
 const relevant=events.filter(e=>ids.has(e.notice_id)&&e.user_id!==ownerId&&!managerIds.includes(e.user_id)&&Date.parse(e.created_at)>=from&&Date.parse(e.created_at)<to);
 const countsFor=rows=>Object.fromEntries(activityTypes.map(type=>{const n=new Set(rows.filter(e=>e.type===type).map(e=>e.user_id)).size;return [type,n>0&&n<5?null:n];}));
 const counts=countsFor(relevant),trend=[],daily=new Map();
 for(const event of relevant){const day=new Date(Date.parse(event.created_at)+9*60*60*1000).toISOString().slice(0,10);if(!daily.has(day))daily.set(day,[]);daily.get(day).push(event);}
 for(let day=fromDate;day<=toDate;day=addDays(day,1))trend.push({date:day,...countsFor(daily.get(day)||[])});
 return {source,fromDate,toDate,counts,denominator:counts.view,denominatorLabel:'기간 내 담당 공고를 상세 조회한 고유 학생 수',trend,notices:owned.map(n=>({id:n.id,title:n.title,category:n.category,status:n.status,deadline:n.deadline,bundleId:n.bundleId,counts:countsFor(relevant.filter(e=>e.notice_id===n.id))})),suppressionThreshold:5,noticeCount:owned.length};
}
