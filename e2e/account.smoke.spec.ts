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
  await expect(page.getByRole("heading",{name:"Profile",exact:true})).toBeVisible();
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


test("deletion-pending scenario surfaces a global lifecycle warning",async({page})=>{
  await page.goto("/?scenario=deletion-pending");
  await expect(page.getByText("Account deletion is scheduled. Account-changing actions are restricted until you cancel it or deletion completes.")).toBeVisible();
  await expect(page.getByRole("link",{name:"View deletion status"})).toBeVisible();
});

test("destructive account deletion keeps exact confirmation disabled until DELETE",async({page})=>{
  await page.goto("/account/deletion?scenario=default");
  await page.getByRole("button",{name:"Review Account deletion"}).click();
  const schedule=page.getByRole("button",{name:"Schedule Account deletion"});
  await expect(schedule).toBeDisabled();
  await page.getByLabel("Type DELETE to schedule deletion").fill("delete");
  await expect(schedule).toBeDisabled();
  await page.getByLabel("Type DELETE to schedule deletion").fill("DELETE");
  await expect(schedule).toBeEnabled();
});

test("invalid auth callback fails closed",async({page})=>{
  await page.goto("/auth/callback?code=invalid");
  await expect(page.getByText(/Sign-in/)).toBeVisible();
});
