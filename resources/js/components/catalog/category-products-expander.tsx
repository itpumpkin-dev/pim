import { Box, Chip, CircularProgress, Collapse, Stack, Typography } from '@mui/material';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface ProductRef {
    id: number;
    sku: string;
}

/**
 * ตอบคำถามว่า "ถ้าปล่อย category นี้ไว้แบบไม่ได้ map จะกระทบสินค้าตัวไหนบ้าง?"
 * — แสดงอยู่ในแต่ละแถวของหน้าตรวจสอบการ map Lazada/Shopee ตัวเลขจำนวนสินค้า
 * จะโหลดมาพร้อมหน้าเลย (ใช้ withCount ซึ่งเบามาก) ส่วนลิสต์ SKU จริงๆ จะโหลด
 * แบบ lazy ตอนกดขยายครั้งแรกผ่าน CategoryController::categoryProducts()
 * เพราะถ้าโหลดลิสต์สินค้าเต็มๆ ของทุกแถวมาตั้งแต่แรก จะรับโหลดไม่ไหวเมื่อข้อมูลเยอะ
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
