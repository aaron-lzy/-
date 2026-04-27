import { useEffect, useState } from 'react';

export interface NumberFieldProps {
  label: string;
  value: number | undefined;
  onCommit: (value: number | undefined) => void;
  placeholder?: string;
  /** 是否允许空（true 时清空提交 undefined，false 时清空提交 0） */
  allowEmpty?: boolean;
  integer?: boolean;
  min?: number;
  max?: number;
  suffix?: string;
  error?: string;
  disabled?: boolean;
}

/**
 * 受控数字输入框。用本地字符串状态接受输入过程中的非数值字符（如 "-"、"."、空串），
 * 只在 onBlur 时提交给 store，从而满足 R11 AC 1 的"提交时校验"语义。
 */
export function NumberField(props: NumberFieldProps) {
  const {
    label,
    value,
    onCommit,
    placeholder,
    allowEmpty = true,
    integer = false,
    min,
    max,
    suffix,
    error,
    disabled,
  } = props;

  const [draft, setDraft] = useState<string>(value === undefined ? '' : String(value));

  // 外部 value 变化时同步到 draft（例如 hydrateFromStorage）
  useEffect(() => {
    setDraft(value === undefined ? '' : String(value));
  }, [value]);

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed === '') {
      onCommit(allowEmpty ? undefined : 0);
      return;
    }
    const parsed = integer ? Number.parseInt(trimmed, 10) : Number.parseFloat(trimmed);
    if (!Number.isFinite(parsed)) {
      // 不合法，不提交；保留 draft 让用户看到自己的输入
      return;
    }
    if (min !== undefined && parsed < min) return;
    if (max !== undefined && parsed > max) return;
    onCommit(parsed);
  };

  return (
    <label className="number-field">
      <span className="number-field__label">{label}</span>
      <span className="number-field__input-wrap">
        <input
          type="text"
          inputMode={integer ? 'numeric' : 'decimal'}
          value={draft}
          placeholder={placeholder}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          }}
          disabled={disabled}
          className={error ? 'number-field__input number-field__input--error' : 'number-field__input'}
        />
        {suffix ? <span className="number-field__suffix">{suffix}</span> : null}
      </span>
      {error ? <span className="number-field__error">{error}</span> : null}
    </label>
  );
}
