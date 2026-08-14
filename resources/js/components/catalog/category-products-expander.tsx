import { Box, Chip, CircularProgress, Collapse, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ProductRef {
    id: number;
    sku: string;
}

/**
 * "Which products does leaving this category unmapped actually affect?" —
 * shown per row on the Lazada/Shopee mapping review pages. The count comes
 * pre-loaded with the page (cheap withCount); the actual SKU list is fetched
 * lazily on first expand via CategoryController::categoryProducts(), since
 * pulling every row's full product list up front doesn't scale with page size.
 */
export function CategoryProductsExpander({ categoryId, count }: { categoryId: number; count: number }) {
    const { t } = useTranslation('catalog');
    const [expanded, setExpanded] = useState(false);
    const [loading, setLoading] = useState(false);
    const [products, setProducts] = useState<ProductRef[] | null>(null);

    if (count === 0) {
        return (
            <Typography variant="caption" color="text.disabled" sx={{ fontStyle: 'italic' }}>
                {t('noProductsInCategory')}
            </Typography>
        );
    }

    const toggle = () => {
        if (!expanded && products === null) {
            setLoading(true);
            fetch(`/catalog/categories/${categoryId}/products`, { headers: { Accept: 'application/json' } })
                .then((res) => (res.ok ? res.json() : { data: [] }))
                .then((body: { data: ProductRef[] }) => setProducts(body.data))
                .finally(() => setLoading(false));
        }
        setExpanded((prev) => !prev);
    };

    return (
        <Box>
            <Chip
                label={t('productsInCategory', { count })}
                size="small"
                variant="outlined"
                onClick={toggle}
                sx={{ cursor: 'pointer' }}
            />
            <Collapse in={expanded}>
                <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1 }}>
                    {loading && <CircularProgress size={14} />}
                    {products?.map((p) => (
                        <Chip key={p.id} label={p.sku} size="small" />
                    ))}
                </Stack>
            </Collapse>
        </Box>
    );
}
