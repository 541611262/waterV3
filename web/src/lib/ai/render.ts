// 小助手回答的安全渲染：先转义 HTML，再处理常用 Markdown 和系统引用
//   支持：段落、粗体、行内代码、无序 / 有序列表（列表项之间可以有空行）、表格、引用、分隔线、标题、
//        「一、二、」开头的小标题
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

/** 行内格式（输入已经转义过） */
function inline(text: string, data: TokenData): string {
  return text
    .replace(/`([^`]+)`/g, '<code>$1</code>')
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

const BULLET = /^\s*[-*•]\s+(.*)$/
const ORDERED = /^\s*\d+[.、)]\s+(.*)$/
const HEADING = /^\s*#{1,6}\s+(.*)$/
const CN_HEADING = /^\s*([一二三四五六七八九十]+、.*)$/
const HR = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/
const QUOTE = /^\s*&gt;\s?(.*)$/
const TABLE_ROW = /^\s*\|.*\|\s*$/
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/

function splitRow(line: string): string[] {
  return line
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
    .split('|')
    .map((c) => c.trim())
}

export function renderAssistantText(text: string, data: TokenData): string {
  const lines = escapeHtml(text.replace(/\r\n/g, '\n')).split('\n')
  const html: string[] = []
  let list: 'ul' | 'ol' | null = null
  const closeList = () => {
    if (list) html.push(`</${list}>`)
    list = null
  }
  const nextNonEmpty = (from: number) => {
    for (let j = from; j < lines.length; j++) if (lines[j]!.trim()) return lines[j]!
    return ''
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]!

    // 表格：表头行 + 分隔行 + 若干数据行
    if (TABLE_ROW.test(raw) && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1]!)) {
      closeList()
      const header = splitRow(raw)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && TABLE_ROW.test(lines[i]!)) rows.push(splitRow(lines[i++]!))
      i--
      html.push(
        '<div class="ai-table"><table><thead><tr>' +
          header.map((h) => `<th>${inline(h, data)}</th>`).join('') +
          '</tr></thead><tbody>' +
          rows.map((r) => '<tr>' + header.map((_, c) => `<td>${inline(r[c] ?? '', data)}</td>`).join('') + '</tr>').join('') +
          '</tbody></table></div>',
      )
      continue
    }

    const bullet = BULLET.exec(raw)
    const ordered = bullet ? null : ORDERED.exec(raw)
    if ((bullet || ordered) && !HR.test(raw)) {
      const type = bullet ? 'ul' : 'ol'
      if (list !== type) {
        closeList()
        html.push(`<${type}>`)
        list = type
      }
      html.push(`<li>${inline((bullet ?? ordered)![1]!, data)}</li>`)
      continue
    }

    // 列表项之间的空行不打断列表
    if (!raw.trim()) {
      const next = nextNonEmpty(i + 1)
      if (list && (BULLET.test(next) || ORDERED.test(next))) continue
      closeList()
      continue
    }

    closeList()
    if (HR.test(raw)) {
      html.push('<hr />')
    } else if (HEADING.test(raw)) {
      html.push(`<p class="ai-heading"><strong>${inline(HEADING.exec(raw)![1]!, data)}</strong></p>`)
    } else if (CN_HEADING.test(raw)) {
      html.push(`<p class="ai-heading"><strong>${inline(CN_HEADING.exec(raw)![1]!, data)}</strong></p>`)
    } else if (QUOTE.test(raw)) {
      const quoted: string[] = [inline(QUOTE.exec(raw)![1]!, data)]
      while (i + 1 < lines.length && QUOTE.test(lines[i + 1]!)) quoted.push(inline(QUOTE.exec(lines[++i]!)![1]!, data))
      html.push(`<blockquote>${quoted.join('<br />')}</blockquote>`)
    } else {
      html.push(`<p>${inline(raw, data)}</p>`)
    }
  }
  closeList()
  return html.join('')
}
