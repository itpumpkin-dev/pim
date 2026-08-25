import { Autocomplete, TextField } from '@mui/material';
import { useEffect, useState } from 'react';

export interface PimBrandOption {
    id: number;
    name: string;
}

/**
 * Search-by-name picker over the PIM's own `pbrand` attribute options (see
 * BrandController::searchPimBrands) — the mirror image of the old
 * ShopeeBrandPicker (which searched Shopee's brand cache by name). Backs the
 * "pick a PIM brand for this Shopee brand" column on the Shopee Brands table
 * on categories/shopee-mapping.tsx, where mapping starts from a Shopee brand
 * row (scoped to whichever category is selected above) rather than a global
 * PIM brand list.
 *
 * Unlike a typical debounced Autocomplete, fetching is gated on the dropdown
 * actually being open (`open`/`onOpen`/`onClose` below) rather than firing on
 * mount — that table renders one of these per brand row (routinely dozens at
 * once, all visible at the same time, select-style), so an unconditional
 * fetch-on-mount would fire that many simultaneous empty-query requests the
 * moment a category's brands load, before the user has touched any of them.
 */
export function PimBrandPicker({
    value,
    onChange,
    placeholder,
    disabled,
}: {
    value: PimBrandOption | null;
    onChange: (next: PimBrandOption | null) => void;
    placeholder?: string;
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<PimBrandOption[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) return;

        setLoading(true);
        const timer = setTimeout(() => {
            const params = new URLSearchParams({ q: query });

            fetch(`/catalog/brands/search-pim?${params.toString()}`, { headers: { Accept: 'application/json' } })
                .then((res) => (res.ok ? res.json() : { data: [] }))
                .then((body: { data: PimBrandOption[] }) => setResults(body.data))
                .finally(() => setLoading(false));
        }, 300);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query, open]);

    return (
        <Autocomplete
            size="small"
            disabled={disabled}
            open={open}
            onOpen={() => setOpen(true)}
            onClose={() => setOpen(false)}
            options={results}
            loading={loading}
            filterOptions={(options) => options}
            getOptionLabel={(opt) => opt.name}
            isOptionEqualToValue={(opt, val) => opt.id === val.id}
            value={value}
            onChange={(_, val) => onChange(val)}
            // `inputValue` deliberately left uncontrolled — this component
            // stays mounted permanently (one per brand row, select-style)
            // rather than being unmounted right after a pick like the
            // category pickers, so it has to keep displaying `value`'s label
            // while closed. Controlling `inputValue` to `query` would pin
            // the field to whatever was last typed (empty, for a row nobody
            // has searched in yet) and show blank instead of the mapped
            // brand's name. `onInputChange` alone is enough to capture what
            // the user types for the debounced search below.
            onInputChange={(_, val, reason) => {
                if (reason === 'input') setQuery(val);
            }}
            renderInput={(params) => <TextField {...params} placeholder={placeholder} />}
        />
    );
}
