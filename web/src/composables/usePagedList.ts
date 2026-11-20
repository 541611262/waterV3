// 服务端分页列表的通用状态：页码、每页条数、排序、加载中、错误
import { ElMessage } from 'element-plus'
import { ref, shallowRef, watch, type WatchSource } from 'vue'
import { describeError } from '@/api/cloud'
import type { Sort } from '@/api/data'
import type { Page } from '@/api/types'

export function usePagedList<T>(
  fetcher: (q: { page: number; pageSize: number; sort: Sort | null }) => Promise<Page<T>>,
  options: { pageSize?: number; sort?: Sort | null; watchSources?: WatchSource[] } = {},
) {
  const rows = shallowRef<T[]>([])
  const total = ref(0)
  const page = ref(1)
  const pageSize = ref(options.pageSize ?? 20)
  const sort = ref<Sort | null>(options.sort ?? null)
  const loading = ref(false)
  let seq = 0

  async function load() {
    const current = ++seq
    loading.value = true
    try {
      const result = await fetcher({ page: page.value, pageSize: pageSize.value, sort: sort.value })
      if (current !== seq) return // 已有更新的请求，丢弃过期结果
      rows.value = result.rows
      total.value = result.total
    } catch (error) {
      if (current === seq) ElMessage.error(describeError(error))
    } finally {
      if (current === seq) loading.value = false
    }
  }

  /** 筛选条件变化时回到第一页 */
  function reload() {
    if (page.value !== 1) page.value = 1
    else void load()
  }

  /** el-table 的 sort-change 事件 */
  function onSortChange({ prop, order }: { prop: string | null; order: 'ascending' | 'descending' | null }) {
    sort.value = prop && order ? { field: prop, order: order === 'ascending' ? 'asc' : 'desc' } : (options.sort ?? null)
    reload()
  }

  watch([page, pageSize], () => void load())
  if (options.watchSources?.length) watch(options.watchSources, reload, { deep: true })

  return { rows, total, page, pageSize, sort, loading, load, reload, onSortChange }
}
