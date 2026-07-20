import { ProductCard } from '@/components/product-card';
import { productCsvHeaders, products, productToCsvRow, type IconType } from '@/data/products';
import AppLogoIcon from '@/components/app-logo-icon';
import { downloadCsv } from '@/lib/csv';
import { type BreadcrumbItem, type SharedData } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import ArrowBackIosNewIcon from '@mui/icons-material/ArrowBackIosNew';
import ArrowForwardIosIcon from '@mui/icons-material/ArrowForwardIos';
import BlurOnIcon from '@mui/icons-material/BlurOn';
import BuildIcon from '@mui/icons-material/Build';
import CleaningServicesIcon from '@mui/icons-material/CleaningServices';
import ColorizeIcon from '@mui/icons-material/Colorize';
import ConstructionIcon from '@mui/icons-material/Construction';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import HandymanIcon from '@mui/icons-material/Handyman';
import LayersIcon from '@mui/icons-material/Layers';
import LocalFireDepartmentIcon from '@mui/icons-material/LocalFireDepartment';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import OpacityIcon from '@mui/icons-material/Opacity';
import PrecisionManufacturingIcon from '@mui/icons-material/PrecisionManufacturing';
import ScienceIcon from '@mui/icons-material/Science';
import SearchIcon from '@mui/icons-material/Search';
import WaterDropIcon from '@mui/icons-material/WaterDrop';
import LoginIcon from '@mui/icons-material/Login';
import { alpha, AppBar, Box, Button, Chip, IconButton, InputAdornment, Paper, Skeleton, Stack, TextField, Toolbar, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';



const slides: { title: string; subtitle: string; icon: IconType; gradient: string }[] = [
    {
        title: 'คลังข้อมูลสินค้าเคมีภัณฑ์และกาว',
        subtitle: 'รวมข้อมูลสเปค ราคา และรายละเอียดสินค้าจากซูดาล ซันนิค และพัมคินไว้ในที่เดียว',
        icon: ScienceIcon,
        gradient: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
    },
    {
        title: 'จัดหมวดหมู่สินค้าอย่างเป็นระบบ',
        subtitle: 'ค้นหาและอ้างอิงข้อมูลสินค้าตามหมวดหมู่ได้อย่างรวดเร็วและเป็นระเบียบ',
        icon: ConstructionIcon,
        gradient: 'linear-gradient(135deg, #ea580c 0%, #f59e0b 100%)',
    },
    {
        title: 'ตรวจสอบราคาและส่วนลดได้ง่าย',
        subtitle: 'ดูราคาต่อหน่วยและส่วนลดตามจำนวนสั่งซื้อของแต่ละสินค้าได้ทันที',
        icon: LocalOfferOutlinedIcon,
        gradient: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)',
    },
];

const categories: { label: string; icon: IconType }[] = [
    { label: 'กาวยาแนว MS-Polymer', icon: ScienceIcon },
    { label: 'กาวตะปู', icon: ConstructionIcon },
    { label: 'ซิลิโคน', icon: WaterDropIcon },
    { label: 'โพลียูรีเทนยาแนว', icon: OpacityIcon },
    { label: 'พียูโฟม', icon: BlurOnIcon },
    { label: 'อุปกรณ์ทำความสะอาด', icon: CleaningServicesIcon },
    { label: 'ปืนยาแนว/ปืนยิงโฟม', icon: HandymanIcon },
    { label: 'น้ำยาล็อกเกลียว/ตรึงเพลา', icon: PrecisionManufacturingIcon },
    { label: 'กาวร้อน', icon: LocalFireDepartmentIcon },
    { label: 'เทปซ่อมแซม', icon: LayersIcon },
    { label: 'กาวอะคริลิคยาแนว', icon: ColorizeIcon },
    { label: 'กาวอีพ็อกซี่/เอนกประสงค์', icon: BuildIcon },
];

function HeroCarousel() {
    const [index, setIndex] = useState(0);

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

function CategoryStrip({ selected, onSelect }: { selected: string | null; onSelect: (label: string) => void }) {
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

export default function Home() {
    const { auth } = usePage<SharedData>().props;
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const timer = setTimeout(() => {
            setLoading(false);
        }, 800);
        return () => clearTimeout(timer);
    }, []);

    const filtered = useMemo(() => {
        const query = search.trim().toLowerCase();
        return products.filter((product) => {
            const matchesCategory = !selectedCategory || product.category === selectedCategory;
            const matchesQuery = !query || product.name.toLowerCase().includes(query) || product.category.toLowerCase().includes(query);
            return matchesCategory && matchesQuery;
        });
    }, [selectedCategory, search]);

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
                background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                // boxShadow: '0 4px 14px 0 rgba(234, 88, 12, 0.39)',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                    transform: 'translateY(-2px)',
                    // boxShadow: '0 6px 20px rgba(234, 88, 12, 0.5)',
                    background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
                },
            }}
        >
            Sign in
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
                color: '#ea580c',
                borderColor: '#ea580c',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                    borderWidth: 2,
                    borderColor: '#c2410c',
                    bgcolor: alpha('#ea580c', 0.08),
                    transform: 'translateY(-2px)',
                },
            }}
        >
            ไปที่ Dashboard
        </Button>
    );

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
            <Head title="Home" />
            <AppBar position="sticky" color="inherit" elevation={1}>
                <Toolbar sx={{ justifyContent: 'space-between' }}>
                    <Box component={Link} href="/" sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none', color: 'inherit' }}>
                        <Box sx={{ color: 'primary.main', display: 'flex' }}>
                            <AppLogoIcon style={{ width: 32, height: 32, fill: 'currentColor' }} />
                        </Box>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            PIM <Box component="span" sx={{ fontWeight: 800, color: 'primary.main' }}>Pumpkin</Box>
                        </Typography>
                    </Box>
                    {actions}
                </Toolbar>
            </AppBar>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, p: { xs: 2, md: 4 }, flex: 1, width: '100%' }}>
                {loading ? (
                    <>
                        {/* Carousel Skeleton */}
                        <Skeleton variant="rectangular" height={220} sx={{ borderRadius: 3 }} />

                        <Box>
                            <Skeleton variant="text" width={150} height={32} sx={{ mb: 1.5 }} />
                            <Stack direction="row" spacing={1.5} sx={{ overflow: 'hidden' }}>
                                {[...Array(6)].map((_, i) => (
                                    <Skeleton key={i} variant="rounded" width={120} height={40} sx={{ borderRadius: 3, flexShrink: 0 }} />
                                ))}
                            </Stack>
                        </Box>

                        <Box>
                            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1.5 }}>
                                <Box>
                                    <Skeleton variant="text" width={120} height={32} />
                                    <Skeleton variant="text" width={200} height={20} />
                                </Box>
                                <Stack direction="row" spacing={1.5} sx={{ display: { xs: 'none', md: 'flex' } }}>
                                    <Skeleton variant="rounded" width={200} height={40} />
                                    <Skeleton variant="rounded" width={120} height={40} />
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
                                {[...Array(8)].map((_, i) => (
                                    <Skeleton key={i} variant="rectangular" height={280} sx={{ borderRadius: 3 }} />
                                ))}
                            </Box>
                        </Box>
                    </>
                ) : (
                    <>
                        <HeroCarousel />

                        <Box>
                            <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>
                                หมวดหมู่สินค้า
                            </Typography>
                            <CategoryStrip
                                selected={selectedCategory}
                                onSelect={(label) => setSelectedCategory((current) => (current === label ? null : label))}
                            />
                        </Box>

                        <Box>
                            <Stack direction="row" alignItems="center" justifyContent="space-between" flexWrap="wrap" gap={1.5} sx={{ mb: 1.5 }}>
                                <Box>
                                    <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                        รายการสินค้า
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        ทั้งหมด {filtered.length} รายการ
                                        {selectedCategory && ` · หมวดหมู่ "${selectedCategory}"`}
                                    </Typography>
                                </Box>
                                <Stack direction="row" spacing={1.5}>
                                    <TextField
                                        size="small"
                                        placeholder="ค้นหาสินค้าหรือหมวดหมู่"
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
                                        {`Export ${selectedCategory ? 'หมวดหมู่นี้' : 'ทั้งหมด'}`}
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
                                {filtered.map((product) => (
                                    <ProductCard key={product.id} product={product} />
                                ))}
                                {filtered.length === 0 && (
                                    <Typography variant="body2" color="text.secondary" sx={{ gridColumn: '1 / -1', textAlign: 'center', py: 4 }}>
                                        ไม่พบสินค้าที่ค้นหา
                                    </Typography>
                                )}
                            </Box>
                        </Box>
                    </>
                )}
            </Box>
        </Box>
    );
}
