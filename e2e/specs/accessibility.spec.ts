import { expect, test, type Browser, type BrowserContext, type Page } from "@playwright/test";
import { loginAsGuest, loginAsOwner } from "../helpers/auth";
import {
  advancePhase,
  createAction,
  createInvitation,
  createItem,
  createProject,
  createSession,
  generateShareToken,
  generateSummaryShareToken,
} from "../helpers/factories";
import { resetDatabase } from "../helpers/db-reset";
import {
  expectDialogsNamedAndInViewport,
  expectNoWcag22AAViolations,
  expectResponsiveAccessiblePage,
  expectTouchTargets,
} from "../helpers/accessibility";

const VIEWPORTS = [
  { name: "phone", width: 393, height: 873 },
  { name: "tablet portrait", width: 768, height: 1024 },
  { name: "tablet landscape", width: 1024, height: 768 },
  { name: "desktop", width: 1280, height: 800 },
  { name: "wide desktop", width: 1440, height: 900 },
] as const;

type TestUser = Awaited<ReturnType<typeof loginAsOwner>>;

test.beforeEach(async () => {
  await resetDatabase();
});

function requestOptions(context: BrowserContext, user: TestUser) {
  return { request: context.request, cookie: user.cookie };
}

async function newContext(browser: Browser, viewport: { width: number; height: number }) {
  return browser.newContext({
    reducedMotion: "reduce",
    viewport,
  });
}

async function gotoAndAudit(page: Page, path: string, ready: () => Promise<void>, focusTabStops = 14) {
  await page.goto(path);
  await ready();
  await expectResponsiveAccessiblePage(page, focusTabStops);
}

test.describe("WCAG 2.2 AA and responsive layout", () => {
  for (const viewport of VIEWPORTS) {
    test(`${viewport.name} viewport has accessible responsive pages`, async ({ browser }) => {
      test.setTimeout(180_000);
      const contexts: BrowserContext[] = [];
      const createContext = async () => {
        const context = await newContext(browser, viewport);
        contexts.push(context);
        return context;
      };

      try {
        const publicContext = await createContext();
        const publicPage = await publicContext.newPage();

        await gotoAndAudit(
          publicPage,
          "/",
          async () => {
            await expect(publicPage.getByRole("heading", { name: "Twenty Twenty" })).toBeVisible();
          },
          10,
        );
        await gotoAndAudit(
          publicPage,
          "/login",
          async () => {
            await expect(publicPage.getByRole("heading", { name: "Get In" })).toBeVisible();
          },
          10,
        );

        const ownerContext = await createContext();
        const owner = await loginAsOwner(ownerContext);
        const ownerOpts = requestOptions(ownerContext, owner);
        const ownerPage = await ownerContext.newPage();

        const detailProject = await createProject(ownerOpts, {
          name: "Accessibility Project",
          description: "A project with enough content to exercise responsive layouts.",
        });
        await createInvitation(ownerOpts, detailProject.id);
        await createSession(ownerOpts, detailProject.id, { name: "Detail Session" });

        const ideationProject = await createProject(ownerOpts, { name: "Ideation Accessibility" });
        const ideationSession = await createSession(ownerOpts, ideationProject.id, { name: "Mobile Ideation" });
        await createItem(ownerOpts, ideationSession.id, { type: "good", content: "The team shared context clearly" });
        await createItem(ownerOpts, ideationSession.id, { type: "bad", content: "Action owners were unclear" });

        const actionProject = await createProject(ownerOpts, { name: "Action Accessibility" });
        const actionSession = await createSession(ownerOpts, actionProject.id, { name: "Mobile Actions" });
        await createItem(ownerOpts, actionSession.id, { type: "good", content: "Fast reviews" });
        await createItem(ownerOpts, actionSession.id, { type: "bad", content: "Slow handoffs" });
        await advancePhase(ownerOpts, actionSession.id);
        await createAction(ownerOpts, actionSession.id, { description: "Write down rollout owners" });

        const summaryProject = await createProject(ownerOpts, { name: "Summary Accessibility" });
        const summarySession = await createSession(ownerOpts, summaryProject.id, { name: "Mobile Summary" });
        await createItem(ownerOpts, summarySession.id, { type: "good", content: "Clear agenda" });
        await createItem(ownerOpts, summarySession.id, { type: "bad", content: "Too many follow-ups" });
        await advancePhase(ownerOpts, summarySession.id);
        await createAction(ownerOpts, summarySession.id, { description: "Trim recurring meeting scope" });
        await advancePhase(ownerOpts, summarySession.id);

        const reviewProject = await createProject(ownerOpts, { name: "Review Accessibility" });
        const previousSession = await createSession(ownerOpts, reviewProject.id, { name: "Previous Retro" });
        await createItem(ownerOpts, previousSession.id, { type: "bad", content: "Customer escalation lag" });
        await advancePhase(ownerOpts, previousSession.id);
        await createAction(ownerOpts, previousSession.id, { description: "Draft escalation checklist" });
        await advancePhase(ownerOpts, previousSession.id);
        const reviewSession = await createSession(ownerOpts, reviewProject.id, { name: "Review Retro" });

        await gotoAndAudit(
          ownerPage,
          "/projects",
          async () => {
            await expect(ownerPage.getByRole("heading", { name: "Your Projects" })).toBeVisible();
            await expect(ownerPage.getByText("Accessibility Project")).toBeVisible();
          },
        );
        await gotoAndAudit(
          ownerPage,
          "/projects/new",
          async () => {
            await expect(ownerPage.getByRole("heading", { name: "New Project" })).toBeVisible();
          },
        );
        await gotoAndAudit(
          ownerPage,
          `/projects/${detailProject.id}`,
          async () => {
            await expect(ownerPage.getByRole("heading", { name: "Accessibility Project" })).toBeVisible();
            await expect(ownerPage.getByText("/projects/invite/")).toBeVisible();
          },
        );
        await gotoAndAudit(
          ownerPage,
          `/projects/${ideationProject.id}/sessions/${ideationSession.id}`,
          async () => {
            await expect(ownerPage.getByRole("heading", { name: "Mobile Ideation" })).toBeVisible();
            await expect(ownerPage.locator('button[data-live-phase="true"]')).toHaveText("Look Within");
          },
        );

        await ownerPage.getByRole("button", { name: "Show participants" }).click();
        await expect(ownerPage.getByRole("dialog", { name: "Participants" })).toBeVisible();
        await expectDialogsNamedAndInViewport(ownerPage);
        await expectTouchTargets(ownerPage);
        await ownerPage.getByRole("button", { name: "Show participants" }).click();

        await expect(ownerPage.getByRole("button", { name: "Advance to Look Forward" })).toBeEnabled();
        await ownerPage.getByRole("button", { name: "Advance to Look Forward" }).click();
        await expect(ownerPage.getByRole("dialog", { name: "Move to Look Forward?" })).toBeVisible();
        await expectNoWcag22AAViolations(ownerPage);
        await expectDialogsNamedAndInViewport(ownerPage);
        await expectTouchTargets(ownerPage);
        await ownerPage.getByRole("button", { name: "Cancel" }).click();

        await gotoAndAudit(
          ownerPage,
          `/projects/${actionProject.id}/sessions/${actionSession.id}`,
          async () => {
            await expect(ownerPage.getByRole("heading", { name: "Mobile Actions" })).toBeVisible();
            await expect(ownerPage.locator('button[data-live-phase="true"]')).toHaveText("Look Forward");
          },
        );
        await gotoAndAudit(
          ownerPage,
          `/projects/${reviewProject.id}/sessions/${reviewSession.id}`,
          async () => {
            await expect(ownerPage.getByRole("heading", { name: "Review Retro" })).toBeVisible();
            await expect(ownerPage.getByText("Reviewing Previous Actions")).toBeVisible();
          },
        );
        await gotoAndAudit(
          ownerPage,
          `/projects/${summaryProject.id}/sessions/${summarySession.id}`,
          async () => {
            await expect(ownerPage.getByRole("heading", { level: 1, name: "Mobile Summary" })).toBeVisible();
            await expect(ownerPage.getByText("Final Summary")).toBeVisible();
          },
        );

        const { summaryShareToken } = await generateSummaryShareToken(ownerOpts, summarySession.id);
        await gotoAndAudit(
          publicPage,
          `/summary/${summaryShareToken}`,
          async () => {
            await expect(publicPage.getByRole("heading", { name: "Mobile Summary" })).toBeVisible();
            await expect(publicPage.getByText("Final Summary")).toBeVisible();
          },
        );

        const guestContext = await createContext();
        await loginAsGuest(guestContext);
        const guestPage = await guestContext.newPage();
        const { shareToken } = await generateShareToken(ownerOpts, ideationSession.id);
        const invitation = await createInvitation(ownerOpts, detailProject.id);

        await gotoAndAudit(
          guestPage,
          `/join/${shareToken}`,
          async () => {
            await expect(guestPage.getByRole("heading", { name: "Mobile Ideation" })).toBeVisible();
            await expect(guestPage.getByRole("button", { name: "Join As Guest" })).toBeVisible();
          },
        );
        await gotoAndAudit(
          guestPage,
          `/projects/invite/${invitation.token}`,
          async () => {
            await expect(guestPage.getByRole("heading", { name: "Accessibility Project" })).toBeVisible();
            await expect(guestPage.getByRole("button", { name: "Join Project" })).toBeVisible();
          },
        );
      } finally {
        await Promise.all(contexts.map((context) => context.close()));
      }
    });
  }
});
