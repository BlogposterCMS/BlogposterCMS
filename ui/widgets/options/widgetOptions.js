import { applyWidgetDomOptions } from './widgetOptionDom.js';
import { computePercentUpdate, getColumnCount, metricsReady, refreshGridMetrics, schedulePercentReplay } from './widgetPercentSizing.js';
export function applyWidgetOptions(wrapper, opts = {}, grid) {
    if (!wrapper || !opts)
        return;
    const debug = Boolean(opts.debug ?? grid?.options?.debug);
    if (debug) {
        console.debug('[widgetOptions] opts', opts);
    }
    const { wPercent, hPercent } = applyWidgetDomOptions(wrapper, opts);
    if (!grid)
        return;
    const metrics = refreshGridMetrics(grid);
    const update = computePercentUpdate(grid, wPercent, hPercent);
    if (debug) {
        console.debug('[widgetOptions] percent update', {
            columns: getColumnCount(grid),
            update,
            wPercent,
            hPercent,
            metrics
        });
    }
    const hasPercentUpdate = update.w != null || update.h != null;
    if (hasPercentUpdate) {
        grid.update(wrapper, update);
        if (!metricsReady(metrics)) {
            schedulePercentReplay(grid, wrapper);
        }
    }
    else {
        grid.update(wrapper, {});
    }
}
