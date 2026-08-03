async function exists(page, selector) {
  try {
    const el = await page.$(selector);
    return el !== null;
  } catch (err) {
    return false;
  }
}

async function existsAny(page, selectors) {
  for (const selector of selectors) {
    if (await exists(page, selector)) return true;
  }
  return false;
}

const CAPTCHA_SELECTORS = [
  'iframe[src*="recaptcha"]',
  'iframe[src*="hcaptcha"]',
  '.g-recaptcha',
  '.h-captcha',
  '[data-sitekey]',
];

const LOGIN_WALL_SELECTORS = [
  'input[type="password"]',
  '[href*="/login"]',
  '[href*="/signin"]',
  '[href*="/sign-in"]',
];

const RESUME_UPLOAD_SELECTORS = ['input[type="file"]'];

const SUBMIT_BUTTON_SELECTORS = [
  'button[type="submit"]',
  'input[type="submit"]',
  'button:has-text("Submit")',
  'button:has-text("Apply")',
  'button:has-text("Apply Now")',
  'button:has-text("Send Application")',
];

const NAME_FIELD_SELECTORS = [
  'input[name*="name" i]',
  'input[placeholder*="name" i]',
];

const EMAIL_FIELD_SELECTORS = [
  'input[type="email"]',
  'input[name*="email" i]',
];

async function detectForm(page) {
  const hasCaptcha = await existsAny(page, CAPTCHA_SELECTORS);
  const hasLoginWall = await existsAny(page, LOGIN_WALL_SELECTORS);
  const hasResumeUpload = await existsAny(page, RESUME_UPLOAD_SELECTORS);
  const hasSubmitButton = await existsAny(page, SUBMIT_BUTTON_SELECTORS);
  const hasNameField = await existsAny(page, NAME_FIELD_SELECTORS);
  const hasEmailField = await existsAny(page, EMAIL_FIELD_SELECTORS);

  let formType;
  if (hasCaptcha) {
    formType = 'captcha';
  } else if (hasLoginWall) {
    formType = 'login_wall';
  } else if (hasResumeUpload && hasSubmitButton) {
    formType = 'standard';
  } else {
    formType = 'unknown';
  }

  return {
    hasNameField,
    hasEmailField,
    hasResumeUpload,
    hasSubmitButton,
    hasCaptcha,
    hasLoginWall,
    formType,
  };
}

module.exports = { detectForm };
