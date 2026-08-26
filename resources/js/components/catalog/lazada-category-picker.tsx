import { Autocomplete, TextField } from '@mui/material';
import { useEffect, useState } from 'react';

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
}: {
    value: LazadaCategoryOption | null;
    onChange: (next: LazadaCategoryOption | null) => void;
    placeholder?: string;
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
            renderInput={(params) => <TextField {...params} placeholder={placeholder} />}
        />
    );
}
