export type DebouncedFunction<Args extends unknown[]> = ((...args: Args) => void) & {
  cancel: () => void;
};

export const debounce = <Args extends unknown[]>(
  func: (...args: Args) => void,
  delay = 0
): DebouncedFunction<Args> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const wrapper = ((...args: Args) => {
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => func(...args), delay);
  }) as DebouncedFunction<Args>;
  wrapper.cancel = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
  };
  return wrapper;
};
