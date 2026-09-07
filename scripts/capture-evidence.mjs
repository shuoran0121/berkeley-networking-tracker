/**
 * Drive the real app in a real browser and capture the grading evidence.
 *
 *   node scripts/capture-evidence.mjs [baseUrl]
 *
 * Defaults to http://localhost:3000. Pass the deployed URL to re-capture
 * against production.
 *
 * The script is idempotent: it signs in if the demo accounts already exist and
 * only adds a contact when one of that name is missing, so it can be re-run
 * without piling up duplicates.
 *
 * The two-account check at the end is the important one. User B signs in and we
 * assert that none of User A's contacts are on the page — that assertion is what
 * makes the screenshot mean something.
 */
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { chromium, devices } from 'playwright';

const BASE_URL = (process.argv[2] ?? 'http://localhost:3000').replace(/\/+$/, '');
const OUT_DIR = fileURLToPath(new URL('../docs/screenshots/', import.meta.url));

const USER_A = {
  name: 'Alice Chen',
  email: 'alice.demo@example.com',
  password: 'TrackerDemo!2026a',
};

const USER_B = {
  name: 'Ben Ortiz',
  email: 'ben.demo@example.com',
  password: 'TrackerDemo!2026b',
};

const CONTACTS_A = [
  {
    name: 'Priya Raman',
    company: 'Berkeley SkyDeck',
    role: 'Program Director',
    where_met: 'SkyDeck Demo Day',
    priority: 'high',
    notes: 'Introduced me to two founders in the Batch 19 cohort. Follow up in January.',
  },
  {
    name: 'Daniel Okafor',
    company: 'Haas School of Business',
    role: 'Lecturer, Entrepreneurship',
    where_met: 'Office hours',
    priority: 'medium',
    notes: 'Offered to review the go-to-market section of my project.',
  },
  {
    name: 'Mei Lin',
    company: 'Berkeley AI Research',
    role: 'PhD Candidate',
    where_met: 'BAIR seminar',
    priority: 'high',
    notes: 'Working on retrieval evaluation. Wants to swap notes next term.',
  },
  {
    name: 'Tomas Vega',
    company: 'Cal Alumni Association',
    role: 'Community Lead',
    where_met: 'Alumni mixer, Oakland',
    priority: 'low',
    notes: 'Runs the monthly meetup. Good person to know for introductions.',
  },
];

const CONTACT_B = {
  name: 'Sofia Marchetti',
  company: 'Berkeley Law',
  role: 'Clinic Supervisor',
  where_met: 'Startup legal clinic',
  priority: 'medium',
  notes: "Ben's contact. Alice must never see this row.",
};

/**
 * The list renders twice — a table for wide screens and cards for narrow ones —
 * and both are in the DOM at all times, with CSS hiding one. Matching on text
 * alone would find the hidden copy, so every lookup filters to what is visible
 * in the current viewport.
 *
 * Matching is on a substring, not the exact string: in the table a name shares a
 * cell with the contact's notes, so an exact match would never hit.
 */
const visibleText = (page, text) =>
  page.getByText(text).filter({ visible: true }).first();

let step = 0;
const shot = async (page, label) => {
  step += 1;
  const name = `${String(step).padStart(2, '0')}-${label}.png`;
  await page.screenshot({ path: join(OUT_DIR, name) });
  console.log(`  captured ${name}`);
};

/** Sign in if the account exists, otherwise create it. */
async function authenticate(page, user) {
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });

  // Wait for the session gate to settle on the auth panel. The card titles are
  // divs, not headings, so identify the mode by which submit button is present.
  await page.getByLabel('Email').waitFor({ timeout: 30000 });

  const inSignUpMode = await page
    .getByRole('button', { name: 'Create account' })
    .isVisible()
    .catch(() => false);

  if (!inSignUpMode) {
    await page.getByLabel('Email').fill(user.email);
    await page.getByLabel('Password').fill(user.password);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();

    // Either we land in the app, or the account does not exist yet.
    const landed = await page
      .getByRole('button', { name: 'Sign out' })
      .waitFor({ timeout: 8000 })
      .then(() => true)
      .catch(() => false);

    if (landed) return;

    await page.getByRole('button', { name: 'Sign up' }).click();
  }

  await page.getByRole('button', { name: 'Create account' }).waitFor();
  await page.getByLabel('Name').fill(user.name);
  await page.getByLabel('Email').fill(user.email);
  await page.getByLabel('Password').fill(user.password);
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('button', { name: 'Sign out' }).waitFor({ timeout: 15000 });
}

async function openAddDialog(page) {
  await page.getByRole('button', { name: 'Add contact' }).first().click();
  await page.getByRole('dialog').waitFor();
}

async function fillContactDialog(page, contact) {
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(contact.name ?? '');
  await dialog.getByLabel('Company').fill(contact.company ?? '');
  await dialog.getByLabel('Role').fill(contact.role ?? '');
  await dialog.getByLabel('Where you met').fill(contact.where_met ?? '');
  await dialog.getByLabel('Notes').fill(contact.notes ?? '');

  if (contact.priority) {
    await dialog.getByLabel('Priority').click();
    await page.getByRole('option', { name: contact.priority, exact: true }).click();
  }
}

/** Add the contact only if a row with that name is not already present. */
async function ensureContact(page, contact) {
  const existing = visibleText(page, contact.name);
  if (await existing.isVisible().catch(() => false)) return false;

  await openAddDialog(page);
  await fillContactDialog(page, contact);
  await page.getByRole('dialog').getByRole('button', { name: 'Add contact' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 15000 });
  await visibleText(page, contact.name).waitFor({ timeout: 15000 });
  return true;
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });
  console.log(`Capturing evidence against ${BASE_URL}`);

  const browser = await chromium.launch();

  // ---------------------------------------------------------------- User A
  const contextA = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await contextA.newPage();

  console.log('User A');
  await page.goto(BASE_URL, { waitUntil: 'networkidle' });
  await page.getByLabel('Email').waitFor({ timeout: 30000 });
  await shot(page, 'sign-in');

  await authenticate(page, USER_A);
  await shot(page, 'signed-in');

  for (const contact of CONTACTS_A) await ensureContact(page, contact);
  // Let the success toast fade so it does not sit over the header.
  await page.waitForTimeout(5000);
  await shot(page, 'contact-list');

  // Sort by priority: high must come first.
  await page.getByLabel('Sort by').click();
  await page.getByRole('option', { name: 'Priority' }).click();
  await page.waitForTimeout(200);
  await page.getByRole('button', { name: /Sorted/ }).click(); // ascending => rank 1 first
  await page.waitForTimeout(1200);
  await shot(page, 'sort-by-priority');

  // Filter to high priority only.
  await page.getByLabel('Priority', { exact: true }).first().click();
  await page.getByRole('option', { name: 'high', exact: true }).click();
  await page.waitForTimeout(800);
  await shot(page, 'filter-high-priority');

  // Reset the filter.
  await page.getByLabel('Priority', { exact: true }).first().click();
  await page.getByRole('option', { name: 'All', exact: true }).click();
  await page.waitForTimeout(600);

  // Invalid input: blank name is rejected by the server with a field message.
  await openAddDialog(page);
  await fillContactDialog(page, { name: '   ', company: 'Berkeley Haas' });
  await page.getByRole('dialog').getByRole('button', { name: 'Add contact' }).click();
  await page.getByText('Name is required').waitFor({ timeout: 10000 });
  await shot(page, 'invalid-name-rejected');
  await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });

  // Edit an existing contact.
  await page.getByRole('row', { name: /Tomas Vega/ }).getByRole('button', { name: 'Edit' }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('dialog').getByLabel('Notes').fill('Edited: now co-hosting the winter mixer.');
  await shot(page, 'edit-contact');
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 15000 });
  await page.waitForTimeout(600);

  // Persistence: a full reload re-reads from Neon Postgres.
  await page.reload({ waitUntil: 'networkidle' });
  await visibleText(page, 'Edited: now co-hosting the winter mixer.').waitFor({ timeout: 15000 });
  await shot(page, 'persists-after-refresh');

  // Delete: add a throwaway row so the main set survives.
  await ensureContact(page, { name: 'Temporary Test Row', priority: 'low' });
  await page
    .getByRole('row', { name: /Temporary Test Row/ })
    .getByRole('button', { name: 'Delete' })
    .click();
  await page.getByRole('dialog').waitFor();
  await shot(page, 'delete-confirmation');
  await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden', timeout: 15000 });
  await page.waitForTimeout(5000);
  await shot(page, 'after-delete');

  // ---------------------------------------------------------------- Mobile
  console.log('Mobile viewport');
  const mobileContext = await browser.newContext({ ...devices['iPhone 13'] });
  const mobile = await mobileContext.newPage();
  await authenticate(mobile, USER_A);
  await mobile.waitForTimeout(3000);
  await shot(mobile, 'mobile-contact-list');
  await mobileContext.close();

  // ---------------------------------------------------------------- Sign out
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByLabel('Email').waitFor({ timeout: 15000 });
  await shot(page, 'signed-out');
  await contextA.close();

  // ---------------------------------------------------------------- User B
  console.log('User B (privacy check)');
  const contextB = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const pageB = await contextB.newPage();

  await authenticate(pageB, USER_B);
  await ensureContact(pageB, CONTACT_B);
  await pageB.waitForTimeout(800);

  // The assertion that gives the screenshot its meaning.
  const leaked = [];
  for (const contact of CONTACTS_A) {
    if (await visibleText(pageB, contact.name).isVisible().catch(() => false)) {
      leaked.push(contact.name);
    }
  }

  await shot(pageB, 'user-b-cannot-see-user-a');
  await contextB.close();
  await browser.close();

  if (leaked.length > 0) {
    console.error(`\nRLS FAILURE: User B can see User A's contacts: ${leaked.join(', ')}`);
    process.exit(1);
  }

  console.log(`\nPrivacy check passed: none of User A's ${CONTACTS_A.length} contacts were visible to User B.`);
  console.log(`Screenshots written to docs/screenshots/`);
}

await main();
