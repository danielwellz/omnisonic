import { test, expect } from "@playwright/test";

function randomSessionName() {
  return `E2E Session ${Date.now()}`;
}

test.describe("Studio sessions", () => {
  test("create session and navigate to detail", async ({ page }) => {
    const sessionName = randomSessionName();
    const email = `tester-${Date.now()}@example.com`;
    const password = "Password123";

    await page.goto("/signin");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(password);
    await page.getByRole("button", { name: "Continue with email" }).click();

    await expect(page).toHaveURL(/\/sessions/);

    await page.goto("/sessions");

    await page.getByPlaceholder("New session name").fill(sessionName);
    await page.getByRole("button", { name: "Create" }).click();

    const sessionItem = page.getByRole("listitem").filter({ hasText: sessionName });
    await expect(sessionItem).toBeVisible();

    await sessionItem.getByRole("link", { name: "Open session" }).click();

    await expect(page).toHaveURL(/\/sessions\//);
    await expect(page.getByRole("heading", { name: sessionName })).toBeVisible();
    await expect(page.getByRole("button", { name: "Join Room" })).toBeVisible();

    const uploadInput = page.getByTestId("upload-input");
    await uploadInput.setInputFiles("apps/studio-web/e2e/fixtures/sample.wav");
    await expect(page.getByText("sample.wav")).toBeVisible();

    await page.getByRole("button", { name: "Render mixdown" }).click();
    await expect(page.getByText("Export queued")).toBeVisible();
    await expect(page.getByText(/Status:/)).toBeVisible();
  });
});
