import assert from 'node:assert/strict'

/** Navigate back through the mobile shell until its one main menu is visible. */
export async function returnToHome(page) {
  for (let attempt = 0; attempt < 7; attempt++) {
    if (await page.locator('[data-page="home"]').isVisible().catch(() => false)) return
    await page.evaluate(() => window.grapesHandleAndroidBack?.())
    await page.waitForTimeout(50)
  }
  assert.equal(await page.locator('[data-page="home"]').isVisible().catch(() => false), true,
    'A modulból Android Back művelettel vissza kell jutni a főmenübe.')
}
