import { Autocomplete, TextField } from '@mui/material';
import { useEffect, useState } from 'react';

export interface ShopeeCategoryOption {
    id: number;
    name: string;
    parent_id: number | null;
}

/**
 * Search-by-name picker over the locally cached Shopee category tree (see
 * CategoryController::searchShopeeCategories) — mirrors LazadaCategoryPicker.
 * Only leaf categories are returned, since Shopee requires products to map
 * to a leaf, never a parent node.
 */
export function ShopeeCategoryPicker({
    value,
    onChange,
    placeholder,
}: {
    value: ShopeeCategoryOption | null;
    onChange: (next: ShopeeCategoryOption | null) => void;
    placeholder?: string;
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
