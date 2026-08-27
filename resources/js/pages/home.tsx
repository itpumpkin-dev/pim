import AppLogoIcon from '@/components/app-logo-icon';
import LocaleDropdown from '@/components/locale-dropdown';
import { ProductCard } from '@/components/product-card';
import SplashScreen from '@/components/splash-screen';
import { productCsvHeaders, productToCsvRow, type IconType, type Product } from '@/data/products';
import { reloadStorefrontLists, useStorefrontWatcher } from '@/hooks/use-storefront-watcher';
import { getCategoryIcon } from '@/lib/category-icon';
import { downloadCsv } from '@/lib/csv';
import { trackEvent } from '@/lib/track-event';
import { type SharedData } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import ConstructionIcon from '@mui/icons-material/Construction';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import LoginIcon from '@mui/icons-material/Login';
import ScienceIcon from '@mui/icons-material/Science';
import SearchIcon from '@mui/icons-material/Search';
import { alpha, AppBar, Box, Button, Chip, IconButton, InputAdornment, Paper, Stack, TextField, Toolbar, Typography } from '@mui/material';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

// How many product cards to render on first paint, and how many more each
// time the load-more sentinel scrolls into view. The full result set can be
// 150+ products — rendering every MUI card up front is the single biggest
// main-thread cost on this page.
const INITIAL_VISIBLE = 24;
const LOAD_MORE_STEP = 24;

const SLIDE_ICONS: IconType[] = [ScienceIcon, ConstructionIcon, LocalOfferOutlinedIcon];
const SLIDE_GRADIENTS = [
    'linear-gradient(135deg, #334155 0%, #1e293b 100%)',
    'linear-gradient(135deg, #06B6D4 0%, #0891B2 100%)',
    'linear-gradient(135deg, #EA580C 0%, #F97316 100%)',
];

function HeroCarousel() {
    const { t } = useTranslation('home');
    const [index, setIndex] = useState(0);

    const slides: { title: string; subtitle: string; icon: IconType; gradient: string }[] = useMemo(
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
    const SlideIcon = slide.icon;

    return (
        <Paper
            elevation={0}
            sx={{
                position: 'relative',
                overflow: 'hidden',
                borderRadius: 3,
                minHeight: 220,
                display: 'flex',
                alignItems: 'center',
                background: slide.gradient,
                transition: 'background 0.6s ease',
                color: '#fff',
                px: { xs: 3, md: 6 },
            }}
        >
            <Stack spacing={2} sx={{ zIndex: 1, maxWidth: 480 }}>
                <Typography variant="h4" sx={{ fontWeight: 700 }}>
                    {slide.title}
                </Typography>
                <Typography variant="body1" sx={{ opacity: 0.9 }}>
                    {slide.subtitle}
                </Typography>
            </Stack>

            <SlideIcon
                sx={{
                    position: 'absolute',
                    right: { xs: -30, md: 20 },
                    top: '50%',
                    transform: 'translateY(-50%)',
                    fontSize: { xs: 160, md: 220 },
                    opacity: 0.18,
                }}
            />

            <IconButton
                onClick={() => go(-1)}
                size="small"
                sx={{
                    position: 'absolute',
                    left: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#fff',
                    bgcolor: alpha('#000', 0.15),
                    '&:hover': { bgcolor: alpha('#000', 0.3) },
                }}
            >
                <ArrowBackIosNewIcon fontSize="small" />
            </IconButton>
            <IconButton
                onClick={() => go(1)}
                size="small"
                sx={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: '#fff',
                    bgcolor: alpha('#000', 0.15),
                    '&:hover': { bgcolor: alpha('#000', 0.3) },
                }}
            >
                <ArrowForwardIosIcon fontSize="small" />
            </IconButton>

            <Stack direction="row" spacing={1} sx={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)' }}>
                {slides.map((_, i) => (
                    <Box
                        key={i}
                        onClick={() => setIndex(i)}
                        sx={{
                            width: i === index ? 20 : 8,
                            height: 8,
                            borderRadius: 4,
                            bgcolor: i === index ? '#fff' : alpha('#fff', 0.5),
                            cursor: 'pointer',
                            transition: 'width 0.3s ease',
                        }}
                    />
                ))}
            </Stack>
        </Paper>
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
    return (
        <Stack direction="row" spacing={1.5} sx={{ overflowX: 'auto', pb: 1, '&::-webkit-scrollbar': { height: 6 } }}>
            {categories.map(({ label, icon: Icon }) => (
                <Chip
                    key={label}
                    icon={<Icon fontSize="small" />}
                    label={label}
                    variant={selected === label ? 'filled' : 'outlined'}
                    color={selected === label ? 'primary' : 'default'}
                    onClick={() => onSelect(label)}
                    sx={{
                        flexShrink: 0,
                        py: 2.5,
                        px: 0.5,
                        borderRadius: 3,
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                        '&:hover': { transform: 'translateY(-2px)', boxShadow: 2 },
                    }}
                />
            ))}
        </Stack>
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

    const categoryOptions = useMemo(() => categories.map((label) => ({ label, icon: getCategoryIcon(label) })), [categories]);
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
        <Button
            component={Link}
            href={route('login')}
            variant="contained"
            startIcon={<LoginIcon />}
            sx={{
                borderRadius: '50px',
                textTransform: 'none',
                fontWeight: 600,
                px: 2,
                py: 1,
                color: '#fff',
                background: 'linear-gradient(135deg, #FB923C 0%, #F97316 100%)',
                // boxShadow: '0 4px 14px 0 rgba(234, 88, 12, 0.39)',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                    transform: 'translateY(-2px)',
                    // boxShadow: '0 6px 20px rgba(234, 88, 12, 0.5)',
                    background: 'linear-gradient(135deg, #FB923C 0%, #F97316 100%)',
                },
            }}
        >
            {t('signIn')}
        </Button>
    ) : (
        <Button
            component={Link}
            href={route('dashboard')}
            variant="outlined"
            sx={{
                borderRadius: '50px',
                textTransform: 'none',
                fontWeight: 600,
                px: 3,
                py: 1,
                borderWidth: 2,
                color: '',
                borderColor: '',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                    borderWidth: 2,
                    borderColor: '',
                    // bgcolor: alpha('', 0.08),
                    transform: 'translateY(-2px)',
                },
            }}
        >
            {t('goToDashboard')}
        </Button>
    );

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
            <Head title="Home" />
            {showSplash && <SplashScreen exiting={splashExiting} />}
            <AppBar position="sticky" color="inherit" elevation={1}>
                <Toolbar sx={{ justifyContent: 'space-between' }}>
                    <Box component={Link} href="/" sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none', color: 'inherit' }}>
                        <Box sx={{ color: 'primary.main', display: 'flex' }}>
                            <AppLogoIcon style={{ width: 46, height: 46, fill: 'currentColor' }} />
                        </Box>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            PIM{' '}
                            <Box component="span" sx={{ fontWeight: 800, color: 'primary.main' }}>
                                Pumpkin
                            </Box>
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={1.5} alignItems="center">
                        <LocaleDropdown />
                        {actions}
                    </Stack>
                </Toolbar>
            </AppBar>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, p: { xs: 2, md: 4 }, flex: 1, width: '100%' }}>
                <HeroCarousel />

                <Box>
                    <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>
                        {t('categoriesHeading')}
                    </Typography>
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
                </Box>

                <Box>
                    <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1.5} sx={{ mb: 1.5 }}>
                        <Box>
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                {t('productListHeading')}
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                {t('totalItems', { count: filtered.length })}
                                {selectedCategory && t('categoryFilterSuffix', { category: selectedCategory })}
                            </Typography>
                        </Box>
                        <Stack direction="row" spacing={1.5}>
                            <TextField
                                size="small"
                                placeholder={t('searchPlaceholder')}
                                value={search}
                                onChange={(event) => setSearch(event.target.value)}
                                slotProps={{
                                    input: {
                                        startAdornment: (
                                            <InputAdornment position="start">
                                                <SearchIcon fontSize="small" color="action" />
                                            </InputAdornment>
                                        ),
                                    },
                                }}
                            />
                            <Button
                                variant="outlined"
                                startIcon={<FileDownloadOutlinedIcon />}
                                onClick={handleExport}
                                disabled={filtered.length === 0}
                            >
                                {selectedCategory ? t('exportCategory') : t('exportAll')}
                            </Button>
                        </Stack>
                    </Stack>
                    <Box
                        sx={{
                            display: 'grid',
                            gap: 2,
                            gridTemplateColumns: {
                                xs: 'repeat(2, 1fr)',
                                sm: 'repeat(3, 1fr)',
                                md: 'repeat(4, 1fr)',
                            },
                        }}
                    >
                        {visible.map((product) => (
                            <ProductCard key={product.id} product={product} popular={popularIds.has(product.id)} />
                        ))}
                        {filtered.length === 0 && (
                            <Typography variant="body2" color="text.secondary" sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 4 }}>
                                {t('noResults')}
                            </Typography>
                        )}
                    </Box>
                    {visibleCount < filtered.length && <Box ref={loadMoreRef} sx={{ height: 1, width: '100%' }} />}
                </Box>
            </Box>
        </Box>
    );
}
