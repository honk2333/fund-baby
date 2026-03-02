'use client';

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { TooltipComponent, GridComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([TooltipComponent, GridComponent, LineChart, CanvasRenderer]);

/**
 * 基金分时估值图
 * @param {{ data: { time: string, value: number, growth: string }[] }} props
 */
export default function FundIntradayChart({ data }) {
  const chartRef = useRef(null);
  const instanceRef = useRef(null);

  useEffect(() => {
    if (!Array.isArray(data) || data.length === 0) return;
    if (!chartRef.current) return;

    if (instanceRef.current) {
      instanceRef.current.dispose();
      instanceRef.current = null;
    }

    const el = chartRef.current;
    const chart = echarts.init(el);
    instanceRef.current = chart;

    const values = data.map(d => d.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    
    // 简单的颜色判断：如果最新值 > 最早值，红色；否则绿色
    const startVal = data[0].value;
    const endVal = data[data.length - 1].value;
    const color = endVal >= startVal ? '#ff4d4f' : '#52c41a';

    const option = {
      animation: false,
      tooltip: {
        trigger: 'axis',
        formatter(params) {
            const p = params[0];
            if (!p) return '';
            const item = data[p.dataIndex];
            return `时间: ${item.time}<br/>估值: ${item.value}<br/>涨幅: ${item.growth}%`;
        }
      },
      grid: {
        left: 5,
        right: 5,
        top: 10,
        bottom: 20,
        containLabel: true,
      },
      xAxis: {
        type: 'category',
        data: data.map(d => d.time),
        boundaryGap: false,
        axisLine: { show: true, lineStyle: { color: '#e5e5e5' } },
        axisTick: { show: false },
        axisLabel: {
            interval: 'auto', 
            color: '#999',
            fontSize: 10
        },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        scale: true,
        min: (value) => Math.floor(value.min * 1000) / 1000,
        max: (value) => Math.ceil(value.max * 1000) / 1000,
        axisLine: { show: true, lineStyle: { color: '#e5e5e5' } },
        axisTick: { show: false },
        axisLabel: {
            show: true,
            color: '#999',
            fontSize: 10,
            formatter: (val) => val.toFixed(3)
        },
        splitLine: {
            show: true,
            lineStyle: { color: 'rgba(0,0,0,0.05)', type: 'dashed' }
        },
      },
      series: [
        {
          type: 'line',
          symbol: 'none',
          smooth: true,
          lineStyle: {
            width: 1.5,
            color: color,
          },
          areaStyle: {
            opacity: 0.1,
            color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [
              { offset: 0, color: color },
              { offset: 1, color: 'rgba(255, 255, 255, 0)' }
            ])
          },
          data: values,
        },
      ],
    };

    chart.setOption(option);
    
    const handleResize = () => chart.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      if (instanceRef.current) {
        instanceRef.current.dispose();
      }
    };
  }, [data]);

  if (!Array.isArray(data) || data.length === 0) return null;

  return (
    <div
      ref={chartRef}
      style={{
        width: '100%',
        height: 180,
      }}
    />
  );
}