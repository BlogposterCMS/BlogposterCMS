/** @jest-environment jsdom */
import { chartOptions } from '../ui/shared/charts/chart';
test('rejects non-finite and mismatched data before loading third-party code', () => {
  expect(() => chartOptions({ labels: ['a'], series: [{ name: 'x', values: [NaN] }] })).toThrow('CHART_DATA_INVALID');
  expect(() => chartOptions({ labels: ['a'], series: [{ name: 'x', values: [] }] })).toThrow('CHART_DATA_INVALID');
});
test('constructs a bounded data-only chart with canvas tooltips and optional interaction', () => {
  const result = chartOptions({ labels: ['<img src=x>'], series: [{ name: 'Events', values: [4] }], zoom: true }) as any;
  expect(result.tooltip.renderMode).toBe('richText');
  expect(result.dataZoom).toHaveLength(2);
  expect(result.series[0].type).toBe('line');
  expect(result.series[0].data).toEqual([4]);
  expect(result.xAxis.data).toEqual(['<img src=x>']);
});
