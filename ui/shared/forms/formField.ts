export type FormControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

export interface FormFieldOptions {
  hint?: string;
  error?: string;
  required?: boolean;
  className?: string;
}

let formControlId = 0;

function nextControlId(): string {
  formControlId += 1;
  return `bp-form-control-${formControlId}`;
}

function appendDescription(control: FormControl, id: string): void {
  const ids = new Set((control.getAttribute('aria-describedby') || '').split(/\s+/u).filter(Boolean));
  ids.add(id);
  control.setAttribute('aria-describedby', Array.from(ids).join(' '));
}

/**
 * Builds the canonical labelled field structure used across admin surfaces.
 * Keeping label, hint and error relationships here prevents every widget from
 * inventing slightly different accessibility wiring.
 */
export function createFormField(
  labelText: string,
  control: FormControl,
  options: FormFieldOptions = {}
): HTMLDivElement {
  const field = document.createElement('div');
  field.className = ['form-field', options.className].filter(Boolean).join(' ');

  control.id ||= nextControlId();
  if (options.required) {
    control.required = true;
    control.setAttribute('aria-required', 'true');
  }

  const label = document.createElement('label');
  label.htmlFor = control.id;
  label.className = 'form-field__label';
  label.textContent = labelText;
  field.append(label, control);

  if (options.hint) {
    const hint = document.createElement('p');
    hint.id = `${control.id}-hint`;
    hint.className = 'form-field__hint';
    hint.textContent = options.hint;
    appendDescription(control, hint.id);
    field.appendChild(hint);
  }

  if (options.error) {
    const error = document.createElement('p');
    error.id = `${control.id}-error`;
    error.className = 'form-field__error';
    error.setAttribute('role', 'alert');
    error.textContent = options.error;
    appendDescription(control, error.id);
    control.setAttribute('aria-invalid', 'true');
    field.dataset.fieldState = 'error';
    field.appendChild(error);
  }

  return field;
}

export function createFormChoice(labelText: string, control: HTMLInputElement): HTMLLabelElement {
  const label = document.createElement('label');
  label.className = 'form-choice';
  const text = document.createElement('span');
  text.textContent = labelText;
  label.append(control, text);
  return label;
}

export function createFormSwitch(labelText: string, control: HTMLInputElement): HTMLLabelElement {
  control.type = 'checkbox';
  const label = document.createElement('label');
  label.className = 'form-switch';
  const track = document.createElement('span');
  track.className = 'form-switch__track';
  track.setAttribute('aria-hidden', 'true');
  const text = document.createElement('span');
  text.className = 'form-switch__label';
  text.textContent = labelText;
  label.append(control, track, text);
  return label;
}

export function createFormActions(...buttons: HTMLButtonElement[]): HTMLDivElement {
  const actions = document.createElement('div');
  actions.className = 'form-actions';
  actions.append(...buttons);
  return actions;
}
