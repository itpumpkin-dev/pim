import AppLogoIcon from '@/components/app-logo-icon';
import AppearanceToggleDropdown from '@/components/appearance-dropdown';
import LocaleDropdown from '@/components/locale-dropdown';
import { LocaleSwitchOverlay } from '@/components/locale-switch-overlay';
import { PRODUCT_STATUS_TAG_DESIGN, PRODUCT_TAG_DESIGN, ProductCard } from '@/components/product-card';
import { RouteTopProgressBar } from '@/components/route-top-progress-bar';
import { currency, productImageUrl, type IconType, type Product } from '@/data/products';
import { useResolvedAppearance } from '@/hooks/use-appearance';
import { useElementWidth } from '@/hooks/use-element-width';
import { useStorefrontWatcher } from '@/hooks/use-storefront-watcher';
import { computeBentoLayout, findBentoGaps, gridArea, packBento, scaleBentoItems, type BentoItem } from '@/lib/bento';
import { getCategoryIconName } from '@/lib/category-icon';
import { isProductStatus, PRODUCT_STATUS_CHIP_COLORS, PRODUCT_STATUS_LABEL_KEYS } from '@/lib/product-status';
import { useProductTagLabel } from '@/lib/product-tag';
import { sapIcon } from '@/lib/sap-icon';
import { type SharedData } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/customize.js';
import '@ui5/webcomponents-icons/dist/edit.js';
import '@ui5/webcomponents-icons/dist/money-bills.js';
import '@ui5/webcomponents-icons/dist/nav-back.js';
import '@ui5/webcomponents-icons/dist/palette.js';
import '@ui5/webcomponents-icons/dist/print.js';
import '@ui5/webcomponents-icons/dist/product.js';
import '@ui5/webcomponents-icons/dist/retail-store.js';
import '@ui5/webcomponents-icons/dist/sys-enter-2.js';
import '@ui5/webcomponents-icons/dist/tag.js';
import '@ui5/webcomponents-icons/dist/visits.js';
import { Button, Tag, Icon as Ui5Icon } from '@ui5/webcomponents-react';
import { cloneElement, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import styles from './show.module.css';

// The page-enter keyframe animation (plays once whenever this page mounts,
// i.e. every time Inertia navigates here) lives in show.module.css (.content).

type GridArea = { gridColumn: string; gridRow: string };
type CellType = 'hero' | 'spec' | 'product' | 'stat' | 'info' | 'feature' | 'discount' | 'video';
type CellDef = { key: string; type: CellType; render: (area: GridArea) => React.ReactElement };

const cx = (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(' ');

const StorefrontIcon = sapIcon('retail-store');
const PaletteIcon = sapIcon('palette');
const TuneIcon = sapIcon('customize');

/** rotating palette for small fact tiles, so the grid reads as a lively mosaic instead of one flat color */
const STAT_VARIANTS = [styles.statVariant0, styles.statVariant1, styles.statVariant2, styles.statVariant3, styles.statVariant4, styles.statVariant5];

/** feature-highlight badge accents (was MUI success / info / secondary / warning) */
const FEATURE_ACCENTS = ['var(--sapPositiveColor)', 'var(--sapInformativeColor)', 'var(--sapAccentColor9)', 'var(--sapCriticalColor)'];

/** small icon + value + label tile, used both for real facts (brand/category/color) and for filling leftover grid gaps */
function factCell(area: GridArea, variantIndex: number, FactIcon: IconType, value: string, label: string, h = 2) {
    const compact = h <= 1;
    const variant = STAT_VARIANTS[variantIndex % STAT_VARIANTS.length];

    if (compact) {
        return (
            <div style={area} className={cx(styles.cell, styles.factCompact, variant)}>
                <FactIcon fontSize="small" className={styles.factIcon} />
                <span className={cx(styles.factCompactValue, styles.noWrap)}>{value}</span>
            </div>
        );
    }

    return (
        <div style={area} className={cx(styles.cell, styles.fact, variant)}>
            <FactIcon fontSize="medium" className={styles.factIcon} />
            <span className={cx(styles.factValue, styles.noWrap)}>{value}</span>
            <span className={cx(styles.factLabel, styles.noWrap)}>{label}</span>
        </div>
    );
}

export default function ProductShow({ product, related }: { product: Product | null; related: Product[] }) {
    const { auth } = usePage<SharedData>().props;
    const tagLabel = useProductTagLabel();
    const { t } = useTranslation();
    const { resolved: mode } = useResolvedAppearance();
    const [imageFailed, setImageFailed] = useState(false);
    const { ref: bentoRef, width: bentoWidth } = useElementWidth<HTMLDivElement>();

    useStorefrontWatcher(({ id, enabled }) => {
        if (id !== product?.id) return;
        if (!enabled) {
            router.visit('/');
        } else {
            router.reload({ only: ['product', 'related'] });
        }
    });

    const actions = !auth.user ? (
        <Button design="Emphasized" icon="visits" className={styles.signIn} onClick={() => router.visit(route('login'))}>
            Sign in
        </Button>
    ) : (
        <Button className={styles.dashboardButton} onClick={() => router.visit(route('dashboard'))}>
            ไปที่ Dashboard
        </Button>
    );

    const appBar = (
        <header className={styles.appBar}>
            <Link href="/" className={styles.brandLink}>
                <span className={styles.brandLogo}>
                    <AppLogoIcon style={{ width: 32, height: 32, fill: 'currentColor' }} />
                </span>
                <span className={styles.brandText}>
                    PIM <span className={styles.brandAccent}>Pumpkin</span>
                </span>
            </Link>
            <div className={styles.toolbarActions}>
                <LocaleDropdown />
                <AppearanceToggleDropdown />
                {actions}
            </div>
        </header>
    );

    if (!product) {
        return (
            <div className={styles.root} data-mode={mode}>
                <Head title="ไม่พบสินค้า" />
                {appBar}

                <div className={styles.notFound}>
                    <span className={styles.notFoundTitle}>ไม่พบสินค้าที่คุณต้องการ</span>
                    <Button design="Transparent" icon="nav-back" onClick={() => router.visit('/')}>
                        {t('productDetail.backToHome')}
                    </Button>
                </div>

                <RouteTopProgressBar />
            </div>
        );
    }

    const Icon = product.icon ?? sapIcon(getCategoryIconName(product.category));

    const heroRender = (area: GridArea) => (
        <div style={area} className={cx(styles.cell, styles.hero)}>
            {!imageFailed && (
                <img src={productImageUrl(product)} alt="" aria-hidden="true" onError={() => setImageFailed(true)} className={styles.heroImage} />
            )}
            <div className={styles.heroBody}>
                <span className={styles.heroEyebrow}>
                    {product.brand} · {product.category}
                </span>
                <h1 className={cx(styles.heroTitle, styles.clamp2)}>{product.name}</h1>
                <p className={cx(styles.heroDescription, styles.clamp3)}>{product.description}</p>
                <div className={styles.heroChips}>
                    <span className={styles.glassChip}>{`SKU ${product.sku}`}</span>
                    {product.color && <span className={styles.glassChip}>{product.color}</span>}
                    {product.tag && (
                        <Tag className={styles.boldTag} design={product.tagColor ? PRODUCT_TAG_DESIGN[product.tagColor] : 'Neutral'} hideStateIcon>
                            {tagLabel(product)}
                        </Tag>
                    )}
                    {isProductStatus(product.status) && (
                        <Tag className={styles.boldTag} design={PRODUCT_STATUS_TAG_DESIGN[PRODUCT_STATUS_CHIP_COLORS[product.status]]} hideStateIcon>
                            {t(`catalog:${PRODUCT_STATUS_LABEL_KEYS[product.status]}`)}
                        </Tag>
                    )}
                </div>
            </div>
            <div className={styles.heroActions}>
                <Button design="Emphasized" icon="edit" className={styles.pillButton}>
                    {t('productDetail.editInfo')}
                </Button>
                <Button icon="print" className={styles.ghostButton}>
                    {t('productDetail.printInfo')}
                </Button>
            </div>
        </div>
    );

    const specRender = (area: GridArea) => (
        <div style={area} className={cx(styles.cell, styles.spec)}>
            <div className={styles.specHeader}>
                <Ui5Icon name="customize" className={styles.specHeaderIcon} />
                <span className={styles.specHeaderLabel}>{t('productDetail.specifications')}</span>
            </div>
            <div className={cx(styles.specTitle, styles.clamp2)}>{product.name}</div>
            <table className={styles.specTable}>
                <tbody>
                    {Object.entries(product.specs).map(([label, value]) => (
                        <tr key={label}>
                            <td className={styles.specLabel}>{label}</td>
                            <td className={styles.specValue}>{value}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );

    const productRender = (area: GridArea) => (
        <div style={area} className={cx(styles.cell, styles.photo)}>
            {product.tag && (
                <Tag className={styles.cornerTag} design={product.tagColor ? PRODUCT_TAG_DESIGN[product.tagColor] : 'Neutral'} hideStateIcon>
                    {tagLabel(product)}
                </Tag>
            )}
            <div className={styles.photoMedia}>
                {!imageFailed ? (
                    <img
                        src={productImageUrl(product)}
                        alt={product.name}
                        loading="lazy"
                        onError={() => setImageFailed(true)}
                        className={styles.photoImage}
                    />
                ) : (
                    <Icon className={styles.photoFallbackIcon} style={{ width: 80, height: 80 }} />
                )}
            </div>
            <div className={styles.photoCaption}>
                <span className={styles.photoSku}>{product.sku}</span>
                <span className={cx(styles.photoName, styles.clamp2)}>{product.name}</span>
            </div>
        </div>
    );

    const videoRender = (area: GridArea) => (
        <div style={area} className={cx(styles.cell, styles.video)}>
            <span className={styles.videoLabel}>วิดีโอสินค้า</span>
            <video src={product.videoUrl} controls muted loop playsInline className={styles.videoElement} />
        </div>
    );

    const priceRender = (area: GridArea) => (
        <div style={area} className={cx(styles.cell, styles.stat, styles.price)}>
            <Ui5Icon name="money-bills" className={styles.statIcon} />
            <span className={styles.statValue}>{currency(product.price)}</span>
            <span className={cx(styles.statCaption, styles.statCaptionStrong)}>ราคาต่อหน่วย</span>
        </div>
    );

    const packagingRender = (area: GridArea) => (
        <div style={area} className={cx(styles.cell, styles.stat, styles.packaging)}>
            <Ui5Icon name="product" className={cx(styles.statIcon, styles.statIconMuted)} />
            <span className={styles.statValue}>
                {product.packQty}
                <span className={styles.statUnit}>
                    {product.packUnit}/{t('productDetail.carton')}
                </span>
            </span>
            <span className={styles.statCaption}>
                {t('productDetail.packSize')} {product.size}
            </span>
        </div>
    );

    const discountRender = (area: GridArea) => (
        <div style={area} className={cx(styles.cell, styles.stat, styles.discount)}>
            <Ui5Icon name="tag" className={cx(styles.statIcon, styles.discountIcon)} />
            <div className={styles.discountTitle}>ส่วนลดตามจำนวนสั่งซื้อ</div>
            <p className={cx(styles.discountNote, styles.clamp3)}>{product.discountNote}</p>
        </div>
    );

    const featureRender = (area: GridArea, index: number, highlight: string) => (
        <div style={area} className={cx(styles.cell, styles.feature)}>
            <div className={styles.featureBadge} style={{ '--accent': FEATURE_ACCENTS[index % FEATURE_ACCENTS.length] } as CSSProperties}>
                <Ui5Icon name="sys-enter-2" className={styles.featureIcon} />
            </div>
            <p className={cx(styles.featureText, styles.clamp4)}>{highlight}</p>
        </div>
    );

    const cells: BentoItem<CellDef>[] = [];
    cells.push({ w: 8, h: 5, weight: 5, data: { key: 'hero', type: 'hero', render: heroRender } });

    if (Object.keys(product.specs).length > 0) {
        cells.push({ w: 4, h: 6, weight: 5, data: { key: 'spec', type: 'spec', render: specRender } });
    }

    cells.push({ w: 3, h: 4, weight: 4, data: { key: 'product-photo', type: 'product', render: productRender } });

    if (product.videoUrl) {
        cells.push({ w: 4, h: 4, weight: 4, data: { key: 'video', type: 'video', render: videoRender } });
    }

    if (product.canViewPricing !== false) {
        cells.push({ w: 3, h: 3, weight: 4, data: { key: 'price', type: 'stat', render: priceRender } });
    }
    if (product.canViewPackaging !== false) {
        cells.push({ w: 3, h: 3, weight: 4, data: { key: 'packaging', type: 'stat', render: packagingRender } });
    }
    cells.push({
        w: 2,
        h: 2,
        weight: 2,
        data: { key: 'brand', type: 'info', render: (area) => factCell(area, 0, StorefrontIcon, product.brand, t('productDetail.brand')) },
    });
    cells.push({
        w: 2,
        h: 2,
        weight: 2,
        data: { key: 'category', type: 'info', render: (area) => factCell(area, 1, Icon, product.category, t('productDetail.category')) },
    });

    if (product.color) {
        const color = product.color;
        cells.push({
            w: 2,
            h: 2,
            weight: 2,
            data: { key: 'color', type: 'info', render: (area) => factCell(area, 2, PaletteIcon, color, 'สี') },
        });
    }

    if (product.discountNote) {
        cells.push({ w: 4, h: 3, weight: 3, data: { key: 'discount', type: 'discount', render: discountRender } });
    }

    product.highlights.forEach((highlight, index) => {
        cells.push({
            w: 3,
            h: 3,
            weight: 3,
            data: { key: `highlight-${index}`, type: 'feature', render: (area) => featureRender(area, index, highlight) },
        });
    });

    const narrowHeights: Partial<Record<CellType, number>> = { hero: 6, spec: 8, product: 5, video: 5 };
    const { cols, rowH } = computeBentoLayout(bentoWidth);
    const scaled = scaleBentoItems(cells, cols, (item) => narrowHeights[item.data.type]);
    const { placed, grid } = packBento(scaled, cols);
    const maxY = placed.reduce((m, p) => Math.max(m, p.y + p.h), 0);
    const gaps = findBentoGaps(grid, cols, maxY);

    const fillerPool: { label: string; value: string }[] =
        Object.keys(product.specs).length > 0
            ? Object.entries(product.specs).map(([label, value]) => ({ label, value }))
            : [
                  { label: t('productDetail.brand'), value: product.brand },
                  { label: t('productDetail.category'), value: product.category },
              ];

    return (
        <div className={styles.root} data-mode={mode}>
            <Head title={product.name} />
            {appBar}

            {/* Keyed by product id so clicking a related product (same page
                component, new props — no natural remount otherwise) still
                restarts the entrance animation instead of just snapping to
                the new content. */}
            <div key={product.id} className={styles.content}>
                <LocaleSwitchOverlay />
                <Button design="Transparent" icon="nav-back" className={styles.backButton} onClick={() => router.visit('/')}>
                    {t('productDetail.backToHome')}
                </Button>

                <div ref={bentoRef} className={styles.bento} style={{ gridTemplateColumns: `repeat(${cols}, 1fr)`, gridAutoRows: `${rowH}px` }}>
                    {placed.map((p) => cloneElement(p.data.render(gridArea(p.x, p.y, p.w, p.h)), { key: p.data.key }))}
                    {gaps.map((g, index) =>
                        cloneElement(
                            factCell(
                                gridArea(g.x, g.y, g.w, g.h),
                                index,
                                TuneIcon,
                                fillerPool[index % fillerPool.length].value,
                                fillerPool[index % fillerPool.length].label,
                                g.h,
                            ),
                            {
                                key: `gap-${g.x}-${g.y}`,
                            },
                        ),
                    )}
                </div>

                {related.length > 0 && (
                    <div>
                        <h2 className={styles.relatedTitle}>สินค้าที่เกี่ยวข้อง</h2>
                        <div className={styles.relatedGrid}>
                            {related.map((item) => (
                                <ProductCard key={item.id} product={item} />
                            ))}
                        </div>
                    </div>
                )}
            </div>

            <RouteTopProgressBar />
        </div>
    );
}
