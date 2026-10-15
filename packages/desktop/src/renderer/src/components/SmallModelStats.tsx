import type { SmallModelStats as Stats } from '@antumi/protocol'
import { coverage, dollars, SMALL_MODEL_LABELS } from '../model-cost-format'
import { compact } from '../stat-format'

export function SmallModelStats({ stats }: { stats: Stats }) {
  return <section className="dashboard-panel" aria-labelledby="dashboard-small-models">
    <header className="dashboard-panel-header">
      <h3 id="dashboard-small-models">小模型用量</h3>
      <span className="dashboard-panel-note">按 API 标价折算</span>
    </header>
    <p className="dashboard-panel-note">{coverage(stats.current)}。约省逐次计算，最低为零；未提供金额的记录不计入金额合计。</p>
    <table className="dashboard-models">
      <thead><tr><th scope="col">用途</th><th scope="col">次数</th><th scope="col">token</th><th scope="col">花费</th><th scope="col">约省</th></tr></thead>
      <tbody>{stats.kinds.map((row) => <tr key={row.kind} title={coverage(row)}>
        <th scope="row">{SMALL_MODEL_LABELS[row.kind]}</th><td>{row.count}</td><td>{row.measured ? compact(row.tokens) : row.count ? '未提供' : '—'}</td><td>{dollars(row.costUsd)}</td><td>{dollars(row.savedUsd)}</td>
      </tr>)}</tbody>
    </table>
    <p className="dashboard-panel-note">翻译只算模型差价；提交说明和小助手另计避免读取主上下文的成本。未报告的 token 与金额显示为未提供；当前 Cursor 小助手不报告回合用量。</p>
  </section>
}
