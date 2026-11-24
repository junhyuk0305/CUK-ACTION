"""Student discovery and changed-requirement UX in the isolated browser test space."""
from pathlib import Path
import re
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:5173'
KEY = 'cuk-action-test-v2'
NOTICE = '00000000-0000-4000-8000-000000000001'
TITLE = '[테스트] 학생 프로젝트 모집'
DRAFT = '학생이 직접 작성한 초안입니다. 변경된 공고에도 보존되어야 합니다.'


def saved(page):
    expect(page.locator('.data-status')).to_have_text('테스트 저장됨')


def navigate(page, label):
    if page.viewport_size['width'] < 768:
        page.get_by_role('button', name='메뉴', exact=True).click()
    page.locator('.sidebar nav').get_by_role('button', name=re.compile('^'+re.escape(label)+r'(?:\s*\d+)?$')).click()


def no_overflow(page, screen):
    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), screen


with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    context = browser.new_context(viewport={'width':1440, 'height':1000})
    page = context.new_page()
    errors, popups, backend_requests = [], [], []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('popup', lambda popup: popups.append(popup))
    page.on('request', lambda req: backend_requests.append(req.url) if 'supabase' in (urlparse(req.url).hostname or '') else None)
    page.goto(BASE + '/account.html')
    page.wait_for_load_state('networkidle')
    page.get_by_role('button', name='학생 A로 체험', exact=True).click()
    expect(page.get_by_text('테스트 공간 / 학생 A', exact=False)).to_be_visible()
    navigate(page, '공고 탐색')
    expect(page.locator('.bundle-grid > button')).to_have_count(4)
    expect(page.locator('.notice-card')).to_have_count(8)
    page.locator('.bundle-grid > button').filter(has_text='장학과 생활 지원').click()
    expect(page.locator('.notice-card')).to_have_count(2)
    expect(page.locator('.bundle-grid > button[aria-pressed="true"]')).to_have_count(1)
    page.get_by_role('button', name='모든 묶음', exact=True).click()
    expect(page.locator('.notice-card')).to_have_count(8)
    page.locator('.bundle-grid > button').filter(has_text='장학과 생활 지원').click()
    page.get_by_role('textbox', name='공고 검색', exact=True).fill('없는검색결과테스트')
    expect(page.locator('.notice-card')).to_have_count(0)
    page.get_by_role('button', name='검색 초기화', exact=True).click()
    expect(page.locator('.bundle-grid > button[aria-pressed="true"]')).to_have_count(0)
    expect(page.get_by_label('마감 전 공고만', exact=True)).not_to_be_checked()
    expect(page.locator('.notice-card')).to_have_count(8)
    page.get_by_role('textbox', name='공고 검색', exact=True).fill('학생 프로젝트 모집')
    page.get_by_role('button', name=TITLE, exact=True).click()
    page.get_by_role('button', name='목록으로', exact=True).click()
    expect(page.get_by_role('textbox', name='공고 검색', exact=True)).to_have_value('학생 프로젝트 모집')
    expect(page.locator('.notice-card')).to_have_count(1)

    page.get_by_role('button', name=TITLE, exact=True).click()
    page.get_by_role('button', name='직접 작성', exact=False).click()
    expect(page.get_by_role('textbox', name='지원 동기', exact=True)).to_be_disabled()
    page.get_by_role('button', name='제출 준비', exact=False).first.click()
    expect(page.locator('.checklist input:enabled')).to_have_count(0)
    page.wait_for_function("() => JSON.parse(localStorage.getItem('cuk-action-test-v2'))?.events.some(e=>e.type==='view')")
    assert page.evaluate("() => Object.keys(JSON.parse(localStorage.getItem('cuk-action-test-v2')).students['test-student-a']?.applications||{}).length") == 0
    assert page.evaluate("() => JSON.parse(localStorage.getItem('cuk-action-test-v2')).events.filter(e=>e.type==='start').length") == 0
    page.get_by_role('button', name='지원 준비 시작', exact=True).click()
    expect(page.locator('.checklist input:enabled')).to_have_count(3)
    page.get_by_role('button', name='직접 작성', exact=False).click()
    page.get_by_role('textbox', name='지원 동기', exact=True).fill(DRAFT)
    page.wait_for_function("([id,draft]) => JSON.parse(localStorage.getItem('cuk-action-test-v2')).students['test-student-a']?.applications[id]?.answers[0]===draft", arg=[NOTICE,DRAFT])
    page.reload()
    expect(page.get_by_text('테스트 공간 / 학생 A', exact=False)).to_be_visible()
    page.get_by_role('button', name='이어서 준비하기', exact=True).click()
    page.get_by_role('button', name='직접 작성', exact=False).click()
    expect(page.get_by_role('textbox', name='지원 동기', exact=True)).to_have_value(DRAFT)
    page.get_by_role('button', name='제출 준비 확인', exact=True).click()
    for checkbox in page.locator('.checklist input').all():
        checkbox.check()
    saved(page)
    page.get_by_role('link', name='테스트 신청 경로', exact=True).click()
    expect(page.get_by_text('테스트 신청 경로를 확인했습니다. 실제 접수 페이지는 연결하지 않았습니다.', exact=True)).to_be_visible()
    page.wait_for_function("() => JSON.parse(localStorage.getItem('cuk-action-test-v2')).events.some(e=>e.type==='link')")
    assert not popups, 'Synthetic application link opened a popup'
    assert page.evaluate("() => JSON.parse(localStorage.getItem('cuk-action-test-v2')).events.filter(e=>e.type==='complete').length") == 0

    # Simulate a manager publication update without touching the student's saved snapshot.
    page.evaluate("""id => {
        const db=JSON.parse(localStorage.getItem('cuk-action-test-v2'));
        const notice=db.notices.find(n=>n.id===id);
        notice.tasks.push('변경 후 추가한 활동 확인서');
        notice.questions.push({label:'변경 후 추가한 지원 문항',hint:'새 공식 양식에 직접 작성하세요.',max:800});
        const expired=db.notices.find(n=>n.id==='00000000-0000-4000-8000-000000000004');
        expired.deadline='2020-01-01';
        localStorage.setItem('cuk-action-test-v2',JSON.stringify(db));
    }""", NOTICE)
    page.reload()
    page.get_by_role('button', name='이어서 준비하기', exact=True).click()
    expect(page.locator('.changed-requirements')).to_contain_text('변경 후 추가한 활동 확인서')
    expect(page.locator('.changed-requirements')).to_contain_text('변경 후 추가한 지원 문항')
    expect(page.get_by_role('button', name='제출 완료 표시 · 자기보고', exact=True)).to_be_disabled()
    page.get_by_role('button', name='직접 작성', exact=False).click()
    expect(page.get_by_role('textbox', name='지원 동기', exact=True)).to_have_value(DRAFT)
    expect(page.get_by_role('textbox', name='변경 후 추가한 지원 문항', exact=True)).to_have_count(0)
    page.get_by_role('button', name='제출 준비 확인', exact=True).click()
    page.get_by_label('변경된 조건과 일정, 제출 항목을 확인하고 준비했습니다.', exact=True).check()
    expect(page.get_by_role('button', name='제출 완료 표시 · 자기보고', exact=True)).to_be_enabled()
    saved(page)
    navigate(page, '공고 탐색')
    expect(page.locator('.notice-card')).to_have_count(7)
    page.get_by_label('마감 전 공고만', exact=True).uncheck()
    expect(page.locator('.notice-card')).to_have_count(8)
    page.get_by_role('button', name='[테스트] 학업 지속 장학금', exact=True).click()
    expect(page.get_by_role('button', name='모집 종료', exact=True)).to_be_disabled()

    navigate(page, '내 신청')
    page.get_by_role('button', name='제출 자기보고 0', exact=True).click()
    expect(page.get_by_text('제출 완료를 표시한 신청이 없습니다.', exact=True)).to_be_visible()
    page.get_by_role('button', name='전체 신청 보기', exact=True).click()
    expect(page.locator('.application-row')).to_have_count(1)
    page.get_by_role('button', name='실제 공고 보관함', exact=True).click()
    page.get_by_role('textbox', name='실제 공고 검색', exact=True).fill('2026학년도 동계 직무 부트캠프')
    page.locator('.archive-list button').first.click()
    page.get_by_role('button', name='관심 등록', exact=True).click()
    saved(page)
    navigate(page, '관심 공고')
    expect(page.locator('.dataset-tabs')).to_have_count(0)
    expect(page.locator('.saved-archive')).to_have_count(1)
    expect(page.locator('.discovery-controls > span')).to_contain_text('1건')
    page.get_by_role('textbox', name='공고 검색', exact=True).fill('없는검색결과테스트')
    expect(page.locator('.saved-archive')).to_have_count(0)
    expect(page.locator('.discovery-controls > span')).to_contain_text('0건')
    expect(page.get_by_text('검색 결과가 없습니다.', exact=True)).to_be_visible()
    page.get_by_role('button', name='검색 초기화', exact=True).click()
    page.get_by_role('textbox', name='공고 검색', exact=True).fill('2026학년도 동계 직무 부트캠프')
    page.get_by_role('button', name='본문 확인', exact=True).click()
    page.get_by_role('button', name='관심 목록으로', exact=True).click()
    expect(page.locator('.page-heading h1')).to_have_text('관심 있는 기회')
    expect(page.get_by_role('textbox', name='공고 검색', exact=True)).to_have_value('2026학년도 동계 직무 부트캠프')
    expect(page.locator('.saved-archive')).to_have_count(1)
    screenshots=Path('tmp/browser-checks')
    screenshots.mkdir(parents=True, exist_ok=True)
    page.screenshot(path=str(screenshots/'student-saved-desktop.png'), full_page=True)

    page.set_viewport_size({'width':390, 'height':844})
    page.get_by_role('button', name='본문 확인', exact=True).click()
    no_overflow(page, 'mobile saved source overflow')
    page.get_by_role('button', name='관심 목록으로', exact=True).click()
    no_overflow(page, 'mobile saved list overflow')
    page.screenshot(path=str(screenshots/'student-saved-mobile.png'), full_page=True)
    navigate(page, '공고 탐색')
    no_overflow(page, 'mobile discovery overflow')
    expect(page.locator('.bundle-grid > button')).to_have_count(4)
    page.get_by_role('button', name=TITLE, exact=True).click()
    no_overflow(page, 'mobile changed requirements overflow')
    page.get_by_role('button', name='직접 작성', exact=False).click()
    expect(page.get_by_role('textbox', name='지원 동기', exact=True)).to_have_value(DRAFT)
    no_overflow(page, 'mobile draft overflow')
    page.screenshot(path=str(screenshots/'student-ux-mobile.png'), full_page=True)
    assert not errors, errors
    assert not backend_requests, backend_requests
    print('PASS student UX: bundle/search reset, filtered back navigation, saved archive search/count/back, empty application tabs, explicit preparation start, reload session/draft, changed requirements, test links, expired notices, mobile 390px, no Supabase requests')
    browser.close()
