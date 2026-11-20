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

  // 用户反馈的真实回答片段：以前表格、引用、分隔线都按原样显示
  it('表格渲染为 HTML 表格，单元格内容转义', () => {
    const html = renderAssistantText(
      '1. 缺少联系人或电话（3 条）\n| 客户 | 位置 |\n|------|------|\n| （未命名客户） | — |\n| 蓝海科技<script> | 新租宿舍 |\n2. 缺少任何日期',
      data,
    )
    expect(html).toContain('<div class="ai-table"><table><thead><tr><th>客户</th><th>位置</th></tr></thead>')
    expect(html).toContain('<td>蓝海科技&lt;script&gt;</td><td>新租宿舍</td>')
    expect(html).not.toContain('|------|')
    expect(html).not.toContain('<script>')
  })

  it('表格缺少的单元格补空，多余的忽略', () => {
    const html = renderAssistantText('| 客户 | 区域 | 备注 |\n|---|---|---|\n| 粤海物流园 | 东莞 |\n| A | B | C | D |', data)
    expect(html).toContain('<td>粤海物流园</td><td>东莞</td><td></td>')
    expect(html).toContain('<td>A</td><td>B</td><td>C</td></tr>')
  })

  it('引用块、分隔线、「一、」小标题', () => {
    const html = renderAssistantText('一、本周内到期\n> 蓝海科技这条今天已到期\n> 建议今天联系\n---\n特别提醒：', data)
    expect(html).toContain('<p class="ai-heading"><strong>一、本周内到期</strong></p>')
    expect(html).toContain('<blockquote>蓝海科技这条今天已到期<br />建议今天联系</blockquote>')
    expect(html).toContain('<hr />')
  })

  it('列表项之间的空行不会把列表拆开', () => {
    const html = renderAssistantText('提醒：\n\n* 生产车间已超期\n\n* 品控实验室需验水\n\n需要我帮你安排吗？', data)
    expect(html).toBe('<p>提醒：</p><ul><li>生产车间已超期</li><li>品控实验室需验水</li></ul><p>需要我帮你安排吗？</p>')
  })

  it('Markdown 标题和行内代码', () => {
    const html = renderAssistantText('## 数据质量问题汇总\n型号 `CY-2H`', data)
    expect(html).toContain('<p class="ai-heading"><strong>数据质量问题汇总</strong></p>')
    expect(html).toContain('<code>CY-2H</code>')
  })
})
