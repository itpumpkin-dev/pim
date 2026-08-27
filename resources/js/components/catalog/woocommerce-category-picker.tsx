import { Autocomplete, TextField, type SxProps, type Theme } from '@mui/material';
import { useEffect, useState } from 'react';

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
    sx,
}: {
    value: WooCommerceCategoryOption | null;
    onChange: (next: WooCommerceCategoryOption | null) => void;
    placeholder?: string;
    sx?: SxProps<Theme>;
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
        <Autocomplete
            size="small"
            options={results}
            loading={loading}
            filterOptions={(options) => options}
            getOptionLabel={(opt) => opt.name}
            isOptionEqualToValue={(opt, val) => opt.id === val.id}
            value={value}
            onChange={(_, val) => onChange(val)}
            inputValue={query}
            onInputChange={(_, val) => setQuery(val)}
            renderInput={(params) => <TextField {...params} placeholder={placeholder} sx={sx} />}
        />
    );
}
