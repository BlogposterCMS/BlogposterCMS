export const debounce = (func, delay = 0) => {
    let timer;
    const wrapper = ((...args) => {
        if (timer !== undefined)
            clearTimeout(timer);
        timer = setTimeout(() => func(...args), delay);
    });
    wrapper.cancel = () => {
        if (timer !== undefined)
            clearTimeout(timer);
        timer = undefined;
    };
    return wrapper;
};
