import { expect, test } from "@playwright/test";

test("desktop shell exposes the canonical Account navigation",async({page})=>{
  await page.goto("/?scenario=default");
  await expect(page.getByRole("heading",{name:"Overview"})).toBeVisible();
  const accountNav=page.getByRole("navigation",{name:"Account"});
  for(const name of ["Overview","Profile","Security","Apps","Data & Backup","Privacy"]){
    await expect(accountNav.getByRole("link",{name,exact:true})).toBeVisible();
  }
  await expect(accountNav.getByRole("link",{name:"Devices",exact:true})).toHaveCount(0);
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

test("auth error route presents a recovery action",async({page})=>{
  await page.goto("/auth/error");
  await expect(page.getByRole("heading",{name:"Sign-in error"})).toBeVisible();
  await expect(page.getByRole("link",{name:"Try again"})).toHaveAttribute("href","/auth/sign-in");
});


test("Security groups duplicate session environments instead of listing fake devices",async({page})=>{
  await page.goto("/security?scenario=many-devices");
  await expect(page.getByRole("heading",{name:"Security",exact:true})).toBeVisible();
  await expect(page.getByText("Where you're signed in")).toBeVisible();
  await expect(page.getByText("Firefox on Windows",{exact:true})).toHaveCount(1);
  await expect(page.getByText("Chrome on Android",{exact:true})).toHaveCount(1);
  await expect(page.getByText(/5 sessions/)).toHaveCount(2);
});

test("legacy Devices route redirects into Security sessions",async({page})=>{
  await page.goto("/devices?scenario=default");
  await expect(page).toHaveURL(/\/security#sessions$/);
  await expect(page.getByText("Where you're signed in")).toBeVisible();
});
