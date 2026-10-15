import { useState } from 'react'
import { openTodoCount, todoGroupDone, type RpcMethod, type RpcParams, type TodoGroup, type TodoItem, type TodoOwner } from '@antumi/protocol'
import { addQuote } from '../chat-quotes'
import { receiveTodos, useConversationTodos } from '../conversation-todos'
import { perform } from '../core-store'
import { TitleEditor } from './TitleEditor'

const OWNER_LABEL: Record<TodoOwner, string> = { user: '需要你', agent: 'Agent 可做' }

type TodoMethod = Extract<RpcMethod, 'todos.add' | 'todos.check' | 'todos.edit' | 'todos.remove'>

// Every change answers with the list as it now stands, shown at once rather than on the notice.
async function change<M extends TodoMethod>(method: M, params: RpcParams<M>): Promise<boolean> {
  const groups = await perform((rpc) => rpc.call<M>(method, params))
  if (groups) receiveTodos(params.id, groups)
  return groups !== null
}

// The inspector's to-dos: what the agent wrote down for later, and what the user added. A group's
// box ticks every item; one finished goes under 已完成.
export function TodoPanel({ conversationId }: { conversationId: string }) {
  const groups = useConversationTodos(conversationId)
  const [adding, setAdding] = useState(false)
  const open = groups.filter((group) => !todoGroupDone(group))
  const finished = groups.filter(todoGroupDone)
  const left = openTodoCount(groups)
  return (
    <div className="todo-panel">
      <div className="todo-panel-head">
        <span>{left > 0 ? `${left} 项未完成 · ${open.length} 组` : groups.length > 0 ? '都做完了' : '待办'}</span>
        <button type="button" className="todo-link" onClick={() => setAdding(true)}>＋ 添加</button>
      </div>
      {adding && <NewGroup conversationId={conversationId} onDone={() => setAdding(false)} />}
      {groups.length === 0 && !adding && (
        <p className="todo-empty">还没有待办。Agent 在回复里列出要你之后处理的事（上线前要做的、要和人对齐的、要你去验证的）时会记在这里，你也可以自己添加。</p>
      )}
      {open.map((group) => <Group key={group.id} conversationId={conversationId} group={group} />)}
      {finished.length > 0 && (
        <details className="todo-finished">
          <summary>已完成 {finished.length} 组</summary>
          {finished.map((group) => <Group key={group.id} conversationId={conversationId} group={group} />)}
        </details>
      )}
    </div>
  )
}

function Group({ conversationId, group }: { conversationId: string; group: TodoGroup }) {
  const [renaming, setRenaming] = useState(false)
  const [adding, setAdding] = useState(false)
  const done = group.items.filter((item) => item.done).length
  const all = done === group.items.length
  const remove = () => {
    if (window.confirm(`删除「${group.title}」这一组待办？`)) void change('todos.remove', { id: conversationId, groupId: group.id })
  }
  return (
    <section className="todo-group" aria-label={group.title} data-done={all || undefined}>
      <div className="todo-group-head">
        <input
          type="checkbox"
          aria-label={all ? `把「${group.title}」整组改回未完成` : `把「${group.title}」整组标成完成`}
          checked={all}
          ref={(box) => { if (box) box.indeterminate = done > 0 && !all }}
          onChange={() => void change('todos.check', { id: conversationId, groupId: group.id, done: !all })}
        />
        <span className="todo-group-title">
          {renaming
            ? <TitleEditor title={group.title} label="这一组的标题" maxLength={120} onSave={(title) => void change('todos.edit', { id: conversationId, groupId: group.id, text: title })} onDone={() => setRenaming(false)} />
            : <button type="button" className="todo-text-button" title="点击修改标题" onClick={() => setRenaming(true)}>{group.title}</button>}
          {group.note && <span className="todo-group-note">{group.note}</span>}
        </span>
        <span className="todo-group-count">{done}/{group.items.length}</span>
        <span className="todo-actions">
          <button type="button" onClick={() => setAdding(true)}>添加一项</button>
          <button type="button" onClick={remove}>删除</button>
        </span>
      </div>
      <ul className="todo-items">
        {group.items.map((item) => <Item key={item.id} conversationId={conversationId} groupId={group.id} item={item} />)}
        {adding && (
          <li className="todo-item">
            <TitleEditor title="" label="新的一项" maxLength={500} onSave={(text) => void change('todos.add', { id: conversationId, groupId: group.id, title: group.title, items: [{ text, owner: 'user' }] })} onDone={() => setAdding(false)} />
          </li>
        )}
      </ul>
    </section>
  )
}

function Item({ conversationId, groupId, item }: { conversationId: string; groupId: string; item: TodoItem }) {
  const [editing, setEditing] = useState(false)
  return (
    <li className="todo-item" data-done={item.done || undefined}>
      <input
        type="checkbox"
        aria-label={item.done ? '改回未完成' : '标成完成'}
        checked={item.done}
        onChange={() => void change('todos.check', { id: conversationId, groupId, itemId: item.id, done: !item.done })}
      />
      {editing
        ? <TitleEditor title={item.text} label="这一项" maxLength={500} onSave={(text) => void change('todos.edit', { id: conversationId, groupId, itemId: item.id, text })} onDone={() => setEditing(false)} />
        : <span className="todo-item-text">{item.text}</span>}
      <span className="todo-owner" data-owner={item.owner}>{OWNER_LABEL[item.owner]}</span>
      {!editing && (
        <span className="todo-actions">
          {!item.done && (
            <button type="button" data-tooltip="放进输入框，让 Agent 去做" onClick={() => addQuote(conversationId, null, item.text, '请处理这一项待办，做完后在待办里把它勾掉。')}>
              交给 Agent
            </button>
          )}
          <button type="button" onClick={() => setEditing(true)}>编辑</button>
          <button type="button" onClick={() => void change('todos.remove', { id: conversationId, groupId, itemId: item.id })}>删除</button>
        </span>
      )}
    </li>
  )
}

// A group the user writes: a heading, then one item a line.
function NewGroup({ conversationId, onDone }: { conversationId: string; onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [lines, setLines] = useState('')
  const items = lines.split('\n').map((line) => line.trim()).filter(Boolean).slice(0, 30)
  const ready = title.trim() !== '' && items.length > 0
  const submit = async () => {
    if (!ready) return
    const added = await change('todos.add', { id: conversationId, title: title.trim(), items: items.map((text) => ({ text: text.slice(0, 500), owner: 'user' as const })) })
    if (added) onDone()
  }
  return (
    <form className="todo-new" onSubmit={(event) => { event.preventDefault(); void submit() }}>
      <input className="input" aria-label="这一组的标题" placeholder="标题，如「上线前」" value={title} maxLength={120} autoFocus onChange={(event) => setTitle(event.target.value)} />
      <textarea
        className="input"
        aria-label="每一项"
        placeholder="每行一项"
        rows={3}
        value={lines}
        onChange={(event) => setLines(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            void submit()
          } else if (event.key === 'Escape') onDone()
        }}
      />
      <div className="todo-new-actions">
        <button type="button" className="button ghost" onClick={onDone}>取消</button>
        <button type="submit" className="button primary" disabled={!ready}>添加</button>
      </div>
    </form>
  )
}
