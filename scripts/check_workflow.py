"""Offline end-to-end exercise using real UI transitions and historical-source fixtures."""
from pathlib import Path
import json
import re
from playwright.sync_api import sync_playwright, expect

from browser_helpers import BASE, finish_onboarding
OUT = Path('tmp/browser-checks')
OUT.mkdir(parents=True, exist_ok=True)
BIO = '[흐름 테스트] 바이오헬스 아카데미'
DORM = '[흐름 테스트] K관/A관 기숙사'
SIMPLE = '[흐름 테스트] 나만의 휴식처 만들기'
CONFLICT = '[흐름 테스트] 일정 확인 필요 사례'


def enter(page, name):
    page.get_by_role('button', name=name + '로 체험', exact=True).click()
    if name.startswith('학생'): finish_onboarding(page)
    expect(page.get_by_role('button', name='테스트 종료', exact=True)).to_be_visible()


def leave(page):
    page.get_by_role('button', name='테스트 종료', exact=True).click()
    expect(page.get_by_role('button', name='학생 A로 체험', exact=True)).to_be_visible()


def saved(page):
    expect(page.locator('.data-status')).to_have_text('테스트 저장됨')


def menu(page, name):
    if page.viewport_size['width'] < 1000:
        page.get_by_role('button', name='메뉴', exact=True).click()
    page.locator('.sidebar nav').get_by_role('button', name=re.compile('^' + re.escape(name))).click()


def publish(page):
    page.get_by_label('원문과 조건, 마감, 신청 경로를 대조했습니다.', exact=True).check()
    page.locator('.manager-save-bar button[type="submit"]').click()
    expect(page.locator('.manager-workspace .success-note')).to_contain_text('게시했습니다')


def no_overflow(page):
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), 'horizontal overflow'


with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    external = []
    def route(request_route):
        if request_route.request.url.startswith(BASE + '/'):
            request_route.continue_()
        else:
            external.append(request_route.request.url)
            request_route.abort()
    context.route('**/*', route)
    page = context.new_page()
    errors, popups = [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('popup', lambda popup: popups.append(popup.url))
    page.on('dialog', lambda dialog: dialog.accept())
    page.goto(BASE + '/account.html')
    page.wait_for_load_state('networkidle')
    expect(page.get_by_role('button', name='학생 A로 체험', exact=True)).to_be_visible()
    enter(page, '담당자 A')
    page.locator('.sidebar').get_by_role('button', name='공고 관리', exact=True).click()
    for index, title in enumerate([BIO, DORM, SIMPLE, CONFLICT], start=1):
        page.locator('.manager-template-details summary').click()
        page.get_by_label('검수 초안 선택', exact=True).select_option(label=title)
        page.get_by_role('button', name='초안 불러오기', exact=True).click()
        expect(page.get_by_label('공고 제목', exact=True)).to_have_value(title)
        expect(page.locator('.manager-editor-heading .tag')).to_have_text('임시저장')
        # Imported drafts come from school notices, so they open as external-link notices.
        expect(page.get_by_role('radio', name='외부 링크 신청', exact=True)).to_be_checked()
        if title == BIO:
            expect(page.get_by_label('항목 1 이름', exact=True)).to_have_value('1기 제약바이오·의료기기')
            page.get_by_role('button', name='문항 추가', exact=True).click()
            page.get_by_label('문항 제목', exact=True).fill('가상 사전 질문')
            page.get_by_label('작성 안내', exact=True).fill('테스트용 질문입니다. 직접 입력하세요.')
        publish(page)
        page.get_by_role('button', name='공고 관리로', exact=True).first.click()
    db = page.evaluate("JSON.parse(localStorage.getItem('cuk-action-test-v2'))")
    bio_id = next(n['id'] for n in db['notices'] if n['title'] == BIO)
    dorm_id = next(n['id'] for n in db['notices'] if n['title'] == DORM)
    assert len([n for n in db['notices'] if n.get('testScenario')]) == 4
    print('PASS review and publication', flush=True)
    leave(page)

    enter(page, '학생 A')
    menu(page, '내 정보')
    page.get_by_label('가상 학생 유형', exact=True).select_option(label='학점 경계값 3.0')
    expect(page.get_by_label('평균 학점', exact=False)).to_have_value('3.0')
    page.get_by_role('button', name='내 정보 저장', exact=True).click()
    saved(page)
    menu(page, '홈')
    page.get_by_role('button', name=BIO, exact=True).click()
    expect(page.locator('.option-picker button')).to_have_count(2)
    page.get_by_role('button', name='지원 준비 시작', exact=True).click()
    page.locator('.detail-tabs').get_by_role('button', name='지원서 작성', exact=False).click()
    page.get_by_role('textbox', name='가상 사전 질문', exact=True).fill('1기 질문은 보존됩니다.')
    page.get_by_role('button', name='제출 준비 확인', exact=True).click()
    for checkbox in page.locator('.checklist input').all(): checkbox.check()
    saved(page)
    page.get_by_role('link', name='테스트 신청 경로', exact=True).click()
    saved(page)
    expect(page.get_by_role('button', name='제출 완료 표시', exact=True)).to_be_enabled()
    page.get_by_role('button', name='제출 완료 표시', exact=True).click()
    saved(page)
    page.get_by_role('button', name='2기 K-뷰티·의료행정', exact=True).click()
    page.get_by_role('button', name='지원 준비 시작', exact=True).click()
    expect(page.locator('.checklist input:checked')).to_have_count(0)
    page.locator('.detail-tabs').get_by_role('button', name='지원서 작성', exact=False).click()
    expect(page.get_by_role('textbox', name='가상 사전 질문', exact=True)).to_have_value('')
    page.get_by_role('textbox', name='가상 사전 질문', exact=True).fill('2기는 별도 작성합니다.')
    saved(page)
    page.reload()
    menu(page, '내 신청')
    expect(page.locator('.application-row')).to_have_count(2)
    page.locator('.application-row').filter(has_text='2기 K-뷰티').get_by_role('button', name='이어서 준비하기', exact=True).click()
    page.locator('.detail-tabs').get_by_role('button', name='지원서 작성', exact=False).click()
    expect(page.get_by_role('textbox', name='가상 사전 질문', exact=True)).to_have_value('2기는 별도 작성합니다.')
    page.set_viewport_size({'width': 390, 'height': 844})
    no_overflow(page)
    page.screenshot(path=str(OUT / 'workflow-options-mobile.png'), full_page=True)
    page.set_viewport_size({'width': 1440, 'height': 1000})
    # Switching sessions inside the detail adds no history entry; one device back returns to 내 신청.
    page.get_by_role('button', name='1기 제약바이오·의료기기', exact=True).click()
    page.go_back()
    expect(page.locator('.application-row')).to_have_count(2)
    expect(page.locator('.application-row').filter(has_text='2기 K-뷰티').get_by_role('button', name='이어서 준비하기', exact=True)).to_be_focused()
    leave(page)

    print('PASS independent applications and reload', flush=True)
    # Change source conditions through the manager UI, keeping the student's old draft.
    enter(page, '담당자 A')
    page.locator('.sidebar').get_by_role('button', name='공고 관리', exact=True).click()
    page.locator('.manager-notice').filter(has_text=BIO).get_by_role('button', name='공고 수정', exact=True).click()
    page.get_by_label('항목 1 마감일', exact=True).fill('2020-01-01')
    page.get_by_label('항목 1 마감 근거', exact=True).fill('가상 상황: 1기만 마감했습니다. 2기는 계속 모집합니다.')
    page.get_by_label('준비 체크리스트', exact=False).fill('희망 기수와 교육 일정 확인\n배움인 가입 절차 확인\n선택 기수 신청 여부 확인\n가상 추가 확인서 준비')
    publish(page)
    # A notice opened from the manager in the student view goes back to its 공고 집계.
    page.get_by_role('button', name='학생 화면에서 보기', exact=True).click()
    expect(page.locator('main .back')).to_have_text('공고 집계로')
    page.locator('main .back').click()
    expect(page.locator('.workflow-metrics')).to_be_visible()
    leave(page)
    enter(page, '학생 A')
    menu(page, '알림')
    expect(page.locator('.notification').filter(has_text='공고 변경 확인 필요')).to_have_count(2)
    menu(page, '내 신청')
    page.locator('.application-row').filter(has_text='2기 K-뷰티').get_by_role('button', name='이어서 준비하기', exact=True).click()
    expect(page.locator('.changed-requirements')).to_contain_text('가상 추가 확인서 준비')
    expect(page.get_by_role('button', name='제출 완료 표시', exact=True)).to_be_disabled()
    page.locator('.detail-tabs').get_by_role('button', name='지원서 작성', exact=False).click()
    expect(page.get_by_role('textbox', name='가상 사전 질문', exact=True)).to_have_value('2기는 별도 작성합니다.')
    page.get_by_role('button', name='제출 준비 확인', exact=True).click()
    page.get_by_label('변경된 조건과 일정, 제출 항목을 확인하고 준비했습니다.', exact=True).check()
    for checkbox in page.locator('.checklist input').all(): checkbox.check()
    expect(page.get_by_role('button', name='제출 완료 표시', exact=True)).to_be_enabled()
    saved(page)
    menu(page, '공고 탐색')
    page.get_by_role('button', name=DORM, exact=True).click()
    page.get_by_role('button', name='지원 준비 시작', exact=True).click()
    expect(page.get_by_label('합격 여부 확인 / 합격', exact=True)).to_be_disabled()
    for checkbox in page.locator('.checklist input').all(): checkbox.check()
    page.get_by_role('button', name='제출 완료 표시', exact=True).click()
    page.get_by_label('합격 여부 확인 / 합격', exact=True).check()
    page.get_by_label('호실 신청 완료', exact=True).check()
    expect(page.get_by_label('납부 완료', exact=True)).to_be_enabled()
    saved(page)
    menu(page, '알림')
    expect(page.locator('.notification').filter(has_text=DORM)).to_contain_text('후속 절차 확인 필요 / 2/3 완료')
    page.locator('.notification').filter(has_text=DORM).get_by_role('button', name='확인하기', exact=True).click()
    page.get_by_label('납부 완료', exact=True).check()
    page.get_by_label('합격 여부 확인 / 합격', exact=True).uncheck()
    expect(page.get_by_label('호실 신청 완료', exact=True)).not_to_be_checked()
    expect(page.get_by_label('납부 완료', exact=True)).to_be_disabled()
    for name in ['합격 여부 확인 / 합격', '호실 신청 완료', '납부 완료']: page.get_by_label(name, exact=True).check()
    saved(page)
    page.set_viewport_size({'width': 390, 'height': 844})
    no_overflow(page)
    page.evaluate('window.scrollTo(0,0)')
    expect(page.locator('.toast')).not_to_be_visible(timeout=6000)
    page.screenshot(path=str(OUT / 'workflow-followup-mobile.png'), full_page=True)
    page.set_viewport_size({'width': 1440, 'height': 1000})
    menu(page, '알림')
    expect(page.locator('.notification').filter(has_text=DORM)).to_have_count(0)
    menu(page, '공고 탐색')
    page.get_by_role('button', name=SIMPLE, exact=True).click()
    page.locator('.detail-tabs').get_by_role('button', name='지원서 작성', exact=False).click()
    expect(page.locator('.question')).to_have_count(0)
    menu(page, '공고 탐색')
    page.get_by_role('button', name=CONFLICT, exact=True).click()
    expect(page.locator('.detail-facts')).to_contain_text('마감 자료 불일치 / 확인 필요')
    expect(page.get_by_text('마감이 확정되지 않았습니다. 신청 전 담당자 확인이 필요합니다.', exact=True)).to_be_visible()
    leave(page)

    enter(page, '학생 B')
    menu(page, '내 신청')
    expect(page.locator('.application-row')).to_have_count(0)
    menu(page, '공고 탐색')
    page.get_by_role('button', name=BIO, exact=True).click()
    expect(page.get_by_role('button', name='2기 K-뷰티·의료행정', exact=True)).to_have_attribute('aria-pressed', 'true')
    page.get_by_role('button', name='1기 제약바이오·의료기기', exact=True).click()
    expect(page.get_by_role('button', name='모집 종료', exact=True)).to_be_disabled()
    leave(page)

    enter(page, '담당자 A')
    page.locator('.sidebar').get_by_role('button', name='공고 관리', exact=True).click()
    page.locator('.manager-notice').filter(has_text=BIO).get_by_role('button', name='집계 보기', exact=True).click()
    expect(page.locator('.workflow-metrics tbody tr')).to_have_count(2)
    expect(page.locator('.workflow-metrics')).to_contain_text('비공개')
    expect(page.locator('.manager-workspace')).not_to_contain_text('1기 질문은 보존됩니다.')
    page.set_viewport_size({'width': 390, 'height': 844})
    no_overflow(page)
    page.evaluate('window.scrollTo(0,0)')
    page.screenshot(path=str(OUT / 'workflow-metrics-mobile.png'), full_page=True)
    page.set_viewport_size({'width': 1440, 'height': 1000})
    page.get_by_role('button', name='공고 관리로', exact=True).click()
    page.locator('.manager-notice').filter(has_text=DORM).get_by_role('button', name='집계 보기', exact=True).click()
    expect(page.locator('.workflow-metrics')).to_contain_text('학생이 표시한 현재 후속 절차')
    expect(page.locator('.workflow-metrics strong')).to_have_count(3)
    page.screenshot(path=str(OUT / 'workflow-metrics-desktop.png'), full_page=True)
    leave(page)
    enter(page, '담당자 B')
    page.locator('.sidebar').get_by_role('button', name='공고 관리', exact=True).click()
    expect(page.locator('.manager-list')).not_to_contain_text(BIO)
    leave(page)
    enter(page, '담당자 A')
    page.locator('.sidebar').get_by_role('button', name='공고 관리', exact=True).click()
    page.locator('.manager-notice').filter(has_text=BIO).get_by_role('button', name='공고 수정', exact=True).click()
    page.get_by_role('button', name='신청 항목 1 삭제', exact=True).click()
    publish(page)
    leave(page)
    enter(page, '학생 A')
    menu(page, '내 신청')
    page.locator('.application-row').filter(has_text='1기 제약바이오').get_by_role('button', name='후속 절차 확인', exact=True).click()
    expect(page.get_by_text('게시가 종료된 공고입니다. 이전 작성 내용은 계속 확인할 수 있습니다.', exact=True)).to_be_visible()
    page.locator('.detail-tabs').get_by_role('button', name='지원서 작성', exact=False).click()
    expect(page.get_by_role('textbox', name='가상 사전 질문', exact=True)).to_have_value('1기 질문은 보존됩니다.')
    saved(page)
    expect(page.get_by_text('작성 내용은 저장됐지만 활동 집계 기록을 저장하지 못했습니다.', exact=False)).to_have_count(0)
    assert not external, external
    assert not errors, errors
    assert not popups, popups
    result = {'passed': True, 'external_requests': len(external), 'runtime_errors': errors, 'sample_notices': 4,
              'flows': ['manager review and publication', 'two separate applications', 'draft restoration', 'source change acknowledgement', 'deadline expiry', 'sequential follow-up and cancellation', 'in-app alerts', 'simple form', 'conflict warning', 'student and manager isolation', 'private aggregate', 'deleted option draft preservation', '390px mobile']}
    (OUT / 'workflow-result.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    print('PASS offline workflow: ' + ', '.join(result['flows']) + '; external requests=0')
    browser.close()
