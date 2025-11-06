import { test, expect } from "@playwright/test";

function randomSessionName() {
  return `E2E Session ${Date.now()}`;
}

test.describe("Studio sessions", () => {
  test("create session and navigate to detail", async ({ page }) => {
    const sessionName = randomSessionName();

    await page.goto("/sessions");

    await page.getByPlaceholder("New session name").fill(sessionName);
    await page.getByRole("button", { name: "Create" }).click();

    const sessionItem = page.getByRole("listitem").filter({ hasText: sessionName });
    await expect(sessionItem).toBeVisible();

    await sessionItem.getByRole("link", { name: "Open session" }).click();

    await expect(page).toHaveURL(/\/sessions\//);
    await expect(page.getByRole("heading", { name: sessionName })).toBeVisible();
    await expect(page.getByRole("button", { name: "Join Room" })).toBeVisible();
  });
});
