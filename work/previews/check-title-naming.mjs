import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { chromium } from '../../packages/desktop/node_modules/playwright-core/index.mjs'

const bundle = await build({ entryPoints: ['work/previews/title-naming-implementation.tsx'], bundle: true,
  write: false, jsx: 'automatic', platform: 'browser', nodePaths: [`${process.cwd()}/packages/desktop/node_modules`],
  loader: { '.svg': 'dataurl' }, external: ['mermaid'] })
const css = await readFile('packages/desktop/src/renderer/src/styles.css', 'utf8')
const server = createServer((request, response) => {
  if (request.url === '/app.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundle.outputFiles[0].text) }
  else if (request.url === '/styles.css') { response.setHeader('Content-Type', 'text/css'); response.end(css) }
  else {
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end('<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><output id="requests" hidden></output><script src="/app.js"></script></body></html>')
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1152, height: 850 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const url = `http://127.0.0.1:${server.address().port}`
  await page.goto(url)
  const choice = page.getByRole('radiogroup', { name: '会话标题命名', exact: true })
  await choice.waitFor()
  assert.equal(await choice.getByRole('radio', { name: '关闭', exact: true }).getAttribute('aria-checked'), 'true')
  for (const [label, value] of [['首轮总结', 'first'], ['每轮更新', 'latest'], ['关闭', 'off']]) {
    await choice.getByRole('radio', { name: label, exact: true }).click()
    await page.waitForFunction((value) => {
      const requests = JSON.parse(document.getElementById('requests').textContent)
      return requests.at(-1)?.params?.titleNaming === value
    }, value)
    assert.equal(await choice.getByRole('radio', { name: label, exact: true }).getAttribute('aria-checked'), 'true')
    const requests = JSON.parse(await page.locator('#requests').textContent())
    assert.deepEqual(requests.at(-1).params.titleModels, { claude: 'haiku' })
  }
  await choice.getByRole('radio', { name: '首轮总结', exact: true }).click()
  await choice.scrollIntoViewIfNeeded()
  await page.screenshot({ path: 'work/previews/title-naming-implemented.png', fullPage: true })
  // The existing lightweight-model selector also updates background title model choices.
  await page.getByRole('button', { name: /^Claude Code 做轻量任务用的模型/ }).click()
  await page.getByRole('menuitemradio', { name: /Sonnet/ }).click()
  await page.waitForFunction(() => JSON.parse(document.getElementById('requests').textContent).at(-1)?.params?.titleModels?.claude === 'sonnet')
  await page.getByRole('textbox', { name: '搜索设置' }).fill('标题')
  await choice.waitFor()
  await page.setViewportSize({ width: 736, height: 850 })
  await choice.scrollIntoViewIfNeeded()
  assert.ok(await choice.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return box.left >= 0 && box.right <= innerWidth && element.scrollWidth <= element.clientWidth
  }))
  assert.ok(await choice.evaluate((element) => {
    const description = element.closest('.settings-row').querySelector('.settings-row-text')
    return description.getBoundingClientRect().bottom <= element.getBoundingClientRect().top
  }), 'narrow title controls wrap below their description')
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.locator('.settings-row').filter({ has: choice }).screenshot({ path: 'work/previews/title-naming-implemented-dark.png' })
  await page.goto(`${url}?legacy`)
  await page.getByRole('heading', { name: '智能体', exact: true }).waitFor()
  assert.equal(await choice.count(), 0)
  assert.deepEqual(errors, [])
  console.log('Verified real settings page: off by default, all three modes save to core, lightweight model synchronization, settings search, narrow layout, dark theme and older-core compatibility.')
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
}
