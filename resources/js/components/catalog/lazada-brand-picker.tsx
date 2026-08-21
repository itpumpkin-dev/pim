import { Autocomplete, TextField } from '@mui/material';
import { useEffect, useState } from 'react';

export interface LazadaBrandOption {
    id: number;
    name: string;
}

/**
 * Search-by-name picker over the locally cached Lazada brand list (see
 * BrandController::searchLazadaBrands) — mirrors ShopeeBrandPicker/
 * WooCommerceBrandPicker.
 */
export function LazadaBrandPicker({
    value,
    onChange,
    placeholder,
}: {
    value: LazadaBrandOption | null;
    onChange: (next: LazadaBrandOption | null) => void;
    placeholder?: string;
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<LazadaBrandOption[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setLoading(true);
        const timer = setTimeout(() => {
            const params = new URLSearchParams({ q: query });

            fetch(`/catalog/brands/search-lazada?${params.toString()}`, { headers: { Accept: 'application/json' } })
                .then((res) => (res.ok ? res.json() : { data: [] }))
                .then((body: { data: LazadaBrandOption[] }) => setResults(body.data))
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
