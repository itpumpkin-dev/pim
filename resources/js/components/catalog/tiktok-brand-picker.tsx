import { Autocomplete, TextField } from '@mui/material';
import { useEffect, useState } from 'react';

export interface TikTokBrandOption {
    // TikTok's brand ids are 19-digit numbers — a plain `number` here would
    // silently lose precision the moment the fetch response is JSON-parsed
    // (confirmed live: JS rounds anything past Number.MAX_SAFE_INTEGER, e.g.
    // 7417026736480880390 becomes 7417026736480881000), corrupting the id a
    // save would send back. BrandController::searchTiktokBrands() sends
    // this field as a quoted JSON string specifically to avoid that — see
    // BrandController::serializeMarketplaceBrands()'s docblock. Shopee/
    // WooCommerce/Lazada's real ids are all small enough that this has
    // never been a problem for their pickers, which is why only this one
    // uses `string`.
    id: string;
    name: string;
}

/**
 * Search-by-name picker over the locally cached TikTok brand list (see
 * BrandController::searchTiktokBrands) — mirrors ShopeeBrandPicker/
 * WooCommerceBrandPicker/LazadaBrandPicker.
 */
export function TikTokBrandPicker({
    value,
    onChange,
    placeholder,
}: {
    value: TikTokBrandOption | null;
    onChange: (next: TikTokBrandOption | null) => void;
    placeholder?: string;
}) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<TikTokBrandOption[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        setLoading(true);
        const timer = setTimeout(() => {
            const params = new URLSearchParams({ q: query });

            fetch(`/catalog/brands/search-tiktok?${params.toString()}`, { headers: { Accept: 'application/json' } })
                .then((res) => (res.ok ? res.json() : { data: [] }))
                .then((body: { data: TikTokBrandOption[] }) => setResults(body.data))
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
