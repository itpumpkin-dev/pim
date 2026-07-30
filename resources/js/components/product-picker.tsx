import CloseIcon from '@mui/icons-material/Close';
import { Autocomplete, IconButton, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useState } from 'react';

export interface ProductOption {
    id: number;
    sku: string;
    name: string;
}

/**
 * Search-by-SKU-or-name picker for the product edit page's Associations
 * panel (Related/Up-sell/Cross-sell). Debounced server search against
 * catalog.products.search, excluding whatever's already picked.
 */
export function ProductPicker({ value, onChange }: { value: ProductOption[]; onChange: (next: ProductOption[]) => void }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<ProductOption[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (query.trim().length < 2) {
            setResults([]);
            return;
        }

        setLoading(true);
        const timer = setTimeout(() => {
            const params = new URLSearchParams({ q: query });
            value.forEach((p) => params.append('exclude[]', String(p.id)));

            fetch(`/catalog/products/search?${params.toString()}`, { headers: { Accept: 'application/json' } })
                .then((res) => (res.ok ? res.json() : []))
                .then((data: ProductOption[]) => setResults(data))
                .finally(() => setLoading(false));
        }, 300);

        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [query]);

    const addProduct = (product: ProductOption) => {
        onChange([...value, product]);
        setQuery('');
        setResults([]);
    };

    const removeProduct = (id: number) => {
        onChange(value.filter((p) => p.id !== id));
    };

    return (
        <Stack spacing={1}>
            <Autocomplete
                size="small"
                options={results}
                loading={loading}
                filterOptions={(options) => options}
                getOptionLabel={(opt) => `${opt.sku} — ${opt.name}`}
                inputValue={query}
                onInputChange={(_, val) => setQuery(val)}
                onChange={(_, val) => val && addProduct(val)}
                value={null}
                renderInput={(params) => <TextField {...params} placeholder="ค้นหาด้วย SKU หรือชื่อสินค้า" />}
            />
            <Stack spacing={0.5}>
                {value.map((product) => (
                    <Stack
                        key={product.id}
                        direction="row"
                        alignItems="center"
                        justifyContent="space-between"
                        sx={{ border: 1, borderColor: 'divider', borderRadius: 1, px: 1.5, py: 0.75 }}
                    >
                        <Typography variant="body2">
                            {product.sku} — {product.name}
                        </Typography>
                        <IconButton size="small" onClick={() => removeProduct(product.id)}>
                            <CloseIcon fontSize="small" />
                        </IconButton>
                    </Stack>
                ))}
                {value.length === 0 && (
                    <Typography variant="caption" color="text.disabled">
                        ยังไม่มีสินค้า
                    </Typography>
                )}
            </Stack>
        </Stack>
    );
}
