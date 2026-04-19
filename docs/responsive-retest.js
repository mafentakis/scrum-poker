const { chromium } = require('playwright');

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const baseUrl = 'http://localhost:4200';
const room = 'rt-419-fix1';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function join(page, name, { isSM = false } = {}) {
  await page.goto(`${baseUrl}/?room=${room}`, { waitUntil: 'networkidle' });
  await page.getByPlaceholder('Your name').fill(name);
  if (isSM) {
    await page.locator('.reg-sm input[type="checkbox"]').check();
  }
  await page.getByRole('button', { name: 'Join' }).click();
  await page.locator('.app-shell').waitFor({ state: 'visible' });
  await sleep(500);
}

async function collectLayout(page) {
  return page.evaluate(() => {
    const shell = document.querySelector('.app-shell');
    const compact = document.querySelector('.compact-strip');
    const rows = Array.from(document.querySelectorAll('.compact-strip > .compact-strip-row'));
    const firstRow = rows[0]?.querySelector('.team-nav')
      ? 'participants'
      : rows[0]?.querySelector('.mini-cards')
        ? 'cards'
        : 'unknown';
    const visible = (el) => !!el && getComputedStyle(el).display !== 'none' && getComputedStyle(el).visibility !== 'hidden';
    const navButtons = Array.from(document.querySelectorAll('.chips-nav-btn')).filter(visible).length;
    const overflowTrigger = visible(document.querySelector('.toolbar-overflow-trigger'));
    const directActions = Array.from(document.querySelectorAll('.toolbar-right > .icon-btn'))
      .filter((el) => visible(el) && !el.classList.contains('toolbar-overflow-trigger')).length;
    const chipNames = Array.from(document.querySelectorAll('.team-chips .p-chip .pc-name'))
      .map((el) => el.textContent?.trim())
      .filter(Boolean);

    return {
      innerWidth: window.innerWidth,
      shellHeight: shell ? Math.round(shell.getBoundingClientRect().height) : null,
      compactHeight: compact ? Math.round(compact.getBoundingClientRect().height) : null,
      compactFlex: compact ? getComputedStyle(compact).flexDirection : null,
      firstRow,
      navButtons,
      overflowTrigger,
      directActions,
      chipNames,
    };
  });
}

async function openOverflowMenuTexts(page) {
  const trigger = page.locator('.toolbar-overflow-trigger');
  if (!(await trigger.count())) return [];
  await trigger.click();
  await page.locator('[role="menu"]').waitFor({ state: 'visible' });
  const items = await page.locator('[role="menu"] [role="menuitem"]').allTextContents();
  await page.keyboard.press('Escape');
  return items.map((text) => text.trim().replace(/\s+/g, ' '));
}

async function main() {
  const browser = await chromium.launch({
    executablePath: chromePath,
    headless: true,
  });

  const contexts = {
    sm: await browser.newContext({ viewport: { width: 1280, height: 800 } }),
    touchLaptop: await browser.newContext({
      viewport: { width: 1024, height: 768 },
      hasTouch: true,
      isMobile: false,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36',
    }),
    tablet: await browser.newContext({
      viewport: { width: 768, height: 1024 },
      hasTouch: true,
      isMobile: true,
      userAgent: 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    }),
    phone: await browser.newContext({
      viewport: { width: 430, height: 932 },
      hasTouch: true,
      isMobile: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    }),
    persistence: await browser.newContext({ viewport: { width: 1280, height: 800 } }),
  };

  const pages = {
    sm: await contexts.sm.newPage(),
    touchLaptop: await contexts.touchLaptop.newPage(),
    tablet: await contexts.tablet.newPage(),
    phone: await contexts.phone.newPage(),
    persistence: await contexts.persistence.newPage(),
  };

  await join(pages.sm, 'SM-1', { isSM: true });
  await join(pages.touchLaptop, 'P-1');
  await join(pages.tablet, 'P-3');
  await join(pages.phone, 'P-2');
  await join(pages.persistence, 'P-4');
  await sleep(1500);

  const desktop1280 = await collectLayout(pages.sm);
  const touchLaptop = await collectLayout(pages.touchLaptop);
  const tablet = await collectLayout(pages.tablet);
  const tabletMenu = await openOverflowMenuTexts(pages.tablet);
  const phonePortrait = await collectLayout(pages.phone);
  const phoneMenu = await openOverflowMenuTexts(pages.phone);

  const overflowExtras = [];
  for (const name of [
    'P-5', 'P-6', 'P-7', 'P-8', 'P-9', 'P-10', 'P-11',
    'P-12', 'P-13', 'P-14', 'P-15', 'P-16', 'P-17', 'P-18',
  ]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await join(page, name);
    overflowExtras.push({ context, page });
  }
  await sleep(1500);

  await pages.sm.setViewportSize({ width: 1024, height: 768 });
  await sleep(800);
  const desktop1024 = await collectLayout(pages.sm);
  const touchLaptopOverflow = await collectLayout(pages.touchLaptop);
  const tabletOverflow = await collectLayout(pages.tablet);

  await pages.phone.setViewportSize({ width: 932, height: 430 });
  await sleep(800);
  const phoneLandscape = await collectLayout(pages.phone);

  const persistenceBefore = await collectLayout(pages.persistence);
  await pages.persistence.reload({ waitUntil: 'networkidle' });
  await pages.persistence.locator('.app-shell').waitFor({ state: 'visible' });
  await sleep(1000);
  const persistenceAfter = await collectLayout(pages.persistence);

  const duplicateSmContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const duplicateSmPage = await duplicateSmContext.newPage();
  await duplicateSmPage.goto(`${baseUrl}/?room=${room}`, { waitUntil: 'networkidle' });
  await duplicateSmPage.getByPlaceholder('Your name').fill('SM-2');
  await duplicateSmPage.locator('.reg-sm input[type="checkbox"]').check();
  await duplicateSmPage.getByRole('button', { name: 'Join' }).click();
  await sleep(800);
  const duplicateSmError = await duplicateSmPage.locator('.reg-error').textContent();

  console.log(JSON.stringify({
    room,
    desktop1280,
    desktop1024,
    touchLaptop,
    touchLaptopOverflow,
    tablet,
    tabletOverflow,
    tabletMenu,
    phonePortrait,
    phoneLandscape,
    phoneMenu,
    persistenceBefore,
    persistenceAfter,
    duplicateSmError: duplicateSmError?.trim() ?? '',
  }, null, 2));

  for (const extra of overflowExtras) {
    await extra.context.close();
  }
  await duplicateSmContext.close();
  await browser.close();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
