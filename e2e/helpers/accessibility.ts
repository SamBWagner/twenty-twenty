import { expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const WCAG_22_AA_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

function formatAxeViolations(violations: Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"]) {
  return violations
    .map((violation) => {
      const nodes = violation.nodes
        .slice(0, 4)
        .map((node) => `    ${node.target.join(" ")}: ${node.failureSummary || "No failure summary"}`)
        .join("\n");

      return `${violation.id} (${violation.impact || "unknown"}): ${violation.help}\n${nodes}`;
    })
    .join("\n\n");
}

export async function expectNoWcag22AAViolations(page: Page) {
  const results = await new AxeBuilder({ page })
    .withTags(WCAG_22_AA_TAGS)
    .analyze();

  expect(results.violations, formatAxeViolations(results.violations)).toEqual([]);
}

export async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const documentElement = document.documentElement;
    const body = document.body;
    const viewportWidth = window.innerWidth;

    return {
      bodyScrollWidth: body?.scrollWidth || 0,
      documentScrollWidth: documentElement.scrollWidth,
      viewportWidth,
    };
  });

  const maxScrollWidth = Math.max(overflow.bodyScrollWidth, overflow.documentScrollWidth);
  expect(
    maxScrollWidth,
    `Expected no horizontal overflow at ${overflow.viewportWidth}px, but scroll width was ${maxScrollWidth}px`,
  ).toBeLessThanOrEqual(overflow.viewportWidth + 1);
}

export async function expectTouchTargets(page: Page) {
  const violations = await page.evaluate(() => {
    const interactiveSelector = [
      "a[href]",
      "button",
      "input:not([type='hidden'])",
      "select",
      "textarea",
      "summary",
      "[role='button']",
      "[role='link']",
      "[role='checkbox']",
      "[role='radio']",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");

    function isElementVisible(element: Element, rect: DOMRect) {
      const style = window.getComputedStyle(element);
      return style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity) !== 0
        && rect.width > 0
        && rect.height > 0
        && rect.bottom >= 0
        && rect.right >= 0
        && rect.top <= window.innerHeight
        && rect.left <= window.innerWidth;
    }

    function isElementDisabled(element: Element) {
      return element.matches(":disabled") || element.getAttribute("aria-disabled") === "true";
    }

    function labelFor(element: Element) {
      const accessibleLabel = element.getAttribute("aria-label")
        || element.getAttribute("title")
        || element.textContent
        || element.getAttribute("placeholder")
        || element.getAttribute("name")
        || element.tagName.toLowerCase();

      return accessibleLabel.replace(/\s+/g, " ").trim().slice(0, 80);
    }

    return Array.from(document.querySelectorAll(interactiveSelector))
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ element, rect }) => !isElementDisabled(element) && isElementVisible(element, rect))
      .filter(({ rect }) => rect.width < 24 || rect.height < 24)
      .map(({ element, rect }) => ({
        height: Math.round(rect.height * 10) / 10,
        label: labelFor(element),
        tag: element.tagName.toLowerCase(),
        width: Math.round(rect.width * 10) / 10,
      }));
  });

  expect(violations, `Interactive targets below 24x24 CSS px:\n${JSON.stringify(violations, null, 2)}`).toEqual([]);
}

export async function expectKeyboardFocusVisible(page: Page, maxTabStops = 16) {
  type FocusState = {
    hasVisibleIndicator: boolean;
    inViewport: boolean;
    label: string;
  } | null;

  async function readFocusState(): Promise<FocusState> {
    return page.evaluate(() => {
      const activeElement = document.activeElement;
      if (!(activeElement instanceof HTMLElement) || activeElement === document.body) {
        return null;
      }

      const viewportTolerancePx = 1;
      const rect = activeElement.getBoundingClientRect();
      const style = window.getComputedStyle(activeElement);
      const outlineWidth = Number.parseFloat(style.outlineWidth || "0");
      const hasOutline = style.outlineStyle !== "none" && outlineWidth > 0;
      const hasShadow = style.boxShadow !== "none";
      const label = activeElement.getAttribute("aria-label")
        || activeElement.getAttribute("title")
        || activeElement.textContent
        || activeElement.getAttribute("placeholder")
        || activeElement.tagName.toLowerCase();

      return {
        hasVisibleIndicator: hasOutline || hasShadow,
        inViewport: rect.top >= -viewportTolerancePx
          && rect.left >= -viewportTolerancePx
          && rect.bottom <= window.innerHeight + viewportTolerancePx
          && rect.right <= window.innerWidth + viewportTolerancePx,
        label: label.replace(/\s+/g, " ").trim().slice(0, 80),
      };
    });
  }

  async function waitForSettledFocusState() {
    const timeoutMs = 750;
    const retryIntervalMs = 50;
    const deadline = Date.now() + timeoutMs;
    let latestState: FocusState = null;

    while (Date.now() <= deadline) {
      latestState = await readFocusState();

      if (latestState?.inViewport && latestState.hasVisibleIndicator) {
        return latestState;
      }

      await page.waitForTimeout(retryIntervalMs);
    }

    return latestState ?? (await readFocusState());
  }

  const focusableCount = await page.evaluate(() => {
    const selector = [
      "a[href]",
      "button:not(:disabled)",
      "input:not(:disabled):not([type='hidden'])",
      "select:not(:disabled)",
      "textarea:not(:disabled)",
      "summary",
      "[tabindex]:not([tabindex='-1'])",
    ].join(",");

    return Array.from(document.querySelectorAll<HTMLElement>(selector)).filter((element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity) !== 0
        && rect.width > 0
        && rect.height > 0;
    }).length;
  });

  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    window.scrollTo(0, 0);
  });

  const failures: Array<{ label: string; reason: string }> = [];
  const tabStopsToCheck = Math.min(focusableCount, maxTabStops);

  for (let index = 0; index < tabStopsToCheck; index += 1) {
    await page.keyboard.press("Tab");
    const state = await waitForSettledFocusState();

    if (!state) {
      continue;
    }

    if (!state.inViewport) {
      failures.push({ label: state.label, reason: "focused element is outside the viewport" });
    }

    if (!state.hasVisibleIndicator) {
      failures.push({ label: state.label, reason: "focused element has no visible outline or shadow" });
    }
  }

  expect(failures, `Keyboard focus failures:\n${JSON.stringify(failures, null, 2)}`).toEqual([]);
}

export async function expectDialogsNamedAndInViewport(page: Page) {
  const violations = await page.evaluate(() => {
    function isVisible(element: Element, rect: DOMRect) {
      const style = window.getComputedStyle(element);
      return style.display !== "none"
        && style.visibility !== "hidden"
        && Number(style.opacity) !== 0
        && rect.width > 0
        && rect.height > 0;
    }

    return Array.from(document.querySelectorAll<HTMLElement>("[role='dialog'], [role='alertdialog']"))
      .map((dialog) => ({ dialog, rect: dialog.getBoundingClientRect() }))
      .filter(({ dialog, rect }) => isVisible(dialog, rect))
      .flatMap(({ dialog, rect }) => {
        const problems: Array<{ label: string; reason: string }> = [];
        const labelledBy = dialog.getAttribute("aria-labelledby");
        const ariaLabel = dialog.getAttribute("aria-label");
        const labelText = labelledBy
          ? document.getElementById(labelledBy)?.textContent?.trim()
          : ariaLabel?.trim();
        const fallbackLabel = dialog.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) || dialog.tagName;

        if (!labelText) {
          problems.push({ label: fallbackLabel, reason: "dialog has no aria-label or aria-labelledby text" });
        }

        if (
          rect.left < 0
          || rect.top < 0
          || rect.right > window.innerWidth
          || rect.bottom > window.innerHeight
        ) {
          problems.push({ label: fallbackLabel, reason: "dialog extends outside the viewport" });
        }

        return problems;
      });
  });

  expect(violations, `Dialog accessibility failures:\n${JSON.stringify(violations, null, 2)}`).toEqual([]);
}

export async function expectResponsiveAccessiblePage(page: Page, focusTabStops = 16) {
  await expectNoWcag22AAViolations(page);
  await expectNoHorizontalOverflow(page);
  await expectTouchTargets(page);
  await expectDialogsNamedAndInViewport(page);
  await expectKeyboardFocusVisible(page, focusTabStops);
}
