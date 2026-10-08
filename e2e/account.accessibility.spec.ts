import { expect, test } from '@playwright/test';

const mainRoutes = ['/', '/profile', '/security', '/apps', '/data', '/privacy'];

test('Account pages remain navigable in a 320 CSS-pixel layout',async({page})=>{
  // The effective CSS viewport at a 200% zoom on a 640px window is 320px.
  // This is a layout smoke, not a claim to certify native browser zoom or AT.
  await page.setViewportSize({width:320,height:620});
  for(const route of mainRoutes){
    const separator=route.includes('?')?'&':'?';
    await page.goto(`${route}${separator}scenario=default`);
    await expect(page.locator('main#main-content')).toBeVisible();
    await expect(page.locator('main#main-content')).not.toBeEmpty();
    const width=await page.evaluate(()=>({
      documentWidth:document.documentElement.scrollWidth,
      viewportWidth:document.documentElement.clientWidth,
    }));
    expect(width.documentWidth,
      `Horizontal document overflow at ${route}: ${JSON.stringify(width)}`
    ).toBeLessThanOrEqual(width.viewportWidth+1);
    await expect(page.getByRole('button',{name:'Open navigation'})).toBeVisible();
  }
});

test('keyboard users can reach the Account main landmark via the skip link',async({page})=>{
  await page.goto('/?scenario=default');
  await expect(page.locator('main#main-content')).toBeVisible();
  const skip=page.getByRole('link',{name:'Skip to content'});
  await page.keyboard.press('Tab');
  await expect(skip).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#main-content$/);
});

test('mobile navigation preserves focus and provides a keyboard Escape exit',async({page})=>{
  await page.setViewportSize({width:320,height:640});
  await page.goto('/?scenario=default');
  const trigger=page.getByRole('button',{name:'Open navigation'});
  await trigger.focus();
  await trigger.press('Enter');
  const drawer=page.getByRole('dialog',{name:'Account navigation'});
  await expect(drawer).toBeVisible();
  await expect(drawer.getByRole('button',{name:'Close navigation'})).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(drawer).toHaveCount(0);
  await expect(trigger).toBeFocused();
});
