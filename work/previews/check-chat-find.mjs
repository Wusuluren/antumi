import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { chromium } from '../../packages/desktop/node_modules/playwright-core/index.mjs'

const bundle = await build({ entryPoints: ['work/previews/chat-find-implementation.tsx'], bundle: true,
  write: false, jsx: 'automatic', platform: 'browser', nodePaths: [`${process.cwd()}/packages/desktop/node_modules`],
  loader: { '.svg': 'dataurl' }, external: ['mermaid'] })
const css = await readFile('packages/desktop/src/renderer/src/styles.css', 'utf8')
const server = createServer((request, response) => {
  if (request.url === '/app.js') { response.setHeader('Content-Type', 'text/javascript'); response.end(bundle.outputFiles[0].text) }
  else if (request.url === '/styles.css') { response.setHeader('Content-Type', 'text/css'); response.end(css) }
  else {
    response.setHeader('Content-Type', 'text/html; charset=utf-8')
    response.end('<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><output id="captured-request" hidden></output><script src="/app.js"></script></body></html>')
  }
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true })
const url = `http://127.0.0.1:${server.address().port}`
const errors = []
const counts = (page, expected) => page.waitForFunction((value) => document.querySelector('.chat-find-count')?.textContent === value, expected)
const highlighted = (page) => page.evaluate(() => [...CSS.highlights.get('kando-chat-find')].map((range) => range.toString()))
const matchVisible = (page) => page.evaluate(() => {
  const range = [...CSS.highlights.get('kando-chat-find-current')][0]
  const bounds = range.getBoundingClientRect()
  for (let element = range.startContainer.parentElement; element; element = element.parentElement) {
    if (!/auto|scroll/.test(getComputedStyle(element).overflowY)) continue
    const box = element.getBoundingClientRect()
    if (bounds.top < box.top - 2 || bounds.bottom > box.bottom + 2) return false
  }
  return bounds.top >= 0 && bounds.bottom <= innerHeight
})
const requests = async (page) => JSON.parse(await page.locator('#captured-request').textContent())
try {
  const page = await browser.newPage({ viewport: { width: 1000, height: 780 } })
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(url)
  await page.locator('.chat-markdown').first().waitFor()
  const collapsed = await page.locator('.chat-fold-header[aria-expanded="false"]').count()
  assert.ok(collapsed > 0, 'fixture has collapsed content')
  const composer = page.locator('textarea.chat-input').first()
  await composer.focus()
  await page.keyboard.press('Meta+f')
  const search = page.getByRole('searchbox', { name: '搜索当前聊天' })
  await search.waitFor()
  assert.ok(await search.evaluate((element) => element === document.activeElement))
  await search.fill('缓存')
  await counts(page, '1 / 8')
  assert.deepEqual(await highlighted(page), Array(8).fill('缓存'))
  assert.equal((await requests(page)).filter((request) => request.method === 'conversations.chatItems').length, 2)
  await search.press('Enter')
  await counts(page, '2 / 8')
  await search.press('Shift+Enter')
  await counts(page, '1 / 8')
  await search.press('Shift+Enter')
  await counts(page, '8 / 8')
  await search.press('Meta+g')
  await counts(page, '1 / 8')
  await search.fill('跨节点匹配')
  await counts(page, '1 / 1')
  assert.deepEqual(await highlighted(page), ['跨节点匹配'])
  await search.fill('输出末尾唯一')
  await counts(page, '1 / 1')
  assert.ok(await matchVisible(page), 'end of nested tool output scrolled into view')
  await search.fill('子任务完整输出唯一')
  await counts(page, '1 / 1')
  assert.ok(await matchVisible(page), 'subagent result scrolled into view')
  await search.fill('最早历史唯一')
  await counts(page, '1 / 1')
  await search.fill('缓存')
  await counts(page, '1 / 8')
  await page.getByRole('button', { name: '追加流式消息' }).click()
  await counts(page, '1 / 9')
  await page.screenshot({ path: 'work/previews/chat-find-implemented.png', fullPage: true })
  await search.fill('无结果内容')
  await counts(page, '0 / 0')
  assert.ok(await page.getByRole('button', { name: '下一个结果', exact: true }).isDisabled())
  await search.fill('')
  await counts(page, '0 / 0')
  assert.ok(await page.locator('.chat-fold-header[aria-expanded="false"]').count() >= collapsed)
  await search.press('Escape')
  assert.equal(await search.count(), 0)
  assert.equal(await page.evaluate(() => CSS.highlights.has('kando-chat-find')), false)
  assert.equal(await page.evaluate(() => document.body.dataset.escaped), undefined)
  assert.ok(await composer.evaluate((element) => element === document.activeElement))
  assert.equal((await requests(page)).filter((request) => /send|interrupt/.test(request.method)).length, 0)
  // The inspector's own find shortcut remains untouched.
  await page.locator('.side-panel').evaluate((element) => { element.style.display = 'block' })
  await page.getByRole('textbox', { name: '检查器输入框' }).focus()
  await page.keyboard.press('Meta+f')
  assert.equal(await search.count(), 0)
  await page.locator('.side-panel').evaluate((element) => { element.style.display = 'none' })
  await composer.focus()
  await page.keyboard.press('Meta+f')
  await search.fill('缓存')
  await counts(page, '1 / 9')
  await page.getByRole('button', { name: '切换会话' }).click()
  await search.waitFor({ state: 'detached' })
  assert.equal(await page.evaluate(() => CSS.highlights.has('kando-chat-find')), false)
  await page.keyboard.press('Meta+f')
  assert.equal(await search.inputValue(), '')
  await search.fill('另一个会话')
  await counts(page, '1 / 1')
  // Failed history is surfaced and can be retried without duplicate pages.
  await page.goto(`${url}?fail`)
  await page.locator('.chat-markdown').first().waitFor()
  await page.keyboard.press('Meta+f')
  await search.fill('最早历史唯一')
  await page.getByRole('button', { name: '重试', exact: true }).waitFor()
  await page.getByRole('button', { name: '重试', exact: true }).click()
  await counts(page, '1 / 1')
  assert.equal((await requests(page)).filter((request) => request.method === 'conversations.chatItems').length, 3)
  // Windows/Linux Ctrl+F, task chat and group chat use the same behavior.
  const windows = await browser.newContext({ viewport: { width: 736, height: 780 } })
  await windows.addInitScript(() => Object.defineProperty(navigator, 'platform', { get: () => 'Win32' }))
  const win = await windows.newPage()
  win.on('pageerror', (error) => errors.push(error.message))
  await win.goto(`${url}?task`)
  await win.locator('.chat-markdown').first().waitFor()
  await win.keyboard.press('Control+f')
  await win.getByRole('searchbox', { name: '搜索当前聊天' }).fill('最早历史唯一')
  await counts(win, '1 / 1')
  await win.goto(`${url}?group`)
  await win.locator('.discussion-msg').first().waitFor()
  await win.keyboard.press('Control+f')
  await win.getByRole('searchbox', { name: '搜索当前聊天' }).fill('缓存')
  await counts(win, '1 / 4')
  await win.getByRole('searchbox', { name: '搜索当前聊天' }).press('Enter')
  await counts(win, '2 / 4')
  assert.ok(await win.locator('.chat-find').evaluate((element) => element.scrollWidth <= element.clientWidth))
  await win.emulateMedia({ colorScheme: 'dark' })
  await win.screenshot({ path: 'work/previews/chat-find-implemented-group-dark.png', fullPage: true })
  await windows.close()
  assert.deepEqual(errors, [])
  console.log('Verified actual chat find: Mac/Windows shortcuts, normal/task/group chat, literal/inline/hidden/full-output matches, history pagination/retry, navigation, streaming updates, focus restore, fold restore and inspector isolation.')
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
}
