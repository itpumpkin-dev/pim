import { ProductCard } from '@/components/product-card';
import { productCsvHeaders, products, productToCsvRow, type IconType } from '@/data/products';
import AppLayout from '@/layouts/app-layout';
import { downloadCsv } from '@/lib/csv';
import { type BreadcrumbItem } from '@/types';
import { Head } from '@inertiajs/react';
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
import { alpha, Box, Button, Chip, IconButton, InputAdornment, Paper, Stack, TextField, Typography } from '@mui/material';
import { useEffect, useMemo, useState } from 'react';

const breadcrumbs: BreadcrumbItem[] = [
    {
        title: 'Home',
        href: '/home',
    },
];

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
    const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
    const [search, setSearch] = useState('');

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

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title="Home" />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, p: 2 }}>
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
                    {filtered.length === 0 ? (
                        <Typography variant="body2" color="text.secondary" sx={{ textAlign: 'center', py: 4 }}>
                            ไม่พบสินค้าที่ค้นหา
                        </Typography>
                    ) : (
                        <Box
                            sx={{
                                columnCount: { xs: 2, sm: 3, md: 4, lg: 5 },
                                columnGap: 2,
                            }}
                        >
                            {filtered.map((product) => (
                                <ProductCard key={product.id} product={product} />
                            ))}
                        </Box>
                    )}
                </Box>
            </Box>
        </AppLayout>
    );
}
