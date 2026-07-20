import { ProductCard } from '@/components/product-card';
import { currency, findProduct, products } from '@/data/products';
import AppLayout from '@/layouts/app-layout';
import { type BreadcrumbItem } from '@/types';
import { Head, Link } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import { alpha, Box, Button, Chip, Paper, Stack, Typography } from '@mui/material';

export default function ProductShow({ id }: { id: number }) {
    const product = findProduct(id);

    if (!product) {
        return (
            <AppLayout breadcrumbs={[{ title: 'Home', href: '/home' }]}>
                <Head title="ไม่พบสินค้า" />
                <Stack spacing={2} alignItems="flex-start" sx={{ p: 4 }}>
                    <Typography variant="h6">ไม่พบสินค้าที่คุณต้องการ</Typography>
                    <Button component={Link} href="/home" startIcon={<ArrowBackIcon />}>
                        กลับหน้า Home
                    </Button>
                </Stack>
            </AppLayout>
        );
    }

    const Icon = product.icon;
    const related = products.filter((item) => item.category === product.category && item.id !== product.id).slice(0, 4);

    const breadcrumbs: BreadcrumbItem[] = [
        { title: 'Home', href: '/home' },
        { title: product.category, href: '/home' },
        { title: product.name, href: `/products/${product.id}` },
    ];

    return (
        <AppLayout breadcrumbs={breadcrumbs}>
            <Head title={product.name} />
            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, p: 2 }}>
                <Button component={Link} href="/home" startIcon={<ArrowBackIcon />} size="small" sx={{ alignSelf: 'flex-start' }}>
                    กลับ
                </Button>

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
                        }}
                    >
                        <Box sx={{ position: 'relative', zIndex: 1 }}>
                            <Typography
                                variant="caption"
                                sx={{ color: 'primary.light', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}
                            >
                                {product.brand} · {product.category}
                            </Typography>
                            <Typography variant="h4" sx={{ fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1, mt: 1.5, maxWidth: 480 }}>
                                {product.name}
                            </Typography>
                            <Typography variant="body2" sx={{ opacity: 0.7, mt: 1.5, maxWidth: 440 }}>
                                {product.description}
                            </Typography>
                            <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 2, gap: 1 }}>
                                <Chip
                                    size="small"
                                    label={`SKU ${product.sku}`}
                                    sx={{ bgcolor: alpha('#fff', 0.08), color: '#fff', border: 1, borderColor: alpha('#fff', 0.1) }}
                                />
                                {product.color && (
                                    <Chip
                                        size="small"
                                        label={product.color}
                                        sx={{ bgcolor: alpha('#fff', 0.08), color: '#fff', border: 1, borderColor: alpha('#fff', 0.1) }}
                                    />
                                )}
                                {product.tag && <Chip size="small" label={product.tag} color={product.tagColor} sx={{ fontWeight: 700 }} />}
                            </Stack>
                        </Box>
                        <Stack direction="row" spacing={1.5} sx={{ position: 'relative', zIndex: 1, mt: 3 }}>
                            <Button
                                variant="contained"
                                startIcon={<EditOutlinedIcon />}
                                sx={{ borderRadius: 999, bgcolor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' } }}
                            >
                                แก้ไขข้อมูล
                            </Button>
                            <Button
                                variant="outlined"
                                startIcon={<PrintOutlinedIcon />}
                                sx={{ borderRadius: 999, color: '#fff', borderColor: alpha('#fff', 0.3), '&:hover': { borderColor: '#fff' } }}
                            >
                                พิมพ์ข้อมูล
                            </Button>
                        </Stack>
                    </Box>

                    {/* image */}
                    <Box
                        sx={{
                            gridColumn: { xs: 'span 2', sm: 'span 6', md: 'span 4' },
                            gridRow: { md: 'span 3' },
                            borderRadius: 5,
                            overflow: 'hidden',
                            display: 'flex',
                            flexDirection: 'column',
                            background: (theme) =>
                                theme.palette.mode === 'dark'
                                    ? 'linear-gradient(135deg, #2a2a35, #14141a)'
                                    : 'linear-gradient(135deg, #eef0f4, #dfe3ea)',
                            minHeight: { xs: 200, md: 'auto' },
                        }}
                    >
                        <Box sx={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
                            <Icon
                                sx={{
                                    fontSize: 120,
                                    color: (theme) => (theme.palette.mode === 'dark' ? alpha('#fff', 0.4) : 'text.disabled'),
                                }}
                            />
                        </Box>
                        <Stack spacing={0.25} sx={{ px: 2.5, pb: 2.5 }}>
                            <Typography
                                variant="caption"
                                sx={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.05em', color: 'primary.main' }}
                            >
                                {product.sku}
                            </Typography>
                            <Typography
                                variant="body2"
                                sx={{ fontWeight: 700, color: (theme) => (theme.palette.mode === 'dark' ? '#fff' : 'text.primary') }}
                            >
                                {product.name}
                            </Typography>
                        </Stack>
                    </Box>

                    {/* price stat */}
                    <Box
                        sx={{
                            gridColumn: { xs: 'span 1', sm: 'span 3', md: 'span 3' },
                            gridRow: { md: 'span 2' },
                            borderRadius: 5,
                            p: 2.5,
                            bgcolor: 'primary.main',
                            color: 'primary.contrastText',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                        }}
                    >
                        <PaidOutlinedIcon sx={{ opacity: 0.85, mb: 0.5 }} />
                        <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1 }}>
                            {currency(product.price)}
                        </Typography>
                        <Typography
                            variant="caption"
                            sx={{ opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, mt: 1 }}
                        >
                            ราคาต่อหน่วย
                        </Typography>
                    </Box>

                    {/* packaging stat */}
                    <Box
                        sx={{
                            gridColumn: { xs: 'span 1', sm: 'span 3', md: 'span 3' },
                            gridRow: { md: 'span 2' },
                            borderRadius: 5,
                            p: 2.5,
                            bgcolor: (theme) => (theme.palette.mode === 'dark' ? '#000' : 'grey.900'),
                            color: '#fff',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                        }}
                    >
                        <Inventory2OutlinedIcon sx={{ opacity: 0.75, mb: 0.5 }} />
                        <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1 }}>
                            {product.packQty}
                            <Typography component="span" variant="body1" sx={{ fontWeight: 700, opacity: 0.75, ml: 0.5 }}>
                                {product.packUnit}/ลัง
                            </Typography>
                        </Typography>
                        <Typography
                            variant="caption"
                            sx={{ opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, mt: 1 }}
                        >
                            ขนาดบรรจุ {product.size}
                        </Typography>
                    </Box>

                    {/* brand tile */}
                    <Box
                        sx={{
                            gridColumn: { xs: 'span 1', sm: 'span 3', md: 'span 2' },
                            gridRow: { md: 'span 2' },
                            borderRadius: 5,
                            p: 2,
                            bgcolor: 'secondary.main',
                            color: 'secondary.contrastText',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                        }}
                    >
                        <StorefrontOutlinedIcon fontSize="small" sx={{ opacity: 0.85, mb: 0.5 }} />
                        <Typography variant="subtitle2" sx={{ fontWeight: 900, lineHeight: 1.2 }}>
                            {product.brand}
                        </Typography>
                        <Typography variant="caption" sx={{ opacity: 0.85, fontWeight: 700, mt: 0.25 }}>
                            แบรนด์
                        </Typography>
                    </Box>

                    {/* category tile */}
                    <Box
                        sx={{
                            gridColumn: { xs: 'span 1', sm: 'span 3', md: 'span 2' },
                            gridRow: { md: 'span 2' },
                            borderRadius: 5,
                            p: 2,
                            bgcolor: 'success.main',
                            color: 'success.contrastText',
                            display: 'flex',
                            flexDirection: 'column',
                            justifyContent: 'center',
                        }}
                    >
                        <Icon fontSize="small" sx={{ opacity: 0.85, mb: 0.5 }} />
                        <Typography variant="subtitle2" sx={{ fontWeight: 900, lineHeight: 1.2 }}>
                            {product.category}
                        </Typography>
                        <Typography variant="caption" sx={{ opacity: 0.85, fontWeight: 700, mt: 0.25 }}>
                            หมวดหมู่
                        </Typography>
                    </Box>

                    {/* color tile */}
                    {product.color && (
                        <Box
                            sx={{
                                gridColumn: { xs: 'span 1', sm: 'span 3', md: 'span 2' },
                                gridRow: { md: 'span 2' },
                                borderRadius: 5,
                                p: 2,
                                bgcolor: 'warning.main',
                                color: 'warning.contrastText',
                                display: 'flex',
                                flexDirection: 'column',
                                justifyContent: 'center',
                            }}
                        >
                            <PaletteOutlinedIcon fontSize="small" sx={{ opacity: 0.85, mb: 0.5 }} />
                            <Typography variant="subtitle2" sx={{ fontWeight: 900, lineHeight: 1.2 }}>
                                {product.color}
                            </Typography>
                            <Typography variant="caption" sx={{ opacity: 0.85, fontWeight: 700, mt: 0.25 }}>
                                สี
                            </Typography>
                        </Box>
                    )}

                    {/* extra spec stat tiles pulled from real spec data */}
                    {Object.entries(product.specs)
                        .slice(0, 2)
                        .map(([label, value], index) => {
                            const accentColors = ['info', 'secondary'] as const;
                            const accent = accentColors[index % accentColors.length];
                            return (
                                <Box
                                    key={label}
                                    sx={{
                                        gridColumn: { xs: 'span 1', sm: 'span 3', md: 'span 2' },
                                        gridRow: { md: 'span 2' },
                                        borderRadius: 5,
                                        p: 2,
                                        bgcolor: `${accent}.main`,
                                        color: `${accent}.contrastText`,
                                        display: 'flex',
                                        flexDirection: 'column',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <TuneOutlinedIcon fontSize="small" sx={{ opacity: 0.85, mb: 0.5 }} />
                                    <Typography variant="h6" sx={{ fontWeight: 900, letterSpacing: '-0.01em', lineHeight: 1.15 }}>
                                        {value}
                                    </Typography>
                                    <Typography variant="caption" sx={{ opacity: 0.85, fontWeight: 700, mt: 0.5, display: 'block', lineHeight: 1.3 }}>
                                        {label}
                                    </Typography>
                                </Box>
                            );
                        })}

                    {/* discount stat */}
                    {product.discountNote && (
                        <Box
                            sx={{
                                gridColumn: { xs: 'span 2', sm: 'span 6', md: 'span 6' },
                                gridRow: { md: 'span 2' },
                                borderRadius: 5,
                                p: 2.5,
                                bgcolor: 'warning.main',
                                color: 'warning.contrastText',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 1.5,
                            }}
                        >
                            <LocalOfferOutlinedIcon />
                            <Box>
                                <Typography variant="subtitle2" sx={{ fontWeight: 800 }}>
                                    ส่วนลดตามจำนวนสั่งซื้อ
                                </Typography>
                                <Typography variant="caption" sx={{ opacity: 0.9 }}>
                                    {product.discountNote}
                                </Typography>
                            </Box>
                        </Box>
                    )}

                    {/* highlight feature cards */}
                    {product.highlights.map((highlight, index) => {
                        const accentColors = ['success', 'info', 'secondary', 'warning'] as const;
                        const accent = accentColors[index % accentColors.length];
                        return (
                            <Paper
                                key={highlight}
                                elevation={1}
                                sx={{
                                    gridColumn: { xs: 'span 2', sm: 'span 3', md: 'span 3' },
                                    gridRow: { md: 'span 2' },
                                    borderRadius: 5,
                                    p: 2.5,
                                    display: 'flex',
                                    flexDirection: 'column',
                                    justifyContent: 'space-between',
                                }}
                            >
                                <Box
                                    sx={{
                                        width: 40,
                                        height: 40,
                                        borderRadius: 2.5,
                                        bgcolor: (theme) => alpha(theme.palette[accent].main, 0.15),
                                        color: `${accent}.main`,
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}
                                >
                                    <CheckCircleOutlineIcon fontSize="small" />
                                </Box>
                                <Typography variant="body2" sx={{ mt: 1.5 }}>
                                    {highlight}
                                </Typography>
                            </Paper>
                        );
                    })}

                    {/* spec table */}
                    {Object.keys(product.specs).length > 0 && (
                        <Paper
                            elevation={1}
                            sx={{
                                gridColumn: { xs: 'span 2', sm: 'span 6', md: 'span 12' },
                                borderRadius: 5,
                                p: 3,
                            }}
                        >
                            <Stack direction="row" spacing={0.75} alignItems="center">
                                <TuneOutlinedIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                                <Typography
                                    variant="caption"
                                    sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'text.secondary' }}
                                >
                                    ข้อมูลจำเพาะ
                                </Typography>
                            </Stack>
                            <Box
                                sx={{
                                    display: 'grid',
                                    gridTemplateColumns: { xs: '1fr', sm: 'repeat(2, 1fr)' },
                                    columnGap: 4,
                                    mt: 1,
                                }}
                            >
                                {Object.entries(product.specs).map(([label, value]) => (
                                    <Stack
                                        key={label}
                                        direction="row"
                                        justifyContent="space-between"
                                        sx={{ py: 1, borderBottom: 1, borderColor: 'divider' }}
                                    >
                                        <Typography variant="body2" color="text.secondary">
                                            {label}
                                        </Typography>
                                        <Typography variant="body2" sx={{ fontWeight: 700 }}>
                                            {value}
                                        </Typography>
                                    </Stack>
                                ))}
                            </Box>
                        </Paper>
                    )}
                </Box>

                {related.length > 0 && (
                    <Box>
                        <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>
                            สินค้าที่เกี่ยวข้อง
                        </Typography>
                        <Box
                            sx={{
                                display: 'grid',
                                gap: 2,
                                gridTemplateColumns: { xs: 'repeat(2, 1fr)', sm: 'repeat(3, 1fr)', md: 'repeat(4, 1fr)' },
                            }}
                        >
                            {related.map((item) => (
                                <ProductCard key={item.id} product={item} />
                            ))}
                        </Box>
                    </Box>
                )}
            </Box>
        </AppLayout>
    );
}
