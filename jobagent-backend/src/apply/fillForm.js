async function findFirst(page, selectors) {
  for (const selector of selectors) {
    try {
      const el = await page.$(selector);
      if (el) return selector;
    } catch (err) {
      // ignore and try next selector
    }
  }
  return null;
}

async function fillField(page, selectors, value) {
  try {
    const selector = await findFirst(page, selectors);
    if (!selector) return false;
    await page.fill(selector, value);
    return true;
  } catch (err) {
    return false;
  }
}

async function fillResumeUpload(page, pdfPath) {
  if (!pdfPath) return false;
  try {
    const selector = await findFirst(page, ['input[type="file"]']);
    if (!selector) return false;
    await page.setInputFiles(selector, pdfPath);
    return true;
  } catch (err) {
    return false;
  }
}

async function fillWorkAuth(page) {
  const selectors = [
    'select[name*="authorization" i]',
    'select[name*="work_auth" i]',
    'input[value="yes" i][name*="auth" i]',
  ];
  try {
    const selector = await findFirst(page, selectors);
    if (!selector) return false;
    try {
      await page.selectOption(selector, { label: /yes/i });
    } catch (err) {
      await page.click(selector);
    }
    return true;
  } catch (err) {
    return false;
  }
}

async function clickSubmit(page) {
  const selectors = [
    'button[type="submit"]',
    'input[type="submit"]',
    'button:has-text("Submit")',
    'button:has-text("Apply Now")',
    'button:has-text("Apply")',
    'button:has-text("Send Application")',
  ];
  try {
    const selector = await findFirst(page, selectors);
    if (!selector) return false;

    await page.click(selector);
    try {
      await page.waitForNavigation({
        timeout: 8000,
        waitUntil: 'domcontentloaded',
      });
    } catch (err) {
      // Navigation may not happen on SPAs —
      // still consider submitted if click succeeded
    }
    return true;
  } catch (err) {
    return false;
  }
}

async function fillForm(page, userProfile, pdfPath) {
  await fillField(
    page,
    ['input[name*="name" i]', 'input[placeholder*="name" i]', '#full-name', '#fullName', '#name'],
    userProfile.name
  );

  await fillField(
    page,
    ['input[type="email"]', 'input[name*="email" i]'],
    userProfile.email
  );

  await fillField(
    page,
    ['input[type="tel"]', 'input[name*="phone" i]', 'input[placeholder*="phone" i]'],
    userProfile.phone || ''
  );

  await fillField(
    page,
    ['input[name*="location" i]', 'input[name*="city" i]', 'input[placeholder*="location" i]'],
    userProfile.location || ''
  );

  await fillResumeUpload(page, pdfPath);

  await fillField(
    page,
    ['input[name*="experience" i]', 'select[name*="experience" i]'],
    String(userProfile.experience_years || '')
  );

  const workAuthFilled = await fillWorkAuth(page);

  const submitted = await clickSubmit(page);

  return { submitted, finalUrl: page.url(), workAuthFilled };
}

module.exports = { fillForm };
