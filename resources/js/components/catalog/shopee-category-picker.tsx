import { Autocomplete, TextField, type SxProps, type Theme } from '@mui/material';
import { useEffect, useState } from 'react';

export interface ShopeeCategoryOption {
    id: number;
    name: string;
    name_th: string | null;
    parent_id: number | null;
}

/**
 * ตัวค้นหา category ของ Shopee จากชื่อ โดยดึงจาก tree ที่แคชไว้ในเครื่อง
 * (ดูที่ CategoryController::searchShopeeCategories) — ทำงานเหมือน
 * LazadaCategoryPicker เลย จะคืนมาเฉพาะ category ที่เป็น leaf เท่านั้น
 * เพราะ Shopee บังคับให้สินค้าต้อง map กับ leaf category เท่านั้น
 * จะ map กับ category แม่ไม่ได้
 */
export function ShopeeCategoryPicker({
    value,
    onChange,
    placeholder,
    sx,
}: {
    value: ShopeeCategoryOption | null;
    onChange: (next: ShopeeCategoryOption | null) => void;
    placeholder?: string;
    sx?: SxProps<Theme>;
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ShopeeCategoryOption[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setLoading(true);
        const timer = setTimeout(() => {
            const params = new URLSearchParams({ q: query });

            fetch(`/catalog/categories/search-shopee?${params.toString()}`, { headers: { Accept: 'application/json' } })
                .then((res) => (res.ok ? res.json() : { data: [] }))
                .then((body: { data: ShopeeCategoryOption[] }) => setResults(body.data))
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
            getOptionLabel={(opt) => (opt.name_th ? `${opt.name} (${opt.name_th})` : opt.name)}
            isOptionEqualToValue={(opt, val) => opt.id === val.id}
            value={value}
            onChange={(_, val) => onChange(val)}
            inputValue={query}
            onInputChange={(_, val) => setQuery(val)}
            renderInput={(params) => <TextField {...params} placeholder={placeholder} sx={sx} />}
        />
    );
}
