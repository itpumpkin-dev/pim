import { currency, productCsvHeaders, productImageUrl, productToCsvRow, type Product } from '@/data/products';
import { useLocale } from '@/hooks/use-locale';
import { downloadCsv } from '@/lib/csv';
import { Link } from '@inertiajs/react';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import { Box, Chip, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';

export function ProductCard({ product }: { product: Product }) {
    const Icon = product.icon;
    const [imageFailed, setImageFailed] = useState(false);
    const [hovering, setHovering] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const { t, tCategory } = useLocale();

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

    return (
        <Box
            onMouseEnter={() => setHovering(true)}
            onMouseLeave={() => setHovering(false)}
            sx={{ mb: 2, breakInside: 'avoid', WebkitColumnBreakInside: 'avoid', width: '100%' }}
        >
            <Paper
                component={Link}
                href={`/products/${product.id}`}
                prefetch
                elevation={0}
                sx={{
                    position: 'relative',
                    display: 'block',
                    width: '100%',
                    borderRadius: 3,
                    border: 1,
                    borderColor: 'divider',
                    overflow: 'hidden',
                    textDecoration: 'none',
                    color: 'inherit',
                    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
                    '&:hover': { transform: 'translateY(-4px)', boxShadow: 4 },
                }}
            >
                {product.tag && (
                    <Chip
                        label={product.tag}
                        color={product.tagColor}
                        size="small"
                        sx={{ position: 'absolute', top: 10, left: 10, zIndex: 1, fontWeight: 600 }}
                    />
                )}

                <Box
                    sx={{
                        position: 'relative',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        bgcolor: 'action.hover',
                        minHeight: imageFailed ? 160 : undefined,
                    }}
                >
                    {!imageFailed ? (
                        <Box
                            component="img"
                            src={productImageUrl(product)}
                            alt={product.name}
                            loading="lazy"
                            onError={() => setImageFailed(true)}
                            sx={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain', p: 1.5 }}
                        />
                    ) : (
                        <Icon sx={{ fontSize: 56, color: 'text.disabled', my: 4 }} />
                    )}

                    {product.videoUrl && (
                        <Box
                            component="video"
                            ref={videoRef}
                            src={product.videoUrl}
                            muted
                            loop
                            playsInline
                            sx={{
                                position: 'absolute',
                                inset: 0,
                                width: '100%',
                                height: '100%',
                                objectFit: 'cover',
                                opacity: hovering ? 1 : 0,
                                transition: 'opacity 0.25s ease',
                                pointerEvents: 'none',
                            }}
                        />
                    )}
                </Box>

                <Box sx={{ p: 2 }}>
                    <Typography variant="caption" color="text.secondary">
                        {product.brand} · {tCategory(product.category)}
                    </Typography>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, minHeight: 40 }}>
                        {product.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
                        {product.color ? `${product.color} · ` : ''}
                        {product.size}
                    </Typography>

                    <Stack direction="row" alignItems="center" justifyContent="space-between">
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, color: 'primary.main' }}>
                            {currency(product.price)}
                        </Typography>
                        <Stack direction="row" spacing={0.5} alignItems="center" sx={{ color: 'text.secondary' }}>
                            <Inventory2OutlinedIcon sx={{ fontSize: 16 }} />
                            <Typography variant="caption">{t('common.packLabel', { qty: product.packQty, unit: product.packUnit })}</Typography>
                        </Stack>
                    </Stack>

                    <Tooltip title={t('common.exportThisProduct')}>
                        <IconButton
                            size="small"
                            onClick={handleExport}
                            sx={{
                                position: 'absolute',
                                top: 8,
                                right: 8,
                                bgcolor: 'background.paper',
                                border: 1,
                                borderColor: 'divider',
                                opacity: 0,
                                transition: 'opacity 0.15s ease',
                                '.MuiPaper-root:hover &': { opacity: 1 },
                                '&:hover, &:focus-visible': { opacity: 1, bgcolor: 'action.hover' },
                            }}
                        >
                            <FileDownloadOutlinedIcon fontSize="small" />
                        </IconButton>
                    </Tooltip>
                </Box>
            </Paper>
        </Box>
    );
}
