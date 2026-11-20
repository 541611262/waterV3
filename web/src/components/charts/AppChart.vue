<script setup lang="ts">
// ECharts 按需引入（柱状图、折线图、饼图），跟随深色模式
import { useDark } from '@vueuse/core'
import { BarChart, LineChart, PieChart } from 'echarts/charts'
import { GridComponent, LegendComponent, TooltipComponent } from 'echarts/components'
import { use, type ComposeOption } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import type { BarSeriesOption, LineSeriesOption, PieSeriesOption } from 'echarts/charts'
import type { GridComponentOption, LegendComponentOption, TooltipComponentOption } from 'echarts/components'
import { computed } from 'vue'
import VChart from 'vue-echarts'

use([BarChart, LineChart, PieChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

export type ChartOption = ComposeOption<
  BarSeriesOption | LineSeriesOption | PieSeriesOption | GridComponentOption | LegendComponentOption | TooltipComponentOption
>

const props = defineProps<{ option: ChartOption; height?: string }>()
const isDark = useDark({ storageKey: 'v4.theme', initialValue: 'light' })

const themed = computed<ChartOption>(() => {
  const text = isDark.value ? '#9ca3af' : '#64748b'
  const line = isDark.value ? '#1f2937' : '#eef2f7'
  return {
    color: ['#2563eb', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#64748b'],
    textStyle: { fontFamily: 'inherit', color: text },
    grid: { left: 8, right: 8, top: 36, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: isDark.value ? '#111827' : '#fff',
      borderColor: isDark.value ? '#1f2937' : '#e7ebf2',
      textStyle: { color: isDark.value ? '#e5e7eb' : '#0f172a' },
    },
    legend: { top: 0, right: 0, icon: 'roundRect', itemWidth: 10, itemHeight: 10, textStyle: { color: text } },
    ...props.option,
    xAxis: Array.isArray(props.option.xAxis)
      ? props.option.xAxis
      : props.option.xAxis && {
          axisLine: { lineStyle: { color: line } },
          axisTick: { show: false },
          axisLabel: { color: text },
          ...props.option.xAxis,
        },
    yAxis: Array.isArray(props.option.yAxis)
      ? props.option.yAxis.map((y) => ({ splitLine: { lineStyle: { color: line } }, axisLabel: { color: text }, ...y }))
      : props.option.yAxis && { splitLine: { lineStyle: { color: line } }, axisLabel: { color: text }, ...props.option.yAxis },
  } as ChartOption
})
</script>

<template>
  <v-chart :option="themed" autoresize :style="{ height: height ?? '260px', width: '100%' }" />
</template>
