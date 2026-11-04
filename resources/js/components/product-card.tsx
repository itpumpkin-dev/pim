import { currency, productCsvHeaders, productImageUrl, productToCsvRow, type Product } from '@/data/products';
import { getCategoryIconName } from '@/lib/category-icon';
import { downloadCsv } from '@/lib/csv';
import { isProductStatus, PRODUCT_STATUS_CHIP_COLORS, PRODUCT_STATUS_LABEL_KEYS } from '@/lib/product-status';
import { useProductTagLabel } from '@/lib/product-tag';
import { sapIcon } from '@/lib/sap-icon';
import { trackEvent } from '@/lib/track-event';
import { Link } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/download.js';
import '@ui5/webcomponents-icons/dist/heating-cooling.js';
import '@ui5/webcomponents-icons/dist/product.js';
import { Tag, Icon as Ui5Icon } from '@ui5/webcomponents-react';
import { memo, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './product-card.module.css';

type TagDesign = 'Positive' | 'Negative' | 'Critical' | 'Information';

/** `Product.tagColor` (old MUI Chip colour) → UI5 Tag design. */
export const PRODUCT_TAG_DESIGN: Record<NonNullable<Product['tagColor']>, TagDesign> = {
    error: 'Negative',
    success: 'Positive',
    warning: 'Critical',
};

/** `PRODUCT_STATUS_CHIP_COLORS` value → UI5 Tag design. */
export const PRODUCT_STATUS_TAG_DESIGN: Record<(typeof PRODUCT_STATUS_CHIP_COLORS)[keyof typeof PRODUCT_STATUS_CHIP_COLORS], TagDesign> = {
    success: 'Positive',
    warning: 'Critical',
    error: 'Negative',
    info: 'Information',
};

// Memoised: the storefront home grid mounts 150+ of these and grows the
// visible slice on scroll — without this, every card re-renders on each batch.
export const ProductCard = memo(function ProductCard({ product, popular = false }: { product: Product; popular?: boolean }) {
    const { t } = useTranslation();
    const tagLabel = useProductTagLabel();
    const Icon = product.icon ?? sapIcon(getCategoryIconName(product.category));
    const [imageFailed, setImageFailed] = useState(false);
    const [hovering, setHovering] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);

    useEffect(() => {
        if (!product.videoUrl) return;
        if (hovering) {
            videoRef.current?.play().catch(() => {});
        } else {
            videoRef.current?.pause();
            if (videoRef.current) videoRef.current.currentTime = 0;
        }
    }, [hovering, product.videoUrl]);

    const handleExport = (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        downloadCsv(`product-${product.sku}.csv`, productCsvHeaders, [productToCsvRow(product)]);
    };

    const handleCardClick = () => {
        trackEvent({ eventType: 'click', productId: product.id, category: product.category ?? null });
    };

    return (
        <div onMouseEnter={() => setHovering(true)} onMouseLeave={() => setHovering(false)} className={styles.wrapper}>
            <Link href={`/products/${product.id}`} prefetch onClick={handleCardClick} className={styles.card}>
                {product.tag && (
                    <Tag className={styles.tag} design={product.tagColor ? PRODUCT_TAG_DESIGN[product.tagColor] : 'Neutral'} hideStateIcon>
                        {tagLabel(product)}
                    </Tag>
                )}

                {popular && (
                    <span className={styles.popular}>
                        <Ui5Icon name="heating-cooling" className={styles.popularIcon} />
                        {t('popularBadge')}
                    </span>
                )}

                <div className={styles.media} style={imageFailed ? { minHeight: 160 } : undefined}>
                    {!imageFailed ? (
                        <img
                            src={productImageUrl(product)}
                            alt={product.name}
                            loading="lazy"
                            onError={() => setImageFailed(true)}
                            className={styles.image}
                        />
                    ) : (
                        <Icon className={styles.fallbackIcon} style={{ width: 56, height: 56 }} />
                    )}

                    {product.videoUrl && (
                        <video
                            ref={videoRef}
                            src={product.videoUrl}
                            muted
                            loop
                            playsInline
                            className={styles.video}
                            style={{ opacity: hovering ? 1 : 0 }}
                        />
                    )}
                </div>

                <div className={styles.body}>
                    <div className={styles.metaRow}>
                        <span className={styles.caption}>
                            {product.brand} · {product.category}
                        </span>
                        {isProductStatus(product.status) && (
                            <Tag
                                className={styles.status}
                                design={PRODUCT_STATUS_TAG_DESIGN[PRODUCT_STATUS_CHIP_COLORS[product.status]]}
                                hideStateIcon
                            >
                                {t(`catalog:${PRODUCT_STATUS_LABEL_KEYS[product.status]}`)}
                            </Tag>
                        )}
                    </div>
                    <div className={styles.name}>{product.name}</div>
                    <span className={`${styles.caption} ${styles.variant}`}>
                        {product.color ? `${product.color} · ` : ''}
                        {product.size}
                    </span>

                    {(product.canViewPricing !== false || product.canViewPackaging !== false) && (
                        <div className={styles.footerRow}>
                            {product.canViewPricing !== false && <span className={styles.price}>{currency(product.price)}</span>}
                            {product.canViewPackaging !== false && (
                                <span className={styles.pack}>
                                    <Ui5Icon name="product" className={styles.packIcon} />
                                    <span>{t('packLabel', { qty: product.packQty, unit: product.packUnit || t('defaultPackUnit') })}</span>
                                </span>
                            )}
                        </div>
                    )}

                    {/* Native <button> + title rather than a UI5 Button/tooltip:
                        this card renders 150+ times on the storefront home grid,
                        so keep each one as light as possible. */}
                    <button
                        type="button"
                        onClick={handleExport}
                        title={t('exportThisProduct')}
                        aria-label={t('exportThisProduct')}
                        className={styles.exportButton}
                        style={{ top: popular ? 44 : 8 }}
                    >
                        <Ui5Icon name="download" className={styles.exportIcon} />
                    </button>
                </div>
            </Link>
        </div>
    );
});
