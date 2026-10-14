import { readFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { chromium } from '../../packages/desktop/node_modules/playwright-core/index.mjs'

const bundle = await build({ entryPoints: ['work/previews/discussion-requirements-implementation.tsx'], bundle: true,
  write: false, jsx: 'automatic', platform: 'browser', nodePaths: [`${process.cwd()}/packages/desktop/node_modules`],
  loader: { '.svg': 'dataurl' } })
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
try {
  const page = await browser.newPage({ viewport: { width: 1152, height: 850 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  const url = `http://127.0.0.1:${server.address().port}`
  await page.goto(url)
  const field = page.getByRole('textbox', { name: '讨论要求（可选）', exact: true })
  await field.waitFor()
  const initial = await field.inputValue()
  if (!initial.includes('600 字') || initial.includes('标题或署名')) throw new Error('incorrect defaults')
  for (const label of ['方案对比', '深入分析', '简洁讨论']) {
    await page.getByRole('button', { name: /^使用预设：/ }).click()
    await page.getByRole('menuitemradio', { name: new RegExp(label) }).click()
    const text = await field.inputValue()
    if (!text || text.includes('不要写标题或署名')) throw new Error(`incorrect preset: ${label}`)
    if (label === '深入分析' && text.includes('600 字')) throw new Error('deep preset kept a word limit')
    if (label === '方案对比' && !text.includes('收益、成本、风险')) throw new Error('compare preset not applied')
  }
  await page.screenshot({ path: 'work/previews/discussion-requirements-implemented.png', fullPage: true })
  await field.fill('请使用标题和表格，不限制字数。')
  await page.getByRole('textbox', { name: '主题', exact: true }).fill('比较数据库缓存方案')
  await page.getByRole('button', { name: '开始讨论', exact: true }).click()
  await page.waitForFunction(() => document.getElementById('captured-request').textContent.includes('请使用标题和表格'))
  const request = JSON.parse(await page.locator('#captured-request').textContent())
  if (request.requirements !== '请使用标题和表格，不限制字数。') throw new Error('custom text not submitted')
  await page.goto(url)
  await field.fill('')
  await page.getByRole('textbox', { name: '主题', exact: true }).fill('不加额外要求')
  await page.getByRole('button', { name: '开始讨论', exact: true }).click()
  await page.waitForFunction(() => document.getElementById('captured-request').textContent.length > 0)
  if (JSON.parse(await page.locator('#captured-request').textContent()).requirements !== '') throw new Error('empty text not submitted')
  for (const from of ['empty', 'custom']) {
    await page.goto(`${url}?from=${from}`)
    const inherited = await field.inputValue()
    if (inherited !== (from === 'empty' ? '' : '请保留我的自定义规则。')) throw new Error('inherited requirements lost')
  }
  await page.goto(`${url}?legacy`)
  if (await field.count()) throw new Error('unsupported editor shown for older core')
  await page.getByRole('textbox', { name: '主题', exact: true }).fill('旧 core 兼容')
  await page.getByRole('button', { name: '开始讨论', exact: true }).click()
  await page.waitForFunction(() => document.getElementById('captured-request').textContent.length > 0)
  if ('requirements' in JSON.parse(await page.locator('#captured-request').textContent())) throw new Error('sent unsupported requirements')
  await page.goto(url)
  for (const width of [736, 1152]) {
    await page.setViewportSize({ width, height: 850 })
    await page.getByRole('button', { name: /^使用预设：/ }).click()
    const fits = await page.getByRole('menu', { name: '使用预设' }).evaluate((element) => {
      const box = element.getBoundingClientRect()
      return box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight
    })
    if (!fits) throw new Error(`preset menu overflow at ${width}`)
    await page.keyboard.press('Escape')
  }
  await page.emulateMedia({ colorScheme: 'dark' })
  await page.screenshot({ path: 'work/previews/discussion-requirements-implemented-dark.png', fullPage: true })
  if (errors.length) throw new Error(errors.join('; '))
  console.log('Actual new-discussion form verified: defaults, all presets, custom/empty submission, inherited settings, older-core compatibility, menu layout and dark theme.')
} finally {
  await browser.close()
  await new Promise((resolve) => server.close(resolve))
}
