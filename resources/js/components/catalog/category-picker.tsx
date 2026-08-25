import { Autocomplete, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';

export interface CategoryOption {
    id: number;
    name: string;
    path: string;
}

/**
 * Search-by-name picker over the PIM's own leaf categories (see
 * CategoryController::searchCategories) — the mirror image of
 * ShopeeCategoryPicker, which searches Shopee's leaf tree instead. Backs the
 * "assign a PIM category to this Shopee node" action on
 * categories/shopee-mapping.tsx, where mapping now starts from a Shopee row
 * and asks "which of our categories is this", not the other way around.
 */
export function CategoryPicker({
    value,
    onChange,
    placeholder,
}: {
    value: CategoryOption | null;
    onChange: (next: CategoryOption | null) => void;
    placeholder?: string;
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<CategoryOption[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setLoading(true);
        const timer = setTimeout(() => {
            const params = new URLSearchParams({ q: query });

            fetch(`/catalog/categories/search?${params.toString()}`, { headers: { Accept: 'application/json' } })
                .then((res) => (res.ok ? res.json() : { data: [] }))
                .then((body: { data: CategoryOption[] }) => setResults(body.data))
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
            renderOption={(props, option) => (
                <li {...props} key={option.id}>
                    <div>
                        <Typography variant="body2">{option.name}</Typography>
                        <Typography variant="caption" color="text.secondary" sx={{ fontStyle: 'italic' }}>
                            {option.path}
                        </Typography>
                    </div>
                </li>
            )}
            renderInput={(params) => <TextField {...params} placeholder={placeholder} />}
        />
    );
}
