import { Autocomplete, TextField } from '@mui/material';
import { useEffect, useState } from 'react';

export interface PimAttributeOption {
    id: number;
    name: string;
}

/**
 * Search-by-name picker over PIM attributes (see
 * ShopeeAttributeMappingController::searchPimAttributes) — the attribute
 * mirror of PimBrandPicker. Backs the "pick a PIM attribute for this Shopee
 * attribute" column on the Shopee Attributes table on
 * categories/shopee-mapping.tsx, only ever shown for FREE_TEXT_FILED rows
 * (see that table's column definition) since
 * ShopeeAttributeMappingController::update() rejects any other input_type.
 *
 * Same open-gated fetching as PimBrandPicker, for the same reason: this
 * table can render one of these per attribute row all at once.
 */
export function PimAttributePicker({
    value,
    onChange,
    placeholder,
    disabled,
}: {
    value: PimAttributeOption | null;
    onChange: (next: PimAttributeOption | null) => void;
    placeholder?: string;
    disabled?: boolean;
}) {
    const [open, setOpen] = useState(false);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<PimAttributeOption[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!open) return;

        setLoading(true);
        const timer = setTimeout(() => {
            const params = new URLSearchParams({ q: query });

            fetch(`/catalog/attributes/search-pim?${params.toString()}`, { headers: { Accept: 'application/json' } })
                .then((res) => (res.ok ? res.json() : { data: [] }))
                .then((body: { data: PimAttributeOption[] }) => setResults(body.data))
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
            onInputChange={(_, val, reason) => {
                if (reason === 'input') setQuery(val);
            }}
            renderInput={(params) => <TextField {...params} placeholder={placeholder} />}
        />
    );
}
