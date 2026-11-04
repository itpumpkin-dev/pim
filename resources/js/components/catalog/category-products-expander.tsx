import { BusyIndicator, Tag } from '@ui5/webcomponents-react';
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
            <span
                style={{
                    fontSize: 'var(--sapFontSmallSize)',
                    fontStyle: 'italic',
                    color: 'var(--sapContent_DisabledTextColor, var(--sapContent_LabelColor))',
                }}
            >
                {t('noProductsInCategory')}
            </span>
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
        <div>
            <Tag interactive design="Neutral" onClick={toggle} aria-expanded={expanded}>
                {t('productsInCategory', { count })}
            </Tag>
            {expanded && (
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.25rem', marginTop: '0.5rem' }}>
                    {loading && <BusyIndicator active delay={0} size="S" />}
                    {products?.map((p) => (
                        <Tag key={p.id} design="Neutral" hideStateIcon>
                            {p.sku}
                        </Tag>
                    ))}
                </div>
            )}
        </div>
    );
}
