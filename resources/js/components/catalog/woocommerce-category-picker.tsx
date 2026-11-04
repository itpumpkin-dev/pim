import { useEffect, useState, type CSSProperties } from 'react';

import { AsyncSearchComboBox } from '@/components/catalog/async-search-combo-box';
import type { Ui5ValueState } from '@/components/fiori-form';

export interface WooCommerceCategoryOption {
    id: number;
    name: string;
    parent_id: number | null;
}

/**
 * ตัวค้นหา category ของ WooCommerce จากชื่อ โดยดึงจาก tree ที่แคชไว้ในเครื่อง
 * (ดูที่ CategoryController::searchWoocommerceCategories) — ทำงานเหมือน
 * LazadaCategoryPicker จะคืนมาเฉพาะ category ที่เป็น leaf เท่านั้น
 */
export function WooCommerceCategoryPicker({
    value,
    onChange,
    placeholder,
    valueState,
    style,
    className,
}: {
    value: WooCommerceCategoryOption | null;
    onChange: (next: WooCommerceCategoryOption | null) => void;
    placeholder?: string;
    valueState?: Ui5ValueState;
    style?: CSSProperties;
    className?: string;
    /** @deprecated legacy MUI prop — ignored; kept only so unconverted callers still compile */
    sx?: unknown;
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<WooCommerceCategoryOption[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setLoading(true);
        const timer = setTimeout(() => {
            const params = new URLSearchParams({ q: query });

            fetch(`/catalog/categories/search-woocommerce?${params.toString()}`, { headers: { Accept: 'application/json' } })
                .then((res) => (res.ok ? res.json() : { data: [] }))
                .then((body: { data: WooCommerceCategoryOption[] }) => setResults(body.data))
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
