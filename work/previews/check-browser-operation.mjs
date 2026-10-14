import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { chromium } from '../../packages/desktop/node_modules/playwright-core/index.mjs'

const result = await build({ entryPoints: ['work/previews/browser-operation-implementation.tsx'], bundle: true, write: false, jsx: 'automatic', platform: 'browser', nodePaths: [`${process.cwd()}/packages/desktop/node_modules`], loader: { '.svg': 'dataurl' } })
const css = await readFile('packages/desktop/src/renderer/src/styles.css', 'utf8')
const server = createServer((request, response) => {
  if (request.url === '/app.js') {
    response.setHeader('Content-Type', 'text/javascript')
    response.end(result.outputFiles[0].text)
  } else if (request.url === '/styles.css') {
    response.setHeader('Content-Type', 'text/css')
    response.end(css)
  } else {
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end('<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/app.js"></script></body></html>')
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const address = server.address()
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 736, height: 480 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`http://127.0.0.1:${address.port}`)
  await page.locator('.chat-browser-window').waitFor()
  for (const [operation, action] of [['navigate', 'navigate'], ['click', 'click'], ['type', 'type'], ['scroll', 'scroll'], ['get_page_text', 'read'], ['screenshot', 'screenshot']]) {
    await page.getByRole('button', { name: operation, exact: true }).click()
    if (await page.locator('.chat-browser-activity').getAttribute('data-action') !== action) throw new Error(`wrong action: ${operation}`)
    const animations = await page.locator('.chat-browser-activity').evaluate((element) => element.getAnimations({ subtree: true }).filter((animation) => animation.playState === 'running').length)
    if (!animations) throw new Error(`missing animation: ${operation}`)
  }
  await page.getByRole('button', { name: 'click', exact: true }).click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: 'work/previews/browser-operation-implemented.png', fullPage: true })
  await page.getByRole('button', { name: '完成', exact: true }).click()
  const completedMotion = await page.locator('.chat-view').evaluate((element) => element.getAnimations({ subtree: true }).length)
  if (completedMotion) throw new Error('completed activity still animates')
  await page.getByRole('button', { name: '失败', exact: true }).click()
  if (!(await page.getByRole('status').textContent()).includes('失败')) throw new Error('failure hidden')
  for (const width of [320, 736, 1280]) {
    await page.setViewportSize({ width, height: 520 })
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error(`overflow at ${width}`)
    const centered = await page.locator('.chat-browser-activity').evaluate((element) => {
      const panel = element.getBoundingClientRect()
      const parent = element.parentElement.getBoundingClientRect()
      return Math.abs(panel.left + panel.width / 2 - parent.left - parent.width / 2) < 1
    })
    if (!centered) throw new Error(`browser activity not centered at ${width}`)
  }
  await page.getByRole('button', { name: 'click', exact: true }).click()
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  const reducedMotion = await page.locator('.chat-view').evaluate((element) => element.getAnimations({ subtree: true }).length)
  if (reducedMotion) throw new Error('reduced-motion still animates')
  await page.screenshot({ path: 'work/previews/browser-operation-implemented-dark.png', fullPage: true })
  if (errors.length) throw new Error(errors.join('; '))
  console.log('Actual components verified: six browser actions, completed/failed states, 320/736/1280px layouts, dark theme and reduced motion.')
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
}
