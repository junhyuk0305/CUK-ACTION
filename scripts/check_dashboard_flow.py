"""Dashboard navigation regression using isolated browser test data only."""
from pathlib import Path
import os
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('CUK_TEST_URL', 'http://127.0.0.1:5173')
SHOTS = Path('tmp/browser-checks')
SHOTS.mkdir(parents=True, exist_ok=True)


def no_overflow(page, label):
    size = page.evaluate('({viewport:innerWidth, document:document.documentElement.scrollWidth})')
    assert size['document'] <= size['viewport'], (label, size)


def enter(page):
    page.goto(BASE, wait_until='domcontentloaded')
    page.get_by_role('button', name='공고 담당자', exact=True).click()
    page.get_by_role('button', name='담당자 A로 체험', exact=True).click()
    expect(page.locator('.overview-kpis')).to_be_visible()


def detail_matches_row(page, row):
    values = row.locator('.overview-number').all_text_contents()
    row.locator('th button').click()
    detail = page.locator('.overview-notice-detail')
    expect(detail).to_be_visible()
    assert detail.locator('dd').all_text_contents() == [v + '명' if v != '비공개' else v for v in values]
    return detail


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
    row = page.locator('.overview-comparison tbody tr').first
    detail = detail_matches_row(page, row)
    title = detail.locator('h4').inner_text()
    expect(detail).to_contain_text('가상 시나리오')
    for date in dates:
        expect(detail).to_contain_text(date)
    no_overflow(page, 'selected notice')
    page.evaluate('scrollTo(0,0)')
    page.screenshot(path=str(SHOTS / f'dashboard-detail-{width}.png'), full_page=True, animations='disabled')
    detail.get_by_role('button', name='공고 수정', exact=True).click()
    expect(page.get_by_label('공고 제목', exact=True)).to_have_value(title)
    new_title = title + ' 검증 수정'
    page.get_by_label('공고 제목', exact=True).fill(new_title)
    back = page.locator('.manager-workspace > .back')
    back.click()
    assert decision['dialogs'] == 1, 'dirty navigation must request confirmation'
    expect(page.get_by_label('공고 제목', exact=True)).to_have_value(new_title)
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
    expect(page.locator('.overview')).to_be_visible()
    expect(page.get_by_role('button', name='최근 7일', exact=True)).to_have_class('active')
    expect(page.get_by_label('공고 비교 정렬', exact=True)).to_have_value('start')
    expect(page.locator('.overview-source-tabs .active')).to_have_text('가상 시나리오')
    expect(page.locator('.overview-notice-detail h4')).to_have_text(new_title)
    for date in dates:
        expect(page.locator('.overview-notice-detail')).to_contain_text(date)
    # Local activity remains a different source through the same editor round trip.
    page.get_by_role('button', name='이 브라우저 기록', exact=True).click()
    expect(page.locator('.overview-kpi strong').first).to_have_text('0명')
    detail = page.locator('.overview-notice-detail')
    expect(detail).to_contain_text('이 브라우저 기록')
    assert detail.locator('dd').all_text_contents() == ['0명'] * 5
    detail.get_by_role('button', name='공고 수정', exact=True).click()
    back.click()
    expect(page.locator('.overview-source-tabs .active')).to_have_text('이 브라우저 기록')
    expect(page.locator('.overview-notice-detail h4')).to_have_text(new_title)
    expect(page.get_by_role('button', name='최근 7일', exact=True)).to_have_class('active')
    # Per-notice metrics has its own applied range, retained through editing.
    page.locator('.manager-workspace-tabs').get_by_role('button', name='공고 관리', exact=True).click()
    card = page.locator('.manager-notice').filter(has_text=new_title)
    card.get_by_role('button', name='집계 보기', exact=True).click()
    metrics = page.locator('.manager-metrics')
    metrics.get_by_label('집계 시작일', exact=True).fill(dates[0])
    metrics.get_by_label('집계 종료일', exact=True).fill(dates[1])
    metrics.get_by_role('button', name='집계 조회', exact=True).click()
    expect(metrics.locator('.manager-counts')).to_be_visible()
    metrics.get_by_role('button', name='공고 수정', exact=True).click()
    expect(page.get_by_label('공고 제목', exact=True)).to_have_value(new_title)
    back.click()
    expect(metrics).to_be_visible()
    expect(metrics.get_by_label('집계 시작일', exact=True)).to_have_value(dates[0])
    expect(metrics.get_by_label('집계 종료일', exact=True)).to_have_value(dates[1])
    no_overflow(page, 'notice metrics')
    page.evaluate('scrollTo(0,0)')
    page.screenshot(path=str(SHOTS / f'dashboard-metrics-{width}.png'), full_page=True, animations='disabled')
    assert not errors, errors
    print(f'PASS {width}px: KPI comparison, exact notice values, editor cancel/save/return, source and date retention, no overflow/errors')
    context.close()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(channel='msedge', headless=True)
    for width in (1440, 390):
        check_flow(browser, width)
    context = browser.new_context(viewport={'width':390,'height':844}, reduced_motion='reduce')
    page = context.new_page()
    enter(page)
    assert page.locator('.overview-plot svg').evaluate('(e)=>getComputedStyle(e).animationName') == 'none'
    detail_matches_row(page, page.locator('.overview-comparison tbody tr').first)
    assert page.locator('.overview-notice-detail').evaluate('(e)=>getComputedStyle(e).animationName') == 'none'
    assert page.locator('.overview-kpi').first.evaluate('(e)=>getComputedStyle(e).transitionDuration') == '0s'
    no_overflow(page, 'reduced motion')
    print('PASS reduced motion: graph/panel animation none, button transition 0s')
    browser.close()
