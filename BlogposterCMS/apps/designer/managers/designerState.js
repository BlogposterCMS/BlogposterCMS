const stored = parseFloat(localStorage.getItem('builder.defaultOpacity'));
export const designerState = {
  defaultOpacity: Number.isFinite(stored) ? stored : 1
};
