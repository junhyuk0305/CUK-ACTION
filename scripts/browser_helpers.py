"""Shared helpers for the Playwright browser checks.
CUK_BASE picks the dev server (default http://127.0.0.1:5173)."""
import os
from playwright.sync_api import expect

BASE = os.environ.get('CUK_BASE', 'http://127.0.0.1:5173').rstrip('/')


def finish_onboarding(page):
    """A test student with an empty profile lands on '학생 정보 입력' first.
    Fill the required fields from the demo profile and save only those ('나중에 입력'),
    so later checks still start from a profile without a name or optional fields."""
    setup = page.get_by_role('heading', name='학생 정보 입력', exact=True)
    expect(setup.or_(page.locator('.session-strip'))).to_be_visible()
    if setup.is_visible():
        page.get_by_role('button', name='시연 프로필 채우기', exact=True).click()
        page.get_by_role('button', name='나중에 입력', exact=True).click()
        expect(setup).to_have_count(0)


def enter_test(page, name='학생 A'):
    """Open the test space as a test account and wait for its session strip."""
    opener = page.get_by_role('button', name='테스트 공간 열기', exact=True)
    if opener.count():
        opener.click()
    page.get_by_role('button', name=name + '로 체험', exact=True).click()
    if name.startswith('학생'):
        finish_onboarding(page)
    expect(page.get_by_text('테스트 공간 / ' + name, exact=False)).to_be_visible()
