import AppLogoIcon from '@/components/app-logo-icon';
import LocaleDropdown from '@/components/locale-dropdown';
import { LocaleSwitchOverlay } from '@/components/locale-switch-overlay';
import { ProductCard } from '@/components/product-card';
import SplashScreen from '@/components/splash-screen';
import { productCsvHeaders, productToCsvRow, type IconType, type Product } from '@/data/products';
import { reloadStorefrontLists, useStorefrontWatcher } from '@/hooks/use-storefront-watcher';
import { getCategoryIconName } from '@/lib/category-icon';
import { downloadCsv } from '@/lib/csv';
import { sapIcon } from '@/lib/sap-icon';
import { trackEvent } from '@/lib/track-event';
import { type SharedData } from '@/types';
import { Head, Link, router, usePage } from '@inertiajs/react';
import '@ui5/webcomponents-icons/dist/business-objects-experience.js';
import '@ui5/webcomponents-icons/dist/download.js';
import '@ui5/webcomponents-icons/dist/lab.js';
import '@ui5/webcomponents-icons/dist/log.js';
import '@ui5/webcomponents-icons/dist/search.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-left.js';
import '@ui5/webcomponents-icons/dist/slim-arrow-right.js';
import '@ui5/webcomponents-icons/dist/tag.js';
import '@ui5/webcomponents-icons/dist/tools-opportunity.js';
import { Button, Icon, Input, Text, Title } from '@ui5/webcomponents-react';
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import styles from './home.module.css';

// How many product cards to render on first paint, and how many more each
// time the load-more sentinel scrolls into view. The full result set can be
// 150+ products — rendering every card up front is the single biggest
// main-thread cost on this page.
const INITIAL_VISIBLE = 24;
const LOAD_MORE_STEP = 24;

// SAP-icons names (side-effect imported above): science / construction / offer
const SLIDE_ICONS = ['lab', 'tools-opportunity', 'tag'];
const SLIDE_GRADIENTS = [
    'linear-gradient(135deg, #334155 0%, #1e293b 100%)',
    'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)',
    'linear-gradient(135deg, #EA580C 0%, #F97316 100%)',
];

// Below `sm` (600px) — same breakpoint the MUI theme used.
const COMPACT_QUERY = '(max-width: 599.98px)';

function useMediaQuery(query: string): boolean {
    return useSyncExternalStore(
        (onChange) => {
            if (typeof window === 'undefined' || !window.matchMedia) return () => {};
            const mql = window.matchMedia(query);
            mql.addEventListener('change', onChange);
            return () => mql.removeEventListener('change', onChange);
        },
        () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false),
        () => false,
    );
}

function HeroCarousel() {
    const { t } = useTranslation('home');
    const [index, setIndex] = useState(0);

    const slides: { title: string; subtitle: string; icon: string; gradient: string }[] = useMemo(
        () =>
            [1, 2, 3].map((n) => ({
                title: t(`slide${n}Title`),
                subtitle: t(`slide${n}Subtitle`),
                icon: SLIDE_ICONS[n - 1],
                gradient: SLIDE_GRADIENTS[n - 1],
            })),
        [t],
    );

    useEffect(() => {
        const timer = setInterval(() => setIndex((current) => (current + 1) % slides.length), 5000);
        return () => clearInterval(timer);
    }, []);

    const go = (delta: number) => setIndex((current) => (current + delta + slides.length) % slides.length);

    const slide = slides[index];

    return (
        <div className={styles.hero} style={{ background: slide.gradient }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', zIndex: 1, maxWidth: 480 }}>
                <div style={{ fontSize: '2.125rem', fontWeight: 700, lineHeight: 1.235 }}>{slide.title}</div>
                <div style={{ fontSize: '1rem', opacity: 0.9, lineHeight: 1.5 }}>{slide.subtitle}</div>
            </div>

            <Icon name={slide.icon} className={styles.heroIcon} />

            <button type="button" className={styles.heroArrow} style={{ left: 8 }} onClick={() => go(-1)} aria-label="Previous slide">
                <Icon name="slim-arrow-left" style={{ width: 18, height: 18, color: '#fff' }} />
            </button>
            <button type="button" className={styles.heroArrow} style={{ right: 8 }} onClick={() => go(1)} aria-label="Next slide">
                <Icon name="slim-arrow-right" style={{ width: 18, height: 18, color: '#fff' }} />
            </button>

            <div style={{ display: 'flex', gap: '0.5rem', position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)' }}>
                {slides.map((_, i) => (
                    <div
                        key={i}
                        className={styles.dot}
                        onClick={() => setIndex(i)}
                        style={{ width: i === index ? 20 : 8, background: i === index ? '#fff' : 'rgba(255,255,255,0.5)' }}
                    />
                ))}
            </div>
        </div>
    );
}

function CategoryStrip({
    categories,
    selected,
    onSelect,
}: {
    categories: { label: string; icon: IconType }[];
    selected: string | null;
    onSelect: (label: string) => void;
}) {
    const { t } = useTranslation();
    const scrollRef = useRef<HTMLDivElement>(null);
    const [canScrollLeft, setCanScrollLeft] = useState(false);
    const [canScrollRight, setCanScrollRight] = useState(false);

    // โชว์ลูกศรเฉพาะฝั่งที่ยังเลื่อนไปได้จริง — คำนวณใหม่ทุกครั้งที่เลื่อน/ขนาด
    // เปลี่ยน/รายการหมวดหมู่เปลี่ยน (-1 กันเศษ subpixel ตอนเลื่อนสุดขวา)
    const updateArrows = () => {
        const el = scrollRef.current;
        if (!el) return;
        setCanScrollLeft(el.scrollLeft > 0);
        setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };

    useEffect(() => {
        updateArrows();
        const el = scrollRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const observer = new ResizeObserver(updateArrows);
        observer.observe(el);
        return () => observer.disconnect();
    }, [categories]);

    const scrollByPage = (direction: -1 | 1) => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollBy({ left: direction * el.clientWidth * 0.8, behavior: 'smooth' });
    };

    const fadeStyle = (side: 'left' | 'right') => ({
        [side]: 0,
        background: `linear-gradient(to ${side === 'left' ? 'right' : 'left'}, var(--sapBackgroundColor), transparent)`,
    });

    return (
        <div style={{ position: 'relative' }}>
            {canScrollLeft && <div className={styles.stripFade} style={fadeStyle('left')} />}
            {canScrollLeft && (
                <Button
                    design="Transparent"
                    icon="slim-arrow-left"
                    onClick={() => scrollByPage(-1)}
                    accessibleName={t('scrollLeft')}
                    tooltip={t('scrollLeft')}
                    className={styles.stripArrow}
                    style={{ left: 0 }}
                />
            )}

            <div ref={scrollRef} onScroll={updateArrows} className={styles.stripScroller}>
                {categories.map(({ label, icon: CategoryIcon }) => (
                    <button
                        key={label}
                        type="button"
                        aria-pressed={selected === label}
                        className={`${styles.chip} ${selected === label ? styles.chipSelected : ''}`}
                        onClick={() => onSelect(label)}
                    >
                        <CategoryIcon fontSize="small" style={{ color: 'currentColor' }} />
                        {label}
                    </button>
                ))}
            </div>

            {canScrollRight && <div className={styles.stripFade} style={fadeStyle('right')} />}
            {canScrollRight && (
                <Button
                    design="Transparent"
                    icon="slim-arrow-right"
                    onClick={() => scrollByPage(1)}
                    accessibleName={t('scrollRight')}
                    tooltip={t('scrollRight')}
                    className={styles.stripArrow}
                    style={{ right: 0 }}
                />
            )}
        </div>
    );
}

export default function Home({
    products,
    categories,
    topViewedProducts = [],
}: {
    products: Product[];
    categories: string[];
    topViewedProducts?: Product[];
}) {
    const { t } = useTranslation('home');
    const { auth } = usePage<SharedData>().props;
    // Below `sm` the shell bar has no room for a full-width wordmark + button
    // label — collapse the wordmark and swap the CTA for an icon-only button
    // (same "shrink to icon" convention as ShellSearch/AppSidebarHeader).
    const isCompact = useMediaQuery(COMPACT_QUERY);
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
    const loadMoreRef = useRef<HTMLDivElement | null>(null);
    const [showSplash, setShowSplash] = useState(true);
    const [splashExiting, setSplashExiting] = useState(false);

    useEffect(() => {
        // The splash is a first-impression flourish, not a loading gate — the
        // product data is already in the Inertia props by the time this renders.
        // Show it once per browser session; on every later client-side visit to
        // home, drop it on the first effect tick so the page isn't held behind a
        // ~1.3s animation it doesn't need.
        if (window.sessionStorage.getItem('home-splash-shown')) {
            setShowSplash(false);
            return;
        }
        window.sessionStorage.setItem('home-splash-shown', '1');
        const exitTimer = setTimeout(() => setSplashExiting(true), 900);
        const hideTimer = setTimeout(() => setShowSplash(false), 1300);
        return () => {
            clearTimeout(exitTimer);
            clearTimeout(hideTimer);
        };
    }, []);

    const categoryOptions = useMemo(() => categories.map((label) => ({ label, icon: sapIcon(getCategoryIconName(label)) })), [categories]);
    const popularIds = useMemo(() => new Set(topViewedProducts.map((product) => product.id)), [topViewedProducts]);

    useStorefrontWatcher(reloadStorefrontLists);

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        return products.filter((product) => {
            const matchesCategory = !selectedCategory || product.category === selectedCategory;
            const matchesQuery = !query || product.name.toLowerCase().includes(query) || product.category.toLowerCase().includes(query);
            return matchesCategory && matchesQuery;
        });
    }, [products, selectedCategory, search]);

    // Collapse the visible window back to the first page whenever the filter or
    // search changes, then grow it as the sentinel below the grid scrolls in.
    useEffect(() => {
        setVisibleCount(INITIAL_VISIBLE);
    }, [selectedCategory, search]);

    useEffect(() => {
        const sentinel = loadMoreRef.current;
        if (!sentinel) return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries[0]?.isIntersecting) {
                    setVisibleCount((current) => current + LOAD_MORE_STEP);
                }
            },
            { rootMargin: '800px' },
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
        // Re-created after each bump: observe() re-fires with the current
        // intersection state, so the grid keeps filling until the sentinel is
        // pushed out of view rather than stalling when it stays on screen.
    }, [filtered.length, visibleCount]);

    const visible = useMemo(() => filtered.slice(0, visibleCount), [filtered, visibleCount]);

    const handleExport = () => {
        const filename = `products-${selectedCategory ?? 'all'}.csv`;
        downloadCsv(filename, productCsvHeaders, filtered.map(productToCsvRow));
    };

    const actions = !auth.user ? (
        isCompact ? (
            <Button
                design="Transparent"
                icon="log"
                tooltip={t('signIn')}
                accessibleName={t('signIn')}
                onClick={() => router.visit(route('login'))}
                style={{ color: 'var(--sapShell_InteractiveTextColor)' }}
            />
        ) : (
            <Button design="Transparent" icon="log" onClick={() => router.visit(route('login'))} style={{ borderRadius: '50px', fontWeight: 600 }}>
                {t('signIn')}
            </Button>
        )
    ) : isCompact ? (
        <Button
            icon="business-objects-experience"
            tooltip={t('goToDashboard')}
            accessibleName={t('goToDashboard')}
            onClick={() => router.visit(route('dashboard'))}
        />
    ) : (
        // Shell-bar CTA — a standard UI5 Button so it reads as part of the
        // Horizon shell rather than an unrelated page button, matching the
        // compact icon variant above.
        <Button icon="business-objects-experience" onClick={() => router.visit(route('dashboard'))} style={{ fontWeight: 600 }}>
            {t('goToDashboard')}
        </Button>
    );

    return (
        <div className={styles.root}>
            <Head title="Home" />
            {showSplash && <SplashScreen exiting={splashExiting} />}
            {/* Fiori Horizon shell bar — same --sapShell* tokens as
                <AppSidebarHeader>, so the storefront header and the admin
                header read as one design system rather than two. */}
            <header className={styles.shellBar}>
                <Link href="/" className={styles.brandLink}>
                    <span style={{ color: 'var(--sapBrandColor)', display: 'flex', flexShrink: 0 }}>
                        <AppLogoIcon style={{ width: 40, height: 40, fill: 'currentColor' }} />
                    </span>
                    {/* Wordmark collapses below `sm` — the logo mark alone carries
                        the brand there, freeing room for the language switcher +
                        CTA so they don't overlap on a phone-width shell bar. */}
                    <span className={styles.wordmark}>
                        PIM <span style={{ fontWeight: 800, color: '#FF7F50' }}>Pumpkin</span>
                    </span>
                </Link>

                <div style={{ flex: 1 }} />

                <div className={styles.shellActions}>
                    <LocaleDropdown />
                    {actions}
                </div>
            </header>

            <div className={styles.content}>
                <LocaleSwitchOverlay />
                <HeroCarousel />

                <div>
                    <Title level="H5" style={{ fontWeight: 700, marginBottom: '0.75rem' }}>
                        {t('categoriesHeading')}
                    </Title>
                    <CategoryStrip
                        categories={categoryOptions}
                        selected={selectedCategory}
                        onSelect={(label) =>
                            setSelectedCategory((current) => {
                                const next = current === label ? null : label;
                                if (next) {
                                    trackEvent({ eventType: 'category_select', category: next });
                                }
                                return next;
                            })
                        }
                    />
                </div>

                <div>
                    <div
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            flexWrap: 'wrap',
                            gap: '0.75rem',
                            marginBottom: '0.75rem',
                        }}
                    >
                        <div>
                            <Title level="H5" style={{ fontWeight: 700 }}>
                                {t('productListHeading')}
                            </Title>
                            <Text style={{ color: 'var(--sapContent_LabelColor)' }}>
                                {t('totalItems', { count: filtered.length })}
                                {selectedCategory && t('categoryFilterSuffix', { category: selectedCategory })}
                            </Text>
                        </div>
                        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                            <Input
                                placeholder={t('searchPlaceholder')}
                                accessibleName={t('searchPlaceholder')}
                                value={search}
                                onInput={(event) => setSearch(event.target.value)}
                                icon={<Icon name="search" />}
                            />
                            <Button icon="download" onClick={handleExport} disabled={filtered.length === 0}>
                                {selectedCategory ? t('exportCategory') : t('exportAll')}
                            </Button>
                        </div>
                    </div>
                    <div className={styles.productGrid}>
                        {visible.map((product) => (
                            <ProductCard key={product.id} product={product} popular={popularIds.has(product.id)} />
                        ))}
                        {filtered.length === 0 && (
                            <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '2rem 0', color: 'var(--sapContent_LabelColor)' }}>
                                {t('noResults')}
                            </div>
                        )}
                    </div>
                    {visibleCount < filtered.length && <div ref={loadMoreRef} style={{ height: 1, width: '100%' }} />}
                </div>
            </div>
        </div>
    );
}
