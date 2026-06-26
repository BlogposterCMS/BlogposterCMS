export const textHistory = [];
export const redoHistory = [];
export const MAX_HISTORY = 50;

export function pushCommand(command) {
  textHistory.push(command);
  if (textHistory.length > MAX_HISTORY) textHistory.shift();
  redoHistory.length = 0;
}

export function undoTextCommand() {
  const cmd = textHistory.pop();
  if (!cmd) return false;
  redoHistory.push(cmd);
  cmd.undo();
  return true;
}

export function redoTextCommand() {
  const cmd = redoHistory.pop();
  if (!cmd) return false;
  textHistory.push(cmd);
  cmd.execute();
  return true;
}

export function recordChange(el, prevHtml, updateAndDispatch) {
  const newHtml = el.outerHTML;
  pushCommand({
    execute() {
      el.outerHTML = newHtml;
      el = document.getElementById(el.id) || el;
      updateAndDispatch(el);
    },
    undo() {
      el.outerHTML = prevHtml;
      el = document.getElementById(el.id) || el;
      updateAndDispatch(el);
    }
  });
}
