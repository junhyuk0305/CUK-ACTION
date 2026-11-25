"""Dashboard navigation regression using isolated browser test data only."""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright, expect

from browser_helpers import BASE
BASE = os.environ.get('CUK_TEST_URL', BASE)
SHOTS = Path('tmp/browser-checks')
SHOTS.mkdir(parents=True, exist_ok=True)


def no_overflow(page, label):
    size = page.evaluate('({viewport:innerWidth, document:document.documentElement.scrollWidth})')
    assert size['document'] <= size['viewport'], (label, size)


def enter(page):
    page.goto(BASE + '/account.html', wait_until='domcontentloaded')
    page.get_by_role('button', name='담당자 A로 체험', exact=True).click()
    expect(page.locator('.overview-kpis')).to_be_visible()


def open_row_metrics(page, row):
    # The row hides the test prefix; the metrics title is the full notice title.
    shown = row.locator('th button').inner_text()
    row.locator('th button').click()
    metrics = page.locator('.manager-metrics')
    expect(metrics.locator('h1')).to_contain_text(shown)
    return metrics, metrics.locator('h1').inner_text()


def check_flow(browser, width):
    context = browser.new_context(viewport={'width': width, 'height': 1000 if width > 600 else 844})
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda error: errors.append(str(error)))
    page.on('console', lambda message: errors.append(message.text) if message.type == 'error' else None)
    decision = {'accept': False, 'dialogs': 0}
    def dialog_handler(dialog):
        decision['dialogs'] += 1
        dialog.accept() if decision['accept'] else dialog.dismiss()
    page.on('dialog', dialog_handler)
    enter(page)
    no_overflow(page, 'initial dashboard')
    normal_motion = page.locator('.overview-plot svg').evaluate('(e)=>getComputedStyle(e).animationName')
    assert normal_motion != 'none', normal_motion
    page.get_by_role('button', name='최근 7일', exact=True).click()
    expect(page.get_by_role('button', name='최근 7일', exact=True)).to_have_class('active')
    dates = [page.get_by_label('통합 집계 시작일', exact=True).input_value(), page.get_by_label('통합 집계 종료일', exact=True).input_value()]
    page.get_by_role('button', name='준비 시작 기준 공고 비교', exact=True).click()
    expect(page.get_by_label('공고 비교 정렬', exact=True)).to_have_value('start')
    expect(page.locator('.overview-comparison')).to_be_focused()
    page.get_by_label('공고 상태 필터', exact=True).select_option('published')
    row = page.locator('.overview-comparison tbody tr').first
    row.scroll_into_view_if_needed()
    row_id = row.get_attribute('data-notice-id')
    before = page.evaluate('scrollY')

    def dashboard_kept():
        expect(page.locator('.overview')).to_be_visible()
        expect(page.get_by_role('button', name='최근 7일', exact=True)).to_have_class('active')
        expect(page.get_by_label('공고 비교 정렬', exact=True)).to_have_value('start')
        expect(page.get_by_label('공고 상태 필터', exact=True)).to_have_value('published')

    # A row opens the notice metrics screen with the dashboard period, and the device back button returns.
    metrics, title = open_row_metrics(page, row)
    expect(page.locator('h1:visible')).to_have_count(1)
    expect(page.locator('.manager-metrics-view > .back')).to_have_text('담당자 대시보드로')
    expect(metrics.get_by_label('집계 시작일', exact=True)).to_have_value(dates[0])
    expect(metrics.get_by_label('집계 종료일', exact=True)).to_have_value(dates[1])
    no_overflow(page, 'metrics from dashboard')
    page.evaluate('scrollTo(0,0)')
    page.screenshot(path=str(SHOTS / f'dashboard-detail-{width}.png'), full_page=True, animations='disabled')
    page.go_back()
    dashboard_kept()
    row = page.locator(f'.overview-comparison tbody tr[data-notice-id="{row_id}"]')
    expect(row.locator('th button')).to_be_focused()
    assert abs(page.evaluate('scrollY') - before) < 5, ('scroll not restored', before, page.evaluate('scrollY'))

    # Metrics -> edit -> back -> metrics -> back -> dashboard, with the saved title shown on the metrics screen.
    metrics, title = open_row_metrics(page, row)
    metrics.get_by_role('button', name='공고 수정', exact=True).click()
    expect(page.get_by_label('공고 제목', exact=True)).to_have_value(title)
    back = page.locator('.manager-workspace > .back')
    expect(back).to_have_text('공고 집계로')
    new_title = title + ' 검증 수정'
    page.get_by_label('공고 제목', exact=True).fill(new_title)
    back.click()
    expect(page.get_by_label('공고 제목', exact=True)).to_have_value(new_title)
    assert decision['dialogs'] == 1, 'dirty navigation must request confirmation'
    page.go_back()
    expect(page.get_by_label('공고 제목', exact=True)).to_have_value(new_title)
    assert decision['dialogs'] == 2, 'device back on a dirty editor must request confirmation'
    # Saving from the lower review section must preserve the current scroll position.
    page.get_by_label('원문과 조건, 마감, 신청 경로를 대조했습니다.', exact=True).check()
    save = page.locator('.manager-save-bar button[type=submit]')
    save.scroll_into_view_if_needed()
    before_save = page.evaluate('scrollY')
    save.click()
    expect(page.locator('.manager-workspace .success-note')).to_contain_text('게시했습니다')
    after_save = page.evaluate('scrollY')
    assert before_save > 100 and after_save > 100, ('save jumped to top', before_save, after_save)
    no_overflow(page, 'saved editor')
    back.click()
    expect(metrics).to_be_visible()
    expect(metrics.locator('h1')).to_have_text(new_title)
    expect(metrics.get_by_role('button', name='공고 수정', exact=True)).to_be_focused()
    expect(metrics.get_by_label('집계 시작일', exact=True)).to_have_value(dates[0])
    page.locator('.manager-metrics-view > .back').click()
    dashboard_kept()
    expect(page.get_by_role('button', name=new_title + ' 공고 집계', exact=True)).to_be_visible()

    # The dashboard edit link still opens the editor, and back returns to the dashboard.
    page.get_by_role('button', name='이 브라우저 기록', exact=True).click()
    expect(page.locator('.overview-kpi strong').first).to_have_text('0명')
    page.get_by_role('button', name=new_title + ' 공고 수정', exact=True).click()
    expect(page.get_by_label('공고 제목', exact=True)).to_have_value(new_title)
    expect(back).to_have_text('담당자 대시보드로')
    page.go_back()
    expect(page.locator('.overview-source-tabs .active')).to_have_text('이 브라우저 기록')
    dashboard_kept()
    expect(page.get_by_role('button', name=new_title + ' 공고 수정', exact=True)).to_be_focused()

    # From notice management, metrics keep their own range through editing and return to the list.
    menu_button = page.locator('.sidebar').get_by_role('button', name='공고 관리', exact=True)
    if not menu_button.is_visible(): page.get_by_role('button', name='메뉴', exact=True).click()
    menu_button.click()
    page.get_by_label('공고 검색', exact=True).fill('검증 수정')
    card = page.locator('.manager-notice').filter(has_text=new_title)
    card.get_by_role('button', name='집계 보기', exact=True).click()
    expect(page.locator('.manager-metrics-view > .back')).to_have_text('공고 관리로')
    metrics.get_by_label('집계 시작일', exact=True).fill(dates[0])
    metrics.get_by_label('집계 종료일', exact=True).fill(dates[1])
    metrics.get_by_role('button', name='집계 조회', exact=True).click()
    expect(metrics.locator('.manager-counts')).to_be_visible()
    metrics.get_by_role('button', name='공고 수정', exact=True).click()
    expect(page.get_by_label('공고 제목', exact=True)).to_have_value(new_title)
    page.go_back()
    expect(metrics).to_be_visible()
    expect(metrics.get_by_label('집계 시작일', exact=True)).to_have_value(dates[0])
    expect(metrics.get_by_label('집계 종료일', exact=True)).to_have_value(dates[1])
    no_overflow(page, 'notice metrics')
    page.evaluate('scrollTo(0,0)')
    page.screenshot(path=str(SHOTS / f'dashboard-metrics-{width}.png'), full_page=True, animations='disabled')
    page.go_back()
    expect(page.get_by_label('공고 검색', exact=True)).to_have_value('검증 수정')
    expect(card.get_by_role('button', name='집계 보기', exact=True)).to_be_focused()
    assert not errors, errors
    print(f'PASS {width}px: row opens notice metrics with dashboard period, device/on-screen back, metrics-edit-metrics-dashboard, saved title, filter/scroll/focus retention, no overflow/errors')
    context.close()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel='msedge', headless=True)
    for width in (1440, 390):
        check_flow(browser, width)
    context = browser.new_context(viewport={'width':390,'height':844}, reduced_motion='reduce')
    page = context.new_page()
    enter(page)
    assert page.locator('.overview-plot svg').evaluate('(e)=>getComputedStyle(e).animationName') == 'none'
    open_row_metrics(page, page.locator('.overview-comparison tbody tr').first)
    assert page.locator('.manager-metrics').evaluate('(e)=>getComputedStyle(e).animationName') == 'none'
    assert page.locator('.overview-kpi').first.evaluate('(e)=>getComputedStyle(e).transitionDuration') == '0s'
    no_overflow(page, 'reduced motion')
    print('PASS reduced motion: graph/panel animation none, button transition 0s')
    browser.close()
