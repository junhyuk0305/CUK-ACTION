"""CU12 option restrictions and simple-form completion, with all external requests blocked."""
from pathlib import Path
import json
import re
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:5173'
OUT = Path('tmp/browser-checks')
OUT.mkdir(parents=True, exist_ok=True)
CU12 = '[흐름 테스트] CU12 과목 선택'
SIMPLE = '[흐름 테스트] 나만의 휴식처 만들기'
DORM = '[검수 연습] K/A관 입사까지'


def enter(page, name):
    page.get_by_role('button', name=name + '로 체험', exact=True).click()


def leave(page):
    page.get_by_role('button', name='테스트 종료', exact=True).click()
    expect(page.get_by_role('button', name='학생 A로 체험', exact=True)).to_be_visible()


def saved(page):
    expect(page.locator('.data-status')).to_have_text('테스트 저장됨')


with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    context = browser.new_context(viewport={'width': 1440, 'height': 1000})
    external, errors = [], []

    def route(r):
        if r.request.url.startswith(BASE + '/'):
            r.continue_()
        else:
            external.append(r.request.url)
            r.abort()

    context.route('**/*', route)
    page = context.new_page()
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.goto(BASE + '/account.html')
    page.wait_for_load_state('networkidle')
    enter(page, '담당자 A')
    page.locator('.manager-workspace-tabs').get_by_role('button', name='공고 관리', exact=True).click()
    for title in [CU12, SIMPLE, DORM]:
        page.locator('.manager-template-details summary').click()
        page.get_by_label('검수 초안 선택', exact=True).select_option(label=title)
        page.get_by_role('button', name='초안 불러오기', exact=True).click()
        if title == CU12:
            expect(page.get_by_label('항목 1 CU12 개설 대학', exact=True)).to_have_value('home')
            expect(page.get_by_label('항목 2 CU12 개설 대학', exact=True)).to_have_value('other')
        page.get_by_label('원문과 조건, 마감, 신청 경로를 대조했습니다.', exact=True).check()
        page.locator('.manager-save-bar button[type="submit"]').click()
        expect(page.locator('.manager-workspace .success-note')).to_contain_text('게시했습니다')
        page.get_by_role('button', name='공고 관리로 돌아가기', exact=True).first.click()
    leave(page)
    enter(page, '학생 A')
    page.get_by_role('button', name='프로필 설정', exact=True).click()
    page.get_by_role('combobox', name='학년', exact=True).select_option('4')
    page.get_by_role('combobox', name='현재 학년의 학기', exact=True).select_option('2')
    page.get_by_role('button', name='프로필 저장', exact=True).click()
    saved(page)
    page.get_by_role('button', name=CU12, exact=True).click()
    expect(page.locator('.condition .status-text.pass')).to_have_count(1)
    expect(page.locator('.condition .status-text.unknown')).to_have_count(1)
    page.get_by_role('button', name='타 대학 과목 / 가상 제한 검사', exact=True).click()
    expect(page.locator('.condition .status-text.fail')).to_have_count(1)
    page.get_by_role('button', name='프로필 설정', exact=True).click()
    page.get_by_role('combobox', name='현재 학년의 학기', exact=True).select_option('')
    page.get_by_role('button', name='프로필 저장', exact=True).click()
    saved(page)
    expect(page.locator('.condition .status-text.unknown')).to_have_count(2)
    page.get_by_role('button', name='프로필 설정', exact=True).click()
    page.get_by_role('combobox', name='현재 학년의 학기', exact=True).select_option('1')
    page.get_by_role('button', name='프로필 저장', exact=True).click()
    saved(page)
    expect(page.locator('.condition .status-text.pass')).to_have_count(1)
    page.reload()
    page.wait_for_load_state('networkidle')
    page.get_by_role('button', name=CU12, exact=True).click()
    page.get_by_role('button', name='타 대학 과목 / 가상 제한 검사', exact=True).click()
    expect(page.locator('.condition .status-text.pass')).to_have_count(1)
    page.set_viewport_size({'width': 390, 'height': 844})
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth')
    page.screenshot(path=str(OUT / 'core-cu12-mobile.png'), full_page=True)
    page.set_viewport_size({'width': 1440, 'height': 1000})
    page.locator('.sidebar nav').get_by_role('button', name=re.compile('^공고 탐색')).click()
    page.get_by_role('button', name=SIMPLE, exact=True).click()
    page.get_by_role('button', name='지원 준비 시작', exact=True).click()
    page.locator('.detail-tabs').get_by_role('button', name='지원서 작성', exact=False).click()
    expect(page.locator('.question')).to_have_count(0)
    page.get_by_role('button', name='제출 준비 확인', exact=True).click()
    for checkbox in page.locator('.checklist input').all():
        checkbox.check()
    page.get_by_role('button', name='제출 완료 표시', exact=True).click()
    saved(page)
    expect(page.locator('.success-note')).to_contain_text('공식 접수 미연동')
    page.locator('.sidebar nav').get_by_role('button', name=re.compile('^공고 탐색')).click()
    page.get_by_role('button', name=DORM, exact=True).click()
    page.get_by_role('button', name='지원 준비 시작', exact=True).click()
    page.locator('.detail-tabs').get_by_role('button', name='제출 준비', exact=False).click()
    for checkbox in page.locator('.checklist input').all(): checkbox.check()
    page.get_by_role('button', name='제출 완료 표시', exact=True).click()
    for label in ['합격 여부 확인 / 합격', '호실 신청 완료', '납부 완료', '입사 시 필수 서류 제출 확인']:
        page.get_by_label(label, exact=True).check()
    saved(page)
    page.get_by_label('합격 여부 확인 / 합격', exact=True).uncheck()
    expect(page.get_by_label('입사 시 필수 서류 제출 확인', exact=True)).not_to_be_checked()
    expect(page.get_by_label('입사 시 필수 서류 제출 확인', exact=True)).to_be_disabled()
    saved(page)
    leave(page)
    enter(page, '담당자 A')
    page.locator('.manager-workspace-tabs').get_by_role('button', name='공고 관리', exact=True).click()
    page.locator('.manager-notice').filter(has_text=SIMPLE).get_by_role('button', name='집계 보기', exact=True).click()
    expect(page.locator('.manager-workspace')).to_contain_text('비공개')
    page.get_by_role('button', name='공고 관리로 돌아가기', exact=True).click()
    page.locator('.manager-notice').filter(has_text=DORM).get_by_role('button', name='집계 보기', exact=True).click()
    expect(page.locator('.workflow-metrics strong')).to_have_count(4)
    expect(page.locator('.workflow-metrics strong')).to_have_text(['0명', '0명', '0명', '0명'])
    assert not external, external
    assert not errors, errors
    (OUT / 'core-result.json').write_text(json.dumps({'passed': True, 'externalRequests': external, 'runtimeErrors': errors,
        'checks': ['CU12 parent rules retained', '4-2 home pass / other fail', 'missing semester unknown',
                   '4-1 other pass', 'profile reload', '390px no overflow', 'simple form self-report and protected metrics', 'four dorm follow-ups and prerequisite cancellation']}, ensure_ascii=False, indent=2), encoding='utf-8')
    browser.close()
    print('PASS core validation: CU12 selection, profile persistence, simple-form completion, protected metrics, external requests 0')
