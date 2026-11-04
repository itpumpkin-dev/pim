import { ComboBox, ComboBoxItem } from '@ui5/webcomponents-react';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';

import type { Ui5ValueState } from '@/components/fiori-form';

/**
 * A UI5 `ComboBox` driven by a server-side search — the shared core of the
 * marketplace category pickers (Shopee/Lazada/TikTok/WooCommerce) and
 * PimBrandPicker. The caller owns the fetch (debounce + endpoint); this only
 * maps the "typed text / result list / committed value" contract onto UI5:
 *
 *  - `filter="None"`: the results are already filtered by the server, so the
 *    ComboBox must not filter them a second time on the client.
 *  - the selection is only reported on the UI5 `change` event (item click,
 *    Enter, blur) — not while typing — so a typeahead match never commits on
 *    its own (PimBrandPicker's onChange persists immediately).
 *  - clearing the text (clear icon or deleting everything) and committing
 *    reports `null`; committing free text that matches no item reverts the
 *    field to the current value's label.
 */
export function AsyncSearchComboBox<T>({
    value,
    onChange,
    results,
    loading,
    getKey,
    getLabel,
    onQueryChange,
    onActivate,
    placeholder,
    disabled,
    valueState,
    style,
    className,
}: {
    value: T | null;
    onChange: (next: T | null) => void;
    results: T[];
    loading: boolean;
    getKey: (item: T) => string | number;
    getLabel: (item: T) => string;
    /** called with what the user typed (not with the label written back after a selection) */
    onQueryChange: (query: string) => void;
    /** called the first time the field gets focus — lets a caller defer its first fetch until then */
    onActivate?: () => void;
    placeholder?: string;
    disabled?: boolean;
    valueState?: Ui5ValueState;
    style?: CSSProperties;
    className?: string;
}) {
    const valueKey = value ? String(getKey(value)) : undefined;
    const valueLabel = value ? getLabel(value) : '';
    const [text, setText] = useState(valueLabel);

    // ค่าเปลี่ยนจากข้างนอก (เลือกเสร็จ/บันทึกเสร็จ/สลับแถว) → เขียน label กลับลงช่อง
    useEffect(() => {
        setText(valueLabel);
    }, [valueKey, valueLabel]);

    // ให้ item ของค่าปัจจุบันอยู่ในลิสต์เสมอ — ไม่งั้น ComboBox หา item ที่ตรงกับ
    // selectedValue ไม่เจอตอนผลค้นหายังว่าง (เช่นแถวที่ยังไม่มีใครค้นหาเลย)
    const items = useMemo(() => {
        if (!value || results.some((r) => String(getKey(r)) === valueKey)) return results;
        return [value, ...results];
    }, [value, valueKey, results, getKey]);

    const commit = (selectedKey: string | undefined, currentText: string) => {
        const picked = selectedKey !== undefined ? items.find((r) => String(getKey(r)) === selectedKey) : undefined;

        if (picked && getLabel(picked) === currentText) {
            if (String(getKey(picked)) !== valueKey) onChange(picked);
            return;
        }

        if (currentText.trim() === '') {
            if (value) onChange(null);
            return;
        }

        // ข้อความอิสระที่ไม่ตรงกับตัวเลือกไหนเลย — คืนค่าเดิม
        setText(valueLabel);
    };

    return (
        <ComboBox
            style={{ width: '100%', ...style }}
            className={className}
            filter="None"
            noTypeahead
            showClearIcon
            loading={loading}
            disabled={disabled}
            placeholder={placeholder}
            valueState={valueState}
            value={text}
            selectedValue={valueKey}
            onFocus={() => onActivate?.()}
            onInput={(e) => {
                const next = e.target.value;
                setText(next);
                onQueryChange(next);
            }}
            onChange={(e) => commit(e.target.selectedValue, e.target.value)}
        >
            {items.map((item) => {
                const key = String(getKey(item));
                return <ComboBoxItem key={key} value={key} text={getLabel(item)} />;
            })}
        </ComboBox>
    );
}
