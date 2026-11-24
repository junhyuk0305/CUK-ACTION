"""UI integration against the explicitly labelled browser test adapter, not live Auth."""
from pathlib import Path
import re
from playwright.sync_api import sync_playwright, expect

BASE = 'http://127.0.0.1:5173'
TITLE = '[테스트 검증] 담당자 게시 흐름'
screenshots = Path('tmp/browser-checks')
screenshots.mkdir(parents=True, exist_ok=True)


def no_overflow(page, name):
    assert page.evaluate('document.documentElement.scrollWidth <= window.innerWidth'), name


def enter(page, account):
    page.get_by_role('button', name='공고 담당자' if '담당자' in account else '학생', exact=True).click()
    if page.get_by_role('button', name='테스트 공간 열기', exact=True).count():
        page.get_by_role('button', name='테스트 공간 열기', exact=True).click()
    page.get_by_role('button', name=account + '로 체험', exact=True).click()
    expect(page.get_by_role('button', name='테스트 종료', exact=True)).to_be_visible()


def exit_test(page):
    page.get_by_role('button', name='테스트 종료', exact=True).click()
    expect(page.get_by_role('button', name='공고 담당자', exact=True)).to_be_visible()


with sync_playwright() as p:
    browser = p.chromium.launch(channel='msedge', headless=True)
    page = browser.new_page(viewport={'width': 1440, 'height': 1000})
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    dialog_decision = {'accept': True}
    page.on('dialog', lambda dialog: dialog.accept() if dialog_decision['accept'] else dialog.dismiss())
    page.goto(BASE)
    page.wait_for_load_state('networkidle')
    expect(page.get_by_role('button', name='공고 담당자', exact=True)).to_be_visible()
    enter(page, '담당자 A')
    expect(page.locator('.overview')).to_be_visible()
    expect(page.locator('.overview-kpis')).to_be_visible()
    page.screenshot(path=str(screenshots / 'manager-overview-desktop.png'), full_page=True)
    page.set_viewport_size({'width':390,'height':844})
    no_overflow(page, 'manager overview mobile')
    page.screenshot(path=str(screenshots / 'manager-overview-mobile.png'), full_page=True)
    page.set_viewport_size({'width':1440,'height':1000})
    page.locator('.manager-workspace-tabs').get_by_role('button', name='공고 관리', exact=True).click()
    count_a=page.locator('.manager-notice').count()
    assert count_a >= 1
    expect(page.locator('.manager-list')).to_contain_text('[테스트] 학생 프로젝트 모집')
    expect(page.locator('.manager-list')).not_to_contain_text('캠퍼스 아이디어 공모')
    page.get_by_label('공고 검색', exact=True).fill('학생 프로젝트')
    expect(page.locator('.manager-notice')).to_have_count(1)
    page.get_by_label('공고 검색', exact=True).fill('')
    page.locator('.manager-status-tabs').get_by_role('button', name=re.compile('임시저장')).click()
    assert all('임시저장' in text for text in page.locator('.manager-notice').all_text_contents())
    page.locator('.manager-status-tabs').get_by_role('button', name=re.compile('전체')).click()
    no_overflow(page, 'manager desktop list')

    page.get_by_role('button', name='공고 등록', exact=True).click()
    save_box = page.get_by_role('button', name='임시저장', exact=True).bounding_box()
    assert save_box['y'] + save_box['height'] <= 1000, 'save action visible without scrolling'
    page.get_by_label('공고 제목', exact=True).fill(TITLE)
    page.get_by_role('button', name='임시저장', exact=True).click()
    expect(page.locator('.manager-workspace .success-note')).to_contain_text('임시저장했습니다')
    expect(page.locator('.manager-editor-heading .tag')).to_have_text('임시저장')
    page.get_by_label('담당 부서', exact=True).fill('학생지원팀')
    page.get_by_label('공고 요약', exact=True).fill('테스트용 공고 등록과 학생 준비 연결을 확인합니다.')
    page.get_by_label('공식 원문 주소', exact=True).fill('https://www.catholic.ac.kr/')
    page.get_by_label('신청 경로 주소', exact=False).fill('https://www.catholic.ac.kr/ko/campuslife/notice.do')
    page.get_by_label('신청 방법 안내', exact=True).fill('원문 신청 경로에서 직접 제출합니다.')
    page.get_by_label('신청 마감일', exact=True).fill('2026-12-31')
    page.get_by_label('마감 근거', exact=True).fill('테스트 원문 근거: 2026년 12월 31일까지.')
    page.get_by_role('button', name='조건 추가', exact=True).click()
    page.get_by_label('학생 정보', exact=False).select_option('status')
    page.get_by_label('비교 방식', exact=False).select_option('eq')
    page.get_by_label('비교값', exact=False).fill('재학')
    page.get_by_label('학생에게 표시할 조건', exact=True).fill('재학생')
    page.get_by_label('조건 1 원문 근거', exact=True).fill('테스트 원문: 본교 재학생.')
    page.get_by_label('준비 체크리스트', exact=False).fill('지원 동기 작성\n필수 서류 확인')
    page.get_by_role('button', name='문항 추가', exact=True).click()
    page.get_by_label('문항 제목', exact=True).fill('지원 동기')
    page.get_by_label('최대 글자 수', exact=True).fill('1000')
    page.get_by_label('작성 안내', exact=True).fill('본인의 지원 동기를 직접 적으세요.')
    page.get_by_label('신청 후 확인할 일', exact=True).fill('공식 원문에서 결과 발표와 추가 서류를 확인하세요.')
    expect(page.get_by_role('button', name='검수 후 게시', exact=True)).to_be_disabled()
    page.get_by_label('원문과 조건, 마감, 신청 경로를 대조했습니다.', exact=True).check()
    page.get_by_label('공고 요약', exact=False).fill('검수 확인을 초기화하는 수정입니다.')
    expect(page.get_by_label('원문과 조건, 마감, 신청 경로를 대조했습니다.', exact=True)).not_to_be_checked()
    page.get_by_label('원문과 조건, 마감, 신청 경로를 대조했습니다.', exact=True).check()

    # Force an actual storage exception. A saved state must never be claimed.
    page.evaluate("""() => {
        window.originalSetItem = Storage.prototype.setItem;
        Storage.prototype.setItem = function(key,value) {
            if (key === 'cuk-action-test-v2') throw new DOMException('test quota','QuotaExceededError');
            return window.originalSetItem.call(this,key,value);
        };
    }""")
    page.get_by_role('button', name='임시저장', exact=True).click()
    expect(page.locator('.manager-workspace [role="alert"]')).to_contain_text('저장하지 못했습니다')
    expect(page.get_by_label('공고 제목', exact=True)).to_have_value(TITLE)
    expect(page.locator('.manager-editor-heading')).to_contain_text('저장하지 않은 변경')
    assert page.evaluate('window.scrollY') < 100
    page.evaluate('() => { Storage.prototype.setItem = window.originalSetItem; }')
    page.set_viewport_size({'width': 390, 'height': 844})
    no_overflow(page, 'manager mobile editor')
    page.screenshot(path=str(screenshots / 'manager-mobile-editor.png'), full_page=True)
    page.get_by_role('button', name='검수 후 게시', exact=True).click()
    expect(page.locator('.manager-workspace .success-note')).to_contain_text('게시했습니다')
    expect(page.locator('.manager-editor-heading .tag')).to_have_text('게시 중')
    page.locator('.back:visible').filter(has_text='담당 공고 목록').click()
    expect(page.locator('.manager-notice')).to_have_count(count_a + 1)
    no_overflow(page, 'manager mobile list')
    page.set_viewport_size({'width': 1440, 'height': 1000})
    page.screenshot(path=str(screenshots / 'manager-desktop-list.png'), full_page=True)
    exit_test(page)

    enter(page, '학생 A')
    expect(page.get_by_role('button', name='담당 공고 관리', exact=True)).to_have_count(0)
    if page.get_by_role('button', name='메뉴', exact=True).is_visible():
        page.get_by_role('button', name='메뉴', exact=True).click()
    page.locator('.sidebar').get_by_role('button', name='공고 탐색', exact=True).click()
    page.get_by_role('button', name=TITLE, exact=True).click()
    expect(page.get_by_text('테스트 게시 공고', exact=True)).to_be_visible()
    page.get_by_role('button', name='지원 준비 시작', exact=True).click()
    expect(page.locator('.checklist input')).to_have_count(2)
    page.get_by_role('button', name=re.compile('직접 작성')).click()
    page.get_by_role('textbox', name='지원 동기', exact=True).fill('담당자가 게시한 테스트 공고에 직접 작성한 학생의 내용입니다.')
    expect(page.get_by_text('테스트 저장됨', exact=True).first).to_be_visible()
    page.set_viewport_size({'width': 390, 'height': 844})
    no_overflow(page, 'student mobile published notice')
    page.screenshot(path=str(screenshots / 'manager-published-student-mobile.png'), full_page=True)
    exit_test(page)

    enter(page, '담당자 B')
    page.locator('.manager-workspace-tabs').get_by_role('button', name='공고 관리', exact=True).click()
    assert page.locator('.manager-notice').count() >= 1
    expect(page.locator('.manager-list')).to_contain_text('캠퍼스 아이디어 공모')
    expect(page.locator('.manager-list')).not_to_contain_text(TITLE)
    no_overflow(page, 'manager B mobile scope')
    exit_test(page)

    enter(page, '담당자 A')
    page.locator('.manager-workspace-tabs').get_by_role('button', name='공고 관리', exact=True).click()
    card = page.locator('.manager-notice').filter(has_text=TITLE)
    card.get_by_role('button', name='집계 보기', exact=True).click()
    expect(page.locator('.manager-counts')).to_contain_text('비공개')
    expect(page.locator('.manager-counts > div').filter(has_text='제출 완료 자기보고')).to_contain_text('0명')
    expect(page.locator('.manager-metrics')).to_contain_text('분모:')
    expect(page.locator('.manager-metrics')).to_contain_text('한국 시간')
    expect(page.locator('.manager-metrics')).to_contain_text('공식 접수 미연동')
    expect(page.locator('.manager-metrics')).not_to_contain_text('담당자가 게시한 테스트 공고에 직접 작성한 학생의 내용입니다.')
    no_overflow(page, 'manager mobile metrics')
    page.screenshot(path=str(screenshots / 'manager-mobile-metrics.png'), full_page=True)
    page.set_viewport_size({'width': 1440, 'height': 1000})
    no_overflow(page, 'manager desktop metrics')
    page.locator('.back:visible').filter(has_text='담당 공고 목록').click()
    page.locator('.manager-notice').filter(has_text=TITLE).get_by_role('button', name='공고 수정', exact=True).click()
    dialog_decision['accept'] = False
    page.get_by_role('button', name='게시 내리고 임시저장', exact=True).click()
    expect(page.locator('.manager-editor-heading .tag')).to_have_text('게시 중')
    dialog_decision['accept'] = True
    page.get_by_role('button', name='게시 종료', exact=True).click()
    expect(page.locator('.manager-workspace .success-note')).to_contain_text('게시를 종료했습니다')
    expect(page.locator('.manager-editor-heading .tag')).to_have_text('게시 종료')
    page.locator('.back:visible').filter(has_text='담당 공고 목록').click()
    page.locator('.manager-template-details > summary').click()
    page.get_by_label('검수 초안 선택', exact=True).select_option('0')
    page.get_by_role('button', name='초안 불러오기', exact=True).click()
    expect(page.get_by_label('공고 제목', exact=True)).to_have_value('[취업지원팀] 2026학년도 동계 직무 부트캠프 안내(현직자 멘토와 직무 경험)')
    expect(page.get_by_label('원문과 조건, 마감, 신청 경로를 대조했습니다.', exact=True)).not_to_be_checked()
    expect(page.get_by_label('신청 경로 주소', exact=False)).to_have_value('')
    expect(page.get_by_text('공고 HTML 본문 발췌', exact=True)).to_be_visible()
    expect(page.get_by_text('원문 확인일 2026-11-16', exact=True)).to_be_visible()
    no_overflow(page, 'curated template editor')
    dialog_decision['accept'] = False
    page.get_by_role('button', name='테스트 종료', exact=True).click()
    expect(page.get_by_label('공고 제목', exact=True)).to_have_value('[취업지원팀] 2026학년도 동계 직무 부트캠프 안내(현직자 멘토와 직무 경험)')
    page.locator('.manager-workspace-tabs').get_by_role('button', name='통합 현황', exact=True).click()
    expect(page.get_by_label('공고 제목', exact=True)).to_be_visible()
    page.locator('.sidebar').get_by_role('button', name='공고 관리', exact=True).click()
    expect(page.get_by_label('공고 제목', exact=True)).to_be_visible()
    dialog_decision['accept'] = True
    page.locator('.sidebar').get_by_role('button', name='공고 관리', exact=True).click()
    expect(page.locator('.manager-list')).to_be_visible()
    exit_test(page)
    assert not errors, errors
    # Hold the adapter save pending to verify navigation cannot unmount the editor.
    delayed = browser.new_page(viewport={'width': 1440, 'height': 1000})
    delayed.on('pageerror', lambda error: errors.append(str(error)))
    source = Path('src/gateway.js').read_text(encoding='utf-8').replace(
        'export async function saveNotice(value){',
        'export async function saveNotice(value){ await new Promise(resolve=>{window.finishManagerSave=resolve;});')
    delayed.route('**/src/gateway.js*', lambda route: route.fulfill(status=200, content_type='application/javascript', body=source))
    delayed.goto(BASE)
    delayed.wait_for_load_state('networkidle')
    enter(delayed, '담당자 A')
    delayed.locator('.manager-workspace-tabs').get_by_role('button', name='공고 관리', exact=True).click()
    delayed.get_by_role('button', name='공고 등록', exact=True).click()
    delayed.get_by_label('공고 제목', exact=True).fill('저장 대기 중 이동 차단 검증')
    delayed.get_by_role('button', name='임시저장', exact=True).click()
    delayed.wait_for_function('typeof window.finishManagerSave === "function"')
    expect(delayed.get_by_role('button', name='테스트 종료', exact=True)).to_be_disabled()
    expect(delayed.get_by_role('button', name='로그아웃', exact=True)).to_be_disabled()
    expect(delayed.locator('.manager-workspace > .back')).to_be_disabled()
    expect(delayed.locator('.manager-workspace-tabs').get_by_role('button', name='통합 현황', exact=True)).to_be_disabled()
    delayed.locator('.sidebar').get_by_role('button', name='학생 화면 보기', exact=True).click()
    expect(delayed.get_by_label('공고 제목', exact=True)).to_have_value('저장 대기 중 이동 차단 검증')
    delayed.evaluate('window.finishManagerSave()')
    expect(delayed.locator('.manager-save-feedback')).to_contain_text('임시저장했습니다')
    expect(delayed.get_by_role('button', name='테스트 종료', exact=True)).to_be_enabled()
    # A clean editor can still have an in-flight status save. Reload must warn too.
    delayed.evaluate('window.finishManagerSave = null')
    delayed.get_by_role('button', name='임시저장', exact=True).click()
    delayed.wait_for_function('typeof window.finishManagerSave === "function"')
    assert delayed.evaluate("""() => {
        const event = new Event('beforeunload', {cancelable:true});
        window.dispatchEvent(event);
        return event.defaultPrevented;
    }"""), 'reload guard must stay active during saving even without dirty fields'
    delayed.evaluate('window.finishManagerSave()')
    expect(delayed.locator('.manager-save-feedback')).to_contain_text('임시저장했습니다')
    exit_test(delayed)
    delayed.close()
    assert not errors, errors
    print('PASS: labelled test entry; manager A/B own lists; draft save; all editor fields; conditions/questions/tasks; review reset; publish/archive; student starts and writes; real save exception visible; pending save blocks navigation/logout; 1-4 metric suppression; date/denominator/official separation; no student draft in metrics; official draft import; unsaved exit/navigation cancel; 390px/1440px no overflow; zero runtime errors. Auth and server access are NOT tested here.')
    browser.close()
