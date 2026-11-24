"""Two students share a synthetic notice but keep independent read state."""
import sys
from playwright.sync_api import sync_playwright,expect
url=(sys.argv[1] if len(sys.argv)>1 else 'http://127.0.0.1:5198')+'/account.html'
title='[테스트] 학생 프로젝트 모집'
with sync_playwright() as p:
    browser=p.chromium.launch(channel='msedge',headless=True)
    ctx=browser.new_context(viewport={'width':1400,'height':950})
    def login(name):
        page=ctx.new_page()
        page.set_default_timeout(7000)
        page.goto(url+('#manager' if name.startswith('담당자') else ''))
        page.get_by_role('button',name=name+'로 체험',exact=True).click()
        return page
    staff=login('담당자 A')
    staff.locator('.sidebar').get_by_role('button',name='공고 관리').click()
    staff.locator('.manager-notice').filter(has_text=title).get_by_text('공고 수정').click()
    def publish(hour):
        staff.locator('.workflow-fields input[type=time]').first.fill(hour)
        staff.get_by_label('원문과 조건, 마감, 신청 경로를 대조했습니다.').check()
        staff.get_by_role('button',name='수정 내용 게시').click()
        expect(staff.get_by_text('게시했습니다. 학생 공고 목록에 표시됩니다.',exact=True)).to_be_visible()
        expect(staff.locator('.manager-editor-heading')).to_contain_text('저장됨')
    publish('16:00')
    a,b=login('학생 A'),login('학생 B')
    for pg in (a,b):
        pg.get_by_role('button',name=title,exact=True).click()
        pg.get_by_role('button',name='지원 준비 시작',exact=True).click()
        pg.get_by_role('button',name='직접 작성',exact=False).click()
        pg.locator('textarea').first.fill('보존할 가상 작성본')
        expect(pg.locator('.data-status')).to_have_text('테스트 저장됨')
    publish('18:00')
    expect(a.get_by_text('마감 시각 16:00 → 18:00',exact=True)).to_be_visible()
    a.get_by_role('button',name='변경 일정 확인').click()
    expect(a.locator('.data-status')).to_have_text('테스트 저장됨')
    publish('17:00')
    for pg,old in [(a,'18:00'),(b,'16:00')]:
        pg.reload()
        pg.get_by_role('button',name='알림 열기').click()
        expect(pg.get_by_text('마감 시각 '+old+' → 17:00',exact=True)).to_be_visible()
        pg.get_by_role('button',name='확인하기').first.click()
        expect(pg.get_by_text('마감 시각 '+old+' → 17:00',exact=True)).to_be_visible()
        pg.get_by_role('button',name='직접 작성',exact=False).click()
        expect(pg.locator('textarea').first).to_have_value('보존할 가상 작성본')
    print('PASS manager edits 16:00 to 18:00 to 17:00; A acknowledged 18:00, B last saw 16:00; notifications, detail and drafts survived reload')
    browser.close()
