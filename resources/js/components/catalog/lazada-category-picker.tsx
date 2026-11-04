import { useEffect, useState, type CSSProperties } from 'react';

import { AsyncSearchComboBox } from '@/components/catalog/async-search-combo-box';
import type { Ui5ValueState } from '@/components/fiori-form';

export interface LazadaCategoryOption {
    id: number;
    name: string;
    parent_id: number | null;
}

/**
 * ตัวค้นหา category ของ Lazada จากชื่อ โดยดึงจาก tree ที่แคชไว้ในเครื่อง
 * (ดูที่ CategoryController::searchLazadaCategories) — จะคืนมาเฉพาะ category
 * ที่เป็น leaf (ไม่มีลูกต่อ) เท่านั้น เพราะ Lazada บังคับให้สินค้าต้อง map กับ
 * leaf category เท่านั้น จะ map กับ category แม่ไม่ได้
 */
export function LazadaCategoryPicker({
    value,
    onChange,
    placeholder,
    valueState,
    style,
    className,
}: {
    value: LazadaCategoryOption | null;
    onChange: (next: LazadaCategoryOption | null) => void;
    placeholder?: string;
    valueState?: Ui5ValueState;
    style?: CSSProperties;
    className?: string;
    /** @deprecated legacy MUI prop — ignored; kept only so unconverted callers still compile */
    sx?: unknown;
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<LazadaCategoryOption[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setLoading(true);
        const timer = setTimeout(() => {
            const params = new URLSearchParams({ q: query });

            fetch(`/catalog/categories/search-lazada?${params.toString()}`, { headers: { Accept: 'application/json' } })
                .then((res) => (res.ok ? res.json() : { data: [] }))
                .then((body: { data: LazadaCategoryOption[] }) => setResults(body.data))
                .finally(() => setLoading(false));
        }, 300);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]);

    return (
        <AsyncSearchComboBox
            value={value}
            onChange={onChange}
            results={results}
            loading={loading}
            getKey={(opt) => opt.id}
            getLabel={(opt) => opt.name}
            onQueryChange={setQuery}
            placeholder={placeholder}
            valueState={valueState}
            style={style}
            className={className}
        />
    );
}
