import { ProductCard } from '@/components/product-card';
import { currency, findProduct, products } from '@/data/products';
import AppLogoIcon from '@/components/app-logo-icon';
import { type SharedData } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LoginIcon from '@mui/icons-material/Login';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import { alpha, AppBar, Box, Button, Chip, Paper, Skeleton, Stack, Toolbar, Typography } from '@mui/material';
import { useEffect, useState } from 'react';

export default function ProductShow({ id }: { id: number }) {
    const { auth } = usePage<SharedData>().props;
    const product = findProduct(id);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        const timer = setTimeout(() => {
            setLoading(false);
        }, 800);
        return () => clearTimeout(timer);
    }, [id]);

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
                px: 3,
                py: 1,
                color: '#fff',
                background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
                boxShadow: '0 4px 14px 0 rgba(234, 88, 12, 0.39)',
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                    transform: 'translateY(-2px)',
                    boxShadow: '0 6px 20px rgba(234, 88, 12, 0.5)',
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

    const TopBar = () => (
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
    );

    if (!product) {
        return (
            <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
                <TopBar />
                <Head title="ไม่พบสินค้า" />
                <Stack spacing={2} alignItems="flex-start" sx={{ p: 4, flex: 1, width: '100%' }}>
                    <Typography variant="h6">ไม่พบสินค้าที่คุณต้องการ</Typography>
                    <Button component={Link} href="/" startIcon={<ArrowBackIcon />}>
                        กลับหน้า Home
                    </Button>
                </Stack>
            </Box>
        );
    }

    const Icon = product.icon;
    const related = products.filter((item) => item.category === product.category && item.id !== product.id).slice(0, 4);

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
            <TopBar />
            <Head title={product.name} />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, p: { xs: 2, md: 4 }, flex: 1, width: '100%' }}>
                <Button component={Link} href="/" startIcon={<ArrowBackIcon />} size="large" sx={{ alignSelf: 'flex-start' }}>
                    กลับ
                </Button>

                {loading ? (
                    <Box
                        sx={{
                            display: 'grid',
                            gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(6, 1fr)', md: 'repeat(12, 1fr)' },
                            gridAutoRows: 'minmax(90px, auto)',
                            gridAutoFlow: 'dense',
                            gap: 1.25,
                        }}
                    >
                        {/* hero skeleton */}
                        <Skeleton variant="rectangular" sx={{ gridColumn: { xs: 'span 2', sm: 'span 6', md: 'span 8' }, gridRow: { md: 'span 3' }, borderRadius: 5, minHeight: 320 }} />
                        
                        {/* image skeleton */}
                        <Skeleton variant="rectangular" sx={{ gridColumn: { xs: 'span 2', sm: 'span 6', md: 'span 4' }, gridRow: { md: 'span 3' }, borderRadius: 5, minHeight: 320 }} />
                        
                        {/* price skeleton */}
                        <Skeleton variant="rectangular" sx={{ gridColumn: { xs: 'span 1', sm: 'span 3', md: 'span 3' }, gridRow: { md: 'span 2' }, borderRadius: 5, minHeight: 120 }} />
                        
                        {/* packaging skeleton */}
                        <Skeleton variant="rectangular" sx={{ gridColumn: { xs: 'span 1', sm: 'span 3', md: 'span 3' }, gridRow: { md: 'span 2' }, borderRadius: 5, minHeight: 120 }} />

                        {/* brand skeleton */}
                        <Skeleton variant="rectangular" sx={{ gridColumn: { xs: 'span 1', sm: 'span 3', md: 'span 2' }, gridRow: { md: 'span 2' }, borderRadius: 5, minHeight: 120 }} />
                        
                        {/* category skeleton */}
                        <Skeleton variant="rectangular" sx={{ gridColumn: { xs: 'span 1', sm: 'span 3', md: 'span 2' }, gridRow: { md: 'span 2' }, borderRadius: 5, minHeight: 120 }} />
                        
                        {/* color skeleton */}
                        <Skeleton variant="rectangular" sx={{ gridColumn: { xs: 'span 1', sm: 'span 3', md: 'span 2' }, gridRow: { md: 'span 2' }, borderRadius: 5, minHeight: 120 }} />
                    </Box>
                ) : (
                    <>
                        <Box
                            sx={{
                                display: 'grid',
                                gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(6, 1fr)', md: 'repeat(12, 1fr)' },
                                gridAutoRows: 'minmax(90px, auto)',
                                gridAutoFlow: 'dense',
                                gap: 1.25,
                            }}
                        >
                    {/* hero */}
                    <Box
                        sx={{
                            gridColumn: { xs: 'span 2', sm: 'span 6', md: 'span 8' },
                            gridRow: { md: 'span 3' },
                            position: 'relative',
                            overflow: 'hidden',
                            borderRadius: 5,
                            p: { xs: 3, md: 4 },
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'space-between',
                            background: (theme) =>
                                theme.palette.mode === 'dark'
                                    ? 'linear-gradient(135deg, #1a1a24 0%, #0f0f18 100%)'
                                    : 'linear-gradient(135deg, #1f2430 0%, #12141c 100%)',
                            color: '#fff',
                            '&::before': {
                                content: '""',
                                position: 'absolute',
                                right: -100,
                                top: -100,
                                width: 420,
                                height: 420,
                                borderRadius: '50%',
                                background: (theme) => `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.35)}, transparent 65%)`,
                                pointerEvents: 'none',
                            },
                        ),
                    )}
                </Box>

                {related.length > 0 && (
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>
                            สินค้าที่เกี่ยวข้อง
                        </Typography>
                        <Box sx={{ columnCount: { xs: 2, sm: 3, md: 4 }, columnGap: 2 }}>
                            {related.map((item) => (
                                <ProductCard key={item.id} product={item} />
                            ))}
                        </Box>
                    </Box>
                )}
                    </>
                )}
            </Box>
        </Box>
    );
}

