import { expect, test } from "@playwright/test";

test("desktop shell exposes the canonical Account navigation",async({page})=>{
  await page.goto("/?scenario=default");
  await expect(page.getByRole("heading",{name:"Overview"})).toBeVisible();
  for(const name of ["Overview","Profile","Security","Devices","Apps","Data & Backup","Privacy"]){
    await expect(page.getByRole("link",{name})).toBeVisible();
  }
});

test("mobile keeps one compact header and accessible navigation drawer",async({page})=>{
  await page.setViewportSize({width:320,height:700});
  await page.goto("/?scenario=default");
  const header=page.locator("header").first();
  await expect(header).toBeVisible();
  const box=await header.boundingBox();
  expect(box?.height).toBeLessThanOrEqual(60);
  await page.getByRole("button",{name:"Open navigation"}).click();
  await expect(page.getByRole("dialog",{name:"Account navigation"})).toBeVisible();
  await page.getByRole("link",{name:"Profile"}).click();
  await expect(page.getByRole("heading",{name:"Profile"})).toBeVisible();
  await expect(page.getByRole("dialog",{name:"Account navigation"})).toHaveCount(0);
});

test("profile edits propagate to Overview without a reload",async({page})=>{
  await page.goto("/profile?scenario=default");
  const field=page.getByLabel("Display name");
  await field.fill("Integration Profile");
  await page.getByRole("button",{name:"Save changes"}).click();
  await expect(page.getByText("Profile updated.")).toBeVisible();
  await page.getByRole("link",{name:"Overview"}).click();
  await expect(page.getByRole("heading",{name:"Integration Profile"})).toBeVisible();
});

test("long content does not create page-level horizontal overflow at 320px",async({page})=>{
  await page.setViewportSize({width:320,height:700});
  await page.goto("/profile?scenario=long-content");
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});
