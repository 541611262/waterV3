import { describe, expect, it } from 'vitest'
import { collectTokenIds, renderAssistantText } from './render'

const data = { phones: new Map([['d1', '13800001111']]), clients: new Map([['d1', 'c1']]) }

describe('renderAssistantText', () => {
  it('转义 HTML，防止注入', () => {
    expect(renderAssistantText('<img src=x onerror=alert(1)>', data)).toBe('<p>&lt;img src=x onerror=alert(1)&gt;</p>')
  })

  it('还原电话、记录链接，处理粗体和列表', () => {
    const html = renderAssistantText('**今天**联系：\n- [[rec:d1|华南精密]] [[tel:d1]]\n- 未知 [[tel:x]]', data)
    expect(html).toContain('<strong>今天</strong>')
    expect(html).toContain('<ul><li><a href="#/customers/c1" class="ai-rec">华南精密</a> <a href="tel:13800001111" class="ai-tel">13800001111</a></li>')
    expect(html).toContain('（电话未知）')
  })

  it('链接文字中的 HTML 也被转义', () => {
    expect(renderAssistantText('[[rec:d1|<b>x</b>]]', data)).toContain('&lt;b&gt;x&lt;/b&gt;')
  })

  it('收集引用 ID', () => {
    expect(collectTokenIds('[[tel:a]] [[rec:b|文字]] [[tel:a]]')).toEqual(['a', 'b'])
  })
})
