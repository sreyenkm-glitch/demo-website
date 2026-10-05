import { type Page, expect, test } from "@playwright/test";

const PASSWORD = "reset-day";

async function login(page: Page, email: string) {
  await page.context().clearCookies();
  await page.goto("/login");
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.getByRole("button", { name: /start the reset/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"));
}

const keepGoing = (page: Page) => page.getByRole("button", { name: /keep going|review my reset/i }).click();

test.describe.serial("the weekly loop", () => {
  test("rejects bad credentials", async ({ page }) => {
    await page.goto("/login");
    await page.fill("#email", "maya@obsa.team");
    await page.fill("#password", "nope-nope");
    await page.getByRole("button", { name: /start the reset/i }).click();
    await expect(page.locator(".err")).toContainText("didn't work");
  });

  test("member is blocked from admin + other people's data", async ({ page, request }) => {
    await login(page, "rhea@obsa.team");
    await page.goto("/admin");
    const kabirReset = await page.getByRole("link", { name: /kabir mehta/i }).first().getAttribute("href");
    expect(kabirReset).toMatch(/\/admin\/resets\//);
    const resetId = kabirReset!.split("/").pop();

    await login(page, "maya@obsa.team");
    for (const path of [`/reset/${resetId}`, `/reset/${resetId}/view`, `/admin/resets/${resetId}`]) {
      await page.goto(path);
      await expect(page.getByText("Ship referral program landing page")).toHaveCount(0);
    }
    await page.goto("/admin");
    await expect(page).toHaveURL(/\/$/);
    await page.goto("/admin/settings");
    await expect(page).toHaveURL(/\/$/);
    const res = await page.request.get("/api/export?type=summary");
    expect(res.status()).toBe(403);
    const unauth = await request.get("/api/export?type=summary", { maxRedirects: 0 });
    expect([302, 307, 401]).toContain(unauth.status());
  });

  test("member completes a reset: save, resume, submit", async ({ page }) => {
    await login(page, "maya@obsa.team");
    await expect(page.getByText(/WEEK \d+/).first()).toBeVisible();
    await expect(page.getByText(/your reset is due in/i)).toBeVisible();
    await page.getByRole("link", { name: /start reset/i }).click();
    await page.waitForURL(/\/reset\/[^/]+$/);

    // 01 The week — use a carry-forward suggestion chip + a manual item
    await expect(page.getByText("THE WEEK")).toBeVisible();
    await page.getByRole("button", { name: /add what you worked on/i }).click();
    await page.getByPlaceholder("Task / initiative").first().fill("Newsletter #16 — the reset issue");
    await page.getByRole("button", { name: /in progress/i }).first().click();
    await keepGoing(page);

    // 02 Wins
    await page.getByRole("button", { name: /add a win/i }).click();
    await page.getByPlaceholder("What happened?").fill("Case study finally published");
    await page.getByLabel("Why did it matter?").fill("Proof from a real user beats our own claims.");
    await keepGoing(page);

    // 03 Misses
    await page.getByRole("button", { name: /add a miss/i }).click();
    await page.getByPlaceholder("What went wrong?").fill("LinkedIn batch slipped again");
    await page.getByRole("button", { name: "Yes, on me" }).click();
    await page.getByLabel("What should change next week?").fill("Block Monday 9–11 for batching");
    await keepGoing(page);

    // Save & continue later, then resume — answers must persist
    await expect(page.locator(".save-state")).toHaveText(/saved/i, { timeout: 15_000 });
    await page.goto("/");
    await expect(page.getByRole("link", { name: /continue my reset/i })).toBeVisible();
    await page.getByRole("link", { name: /continue my reset/i }).click();
    await expect(page.getByText("LEARNED")).toBeVisible(); // resumes at first unfinished section
    await page.getByRole("tab", { name: /^Wins/ }).click();
    await expect(page.getByPlaceholder("What happened?")).toHaveValue("Case study finally published");
    await page.getByRole("tab", { name: /^Learned/ }).click();

    // 04 Learned
    await page.getByRole("button", { name: "+ Customer" }).click();
    await page.getByLabel("What did you learn?").fill("Readers reply to honesty, not polish.");
    await keepGoing(page);

    // 05 Rate — set every slider
    const sliders = page.locator("input[type=range]");
    const n = await sliders.count();
    for (let i = 0; i < n; i++) await sliders.nth(i).fill(String(6 + (i % 4)));
    await expect(page.getByText(`${n} / ${n} rated`)).toBeVisible();
    await keepGoing(page);

    // 06 Own it — last week's priorities are here automatically
    const commitments = page.locator(".entry", { has: page.getByRole("group", { name: /status of/i }) });
    const c = await commitments.count();
    expect(c).toBeGreaterThan(0);
    for (let i = 0; i < c; i++) {
      const item = commitments.nth(i);
      await item.getByRole("button", { name: i === 0 ? /didn't happen/i : /done/i }).click();
    }
    const first = commitments.first();
    const carriedTitle = (await first.locator("div[style*='font-weight: 700']").first().textContent())!.trim();
    await first.getByLabel("Why?").fill("Ran out of week.");
    await first.getByText("Carry forward").click();
    await page.getByLabel("What will you do differently this week?").fill("Protect mornings.");
    await keepGoing(page);

    // 07 Reset — carried item is already priority #1
    await expect(page.getByLabel("Priority 1")).toHaveValue(carriedTitle);
    await page.getByRole("button", { name: /add priority/i }).click();
    await page.getByLabel("Priority 2").fill("Launch the reset-streak community challenge");
    await page.getByLabel("One thing I will STOP").fill("Writing posts one at a time");
    await page.getByLabel("One thing I will START").fill("Monday batching");
    await page.getByLabel("One thing I will CONTINUE").fill("Reels with Kabir");
    await page.getByLabel("My one non-negotiable for next week").fill("Newsletter out Tuesday 9am");
    await keepGoing(page);

    // MY RESET summary + submit
    await expect(page.getByText("I'm reset.")).toBeVisible();
    await expect(page.locator(".my-reset")).toContainText("Case study finally published");
    await expect(page.locator(".my-reset")).toContainText("Newsletter out Tuesday 9am");
    await page.getByRole("button", { name: /submit reset/i }).click();
    await page.waitForURL(/\/view\?done=1/);
    await expect(page.getByText("COMPLETE.")).toBeVisible();
    await expect(page.getByText("Case study finally published")).toBeVisible();
  });

  test("admin sees it, reviews it", async ({ page }) => {
    await login(page, "rhea@obsa.team");
    await page.goto("/admin?f=review");
    await page.getByRole("link", { name: /maya lindqvist/i }).first().click();
    await page.waitForURL(/\/admin\/resets\//);
    await expect(page.getByText("Case study finally published").first()).toBeVisible();
    await page.getByRole("button", { name: /kudos/i }).click();
    await page.getByLabel("Comment").fill("Love the honesty on the LinkedIn miss. Monday blocks it is.");
    await page.getByRole("button", { name: /lock in review/i }).click();
    await expect(page.getByText("Marked reviewed.")).toBeVisible();
    await expect(page.locator(".pill", { hasText: "Reviewed" }).first()).toBeVisible();
  });

  test("member sees the feedback", async ({ page }) => {
    await login(page, "maya@obsa.team");
    await expect(page.getByRole("main").getByText("Love the honesty on the LinkedIn miss")).toBeVisible();
  });

  test("admin starts the next week; commitments carry forward; history stays", async ({ page }) => {
    await login(page, "rhea@obsa.team");
    await page.goto("/admin/weeks");
    await page.getByRole("button", { name: /start new reset/i }).click();
    await page.waitForURL(/\/admin\?week=.*started=1/);
    await expect(page.getByText(/is live/)).toBeVisible();

    await login(page, "maya@obsa.team");
    await page.getByRole("link", { name: /start reset/i }).click();
    await page.getByRole("tab", { name: /^Own It/ }).click();
    await expect(page.getByText("Launch the reset-streak community challenge")).toBeVisible();
    await expect(page.getByText("Newsletter out Tuesday 9am").first()).toBeVisible();

    await page.goto("/history");
    await expect(page.locator(".card.link", { hasText: "Reviewed" }).first()).toBeVisible();
  });

  test("insights, search, export and compare work for admin", async ({ page }) => {
    await login(page, "rhea@obsa.team");
    await page.goto("/admin/insights");
    await expect(page.getByRole("heading", { name: "Unresolved commitments" })).toBeVisible();
    await expect(page.getByText("Ship referral program landing page")).toBeVisible();
    await page.goto("/admin/search?q=case%20study");
    await expect(page.getByText("Case study finally published").first()).toBeVisible();
    const csv = await page.request.get("/api/export?type=summary");
    expect(csv.status()).toBe(200);
    expect(await csv.text()).toContain("Reset rate %");
    await page.goto("/compare?user=team");
    await expect(page.getByText(/improved/)).toBeVisible();
  });
});
