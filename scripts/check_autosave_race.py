"""Delay activity requests in the test adapter to exercise concurrent edits/logout."""
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

source=Path('src/gateway.js').read_text(encoding='utf-8').replace(
    'export async function recordActivity(noticeId,type,optionId,stepId){',
    'export async function recordActivity(noticeId,type,optionId,stepId){ window.__recording=true; await new Promise(r=>setTimeout(r,1200));')
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    page=browser.new_page()
    page.route('**/src/gateway.js*',lambda route: route.fulfill(status=200,content_type='application/javascript',body=source))
    page.goto('http://127.0.0.1:5173/account.html'); page.wait_for_load_state('networkidle')
    def enter():
        if page.get_by_role('button',name='테스트 공간 열기',exact=True).count(): page.get_by_role('button',name='테스트 공간 열기',exact=True).click()
        page.get_by_role('button',name='학생 A로 체험',exact=True).click()
    enter()
    page.get_by_role('button',name='[테스트] 학생 프로젝트 모집',exact=True).click()
    page.get_by_role('button',name='지원 준비 시작',exact=True).click()
    page.get_by_role('button',name='직접 작성',exact=False).click()
    page.get_by_role('textbox',name='지원 동기',exact=True).fill('첫 작성')
    page.wait_for_function('window.__recording === true')
    page.get_by_role('textbox',name='지원 동기',exact=True).fill('활동 기록 요청 중 입력한 마지막 작성')
    page.get_by_role('button',name='테스트 종료',exact=True).click()
    expect(page.get_by_role('button',name='학생 A로 체험',exact=True)).to_be_visible(timeout=12000)
    enter()
    page.get_by_role('button',name='이어서 준비하기',exact=True).click()
    page.get_by_role('button',name='직접 작성',exact=False).click()
    expect(page.get_by_role('textbox',name='지원 동기',exact=True)).to_have_value('활동 기록 요청 중 입력한 마지막 작성')
    print('PASS: concurrent draft edit during delayed activity request survives immediate logout and reentry')
    browser.close()
