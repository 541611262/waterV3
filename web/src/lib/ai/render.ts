// 小助手回答的安全渲染：先转义 HTML，再处理少量 Markdown（粗体、列表、标题、换行）和系统引用
//   [[tel:设备ID]]       → 可拨打的真实号码（号码在本地还原，从未发给 AI）
//   [[rec:设备ID|文字]]  → 跳转到该设备所属客户的链接

export interface TokenData {
  phones: Map<string, string>
  clients: Map<string, string>
}

const ENTITIES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ENTITIES[c]!)
}

export function collectTokenIds(text: string): string[] {
  const ids = new Set<string>()
  for (const m of text.matchAll(/\[\[(?:tel|rec):([^\]|]+)(?:\|[^\]]*)?\]\]/g)) ids.add(m[1]!)
  return [...ids]
}

function inline(text: string, data: TokenData): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\[\[tel:([^\]]+)\]\]/g, (_, id: string) => {
      const phone = data.phones.get(id)
      if (!phone) return '（电话未知）'
      const dial = phone.match(/\+?\d[\d-]{5,}\d/)?.[0]?.replace(/-/g, '')
      return dial ? `<a href="tel:${dial}" class="ai-tel">${escapeHtml(phone)}</a>` : escapeHtml(phone)
    })
    .replace(/\[\[rec:([^\]|]+)\|([^\]]*)\]\]/g, (_, id: string, label: string) => {
      const client = data.clients.get(id)
      return client ? `<a href="#/customers/${encodeURIComponent(client)}" class="ai-rec">${label}</a>` : label
    })
}

export function renderAssistantText(text: string, data: TokenData): string {
  const html: string[] = []
  let list: 'ul' | 'ol' | null = null
  const closeList = () => {
    if (list) html.push(`</${list}>`)
    list = null
  }
  for (const raw of escapeHtml(text).split('\n')) {
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(raw)
    const ordered = /^\s*\d+[.、)]\s+(.*)$/.exec(raw)
    const heading = /^\s*#{1,4}\s+(.*)$/.exec(raw)
    if (bullet || ordered) {
      const type = bullet ? 'ul' : 'ol'
      if (list !== type) {
        closeList()
        html.push(`<${type}>`)
        list = type
      }
      html.push(`<li>${inline((bullet ?? ordered)![1]!, data)}</li>`)
    } else {
      closeList()
      if (heading) html.push(`<p><strong>${inline(heading[1]!, data)}</strong></p>`)
      else if (raw.trim()) html.push(`<p>${inline(raw, data)}</p>`)
    }
  }
  closeList()
  return html.join('')
}
