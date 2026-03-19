import { useCallback } from 'react';

/**
 * Returns an onKeyDown handler for Dialog/Modal containers.
 * Pressing Enter triggers `onSubmit` unless:
 * - Focus is on a textarea, select, or an open popover/dropdown
 * - `disabled` is true (prevents double-submit during loading)
 */
export function useEnterSubmit(onSubmit: () => void, disabled?: boolean) {
  return useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key !== 'Enter') return;

      const target = e.target as HTMLElement;
      const tag = target.tagName.toLowerCase();

      // Don't intercept Enter on textarea, select, or elements inside open dropdowns/popovers
      if (
        tag === 'textarea' ||
        tag === 'select' ||
        target.getAttribute('role') === 'option' ||
        target.getAttribute('role') === 'listbox' ||
        target.getAttribute('role') === 'combobox' ||
        target.closest('[data-radix-popper-content-wrapper]') ||
        target.closest('[role="listbox"]')
      ) {
        return;
      }

      if (disabled) return;

      e.preventDefault();
      onSubmit();
    },
    [onSubmit, disabled],
  );
}
