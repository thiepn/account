import {expect,test} from '@playwright/test';

test('protected deep link round-trips through sign-in without losing its hash or query',async({page})=>{
  await page.goto('/?scenario=default');
  await page.getByRole('button',{name:'Sign out'}).click();
  await expect(page).toHaveURL(/\/auth\/sign-in$/);
  await page.goto('/security?release-proof=deep-link#sessions');
  await expect(page).toHaveURL(/\/auth\/sign-in$/);
  await page.getByRole('button',{name:'Continue with Google'}).click();
  await expect(page).toHaveURL(/\/security\?release-proof=deep-link#sessions$/);
  await expect(page.getByRole('heading',{name:'Security',exact:true})).toBeVisible();
});

test('light/dark/system theme modes persist and respond to real media preference changes',async({page})=>{
  await page.emulateMedia({colorScheme:'light'});
  await page.goto('/?scenario=default');
  const mode=(value:string)=>page.getByRole('button',{name:`Theme: ${value}`});
  await expect(mode('system')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await mode('system').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await mode('light').click();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await page.reload();
  await expect(mode('dark')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
  await mode('dark').click();
  await expect(mode('system')).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('data-theme','light');
  await page.emulateMedia({colorScheme:'dark'});
  await expect(page.locator('html')).toHaveAttribute('data-theme','dark');
});
