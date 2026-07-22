// import AppLogoIcon from '@/components/app-logo-icon';
// import { ProductCard } from '@/components/product-card';
// import { currency, findProduct, productImageUrl, products, type IconType } from '@/data/products';
// import { useElementWidth } from '@/hooks/use-element-width';
// import { computeBentoLayout, findBentoGaps, gridArea, packBento, scaleBentoItems, type BentoItem } from '@/lib/bento';
// import { type SharedData } from '@/types';
// import { Head, Link, usePage } from '@inertiajs/react';
// import ArrowBackIcon from '@mui/icons-material/ArrowBack';
// import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
// import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
// import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
// import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
// import LoginIcon from '@mui/icons-material/Login';
// import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
// import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
// import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
// import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
// import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
// import { alpha, AppBar, Box, Button, Chip, Paper, Stack, Table, TableBody, TableCell, TableRow, Toolbar, Typography } from '@mui/material';
// import { cloneElement, useState } from 'react';

// type GridArea = { gridColumn: string; gridRow: string };
// type CellType = 'hero' | 'spec' | 'product' | 'stat' | 'info' | 'feature' | 'discount';
// type CellDef = { key: string; type: CellType; render: (area: GridArea) => React.ReactElement };

// const hoverLiftSx = {
//     transition: 'transform 0.2s ease, box-shadow 0.2s ease',
//     '&:hover': { transform: 'translateY(-3px)', boxShadow: 6, zIndex: 2 },
// } as const;
// const clampSx = (lines: number) => ({ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }) as const;

// /** rotating palette for small fact tiles, so the grid reads as a lively mosaic instead of one flat color */
// const STAT_VARIANTS: Array<Record<string, unknown>> = [
//     { bgcolor: '#f5f5f7', color: '#1a1a1a' },
//     { bgcolor: 'info.main', color: 'info.contrastText' },
//     { bgcolor: 'background.paper', color: 'text.primary', boxShadow: 1 },
//     { bgcolor: 'success.main', color: 'success.contrastText' },
//     { bgcolor: 'primary.main', color: 'primary.contrastText' },
//     { bgcolor: (theme: { palette: { mode: string } }) => (theme.palette.mode === 'dark' ? '#000' : 'grey.900'), color: '#fff' },
// ];

// /** small icon + value + label tile, used both for real facts (brand/category/color) and for filling leftover grid gaps */
// function factCell(area: GridArea, variantIndex: number, FactIcon: IconType, value: string, label: string) {
//     return (
//         <Box
//             sx={{
//                 ...area,
//                 height: '100%',
//                 minWidth: 0,
//                 borderRadius: 5,
//                 p: 2,
//                 display: 'flex',
//                 flexDirection: 'column',
//                 justifyContent: 'center',
//                 overflow: 'hidden',
//                 ...hoverLiftSx,
//                 ...STAT_VARIANTS[variantIndex % STAT_VARIANTS.length],
//             }}
//         >
//             <FactIcon fontSize="medium" sx={{ opacity: 0.85, mb: 0.75 }} />
//             <Typography variant="subtitle1" noWrap sx={{ fontWeight: 800, lineHeight: 1.25 }}>
//                 {value}
//             </Typography>
//             <Typography variant="body2" noWrap sx={{ opacity: 0.8, fontWeight: 700, mt: 0.25 }}>
//                 {label}
//             </Typography>
//         </Box>
//     );
// }

// export default function ProductShow({ id }: { id: number }) {
//     const { auth } = usePage<SharedData>().props;
//     const product = findProduct(id);
//     const [imageFailed, setImageFailed] = useState(false);
//     const { ref: bentoRef, width: bentoWidth } = useElementWidth<HTMLDivElement>();

//     const actions = !auth.user ? (
//         <Button
//             component={Link}
//             href={route('login')}
//             variant="contained"
//             startIcon={<LoginIcon />}
//             sx={{
//                 borderRadius: '50px',
//                 textTransform: 'none',
//                 fontWeight: 600,
//                 px: 2,
//                 py: 1,
//                 color: '#fff',
//                 background: 'linear-gradient(135deg, #f97316 0%, #ea580c 100%)',
//                 transition: 'all 0.2s ease-in-out',
//                 '&:hover': {
//                     transform: 'translateY(-2px)',
//                     background: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
//                 },
//             }}
//         >
//             Sign in
//         </Button>
//     ) : (
//         <Button
//             component={Link}
//             href={route('dashboard')}
//             variant="outlined"
//             sx={{
//                 borderRadius: '50px',
//                 textTransform: 'none',
//                 fontWeight: 600,
//                 px: 3,
//                 py: 1,
//                 borderWidth: 2,
//                 color: '#ea580c',
//                 borderColor: '#ea580c',
//                 transition: 'all 0.2s ease-in-out',
//                 '&:hover': {
//                     borderWidth: 2,
//                     borderColor: '#c2410c',
//                     bgcolor: alpha('#ea580c', 0.08),
//                     transform: 'translateY(-2px)',
//                 },
//             }}
//         >
//             ไปที่ Dashboard
//         </Button>
//     );

//     if (!product) {
//         return (
//             <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
//                 <Head title="ไม่พบสินค้า" />
//                 <AppBar position="sticky" color="inherit" elevation={1}>
//                     <Toolbar sx={{ justifyContent: 'space-between' }}>
//                         <Box component={Link} href="/" sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none', color: 'inherit' }}>
//                             <Box sx={{ color: 'primary.main', display: 'flex' }}>
//                                 <AppLogoIcon style={{ width: 32, height: 32, fill: 'currentColor' }} />
//                             </Box>
//                             <Typography variant="h6" sx={{ fontWeight: 700 }}>
//                                 PIM <Box component="span" sx={{ fontWeight: 800, color: 'primary.main' }}>Pumpkin</Box>
//                             </Typography>
//                         </Box>
//                         {actions}
//                     </Toolbar>
//                 </AppBar>

//                 <Stack spacing={2} alignItems="flex-start" sx={{ p: { xs: 2, md: 4 } }}>
//                     <Typography variant="h6">ไม่พบสินค้าที่คุณต้องการ</Typography>
//                     <Button component={Link} href="/" startIcon={<ArrowBackIcon />}>
//                         กลับหน้า Home
//                     </Button>
//                 </Stack>
//             </Box>
//         );
//     }

//     const Icon = product.icon;
//     const related = products.filter((item) => item.category === product.category && item.id !== product.id).slice(0, 4);

//     const heroRender = (area: GridArea) => (
//         <Box
//             sx={{
//                 ...area,
//                 height: '100%',
//                 minWidth: 0,
//                 position: 'relative',
//                 overflow: 'hidden',
//                 borderRadius: 5,
//                 p: { xs: 3, md: 4 },
//                 display: 'flex',
//                 flexDirection: 'column',
//                 justifyContent: 'space-between',
//                 background: (theme) =>
//                     theme.palette.mode === 'dark'
//                         ? 'linear-gradient(135deg, #1a1a24 0%, #0f0f18 100%)'
//                         : 'linear-gradient(135deg, #1f2430 0%, #12141c 100%)',
//                 color: '#fff',
//                 ...hoverLiftSx,
//                 '&::before': {
//                     content: '""',
//                     position: 'absolute',
//                     right: -100,
//                     top: -100,
//                     width: 420,
//                     height: 420,
//                     borderRadius: '50%',
//                     background: (theme) => `radial-gradient(circle, ${alpha(theme.palette.primary.main, 0.35)}, transparent 65%)`,
//                     pointerEvents: 'none',
//                 },
//             }}
//         >
//             {!imageFailed && (
//                 <Box
//                     component="img"
//                     src={productImageUrl(product)}
//                     alt=""
//                     aria-hidden="true"
//                     onError={() => setImageFailed(true)}
//                     sx={{
//                         position: 'absolute',
//                         right: { xs: -40, md: -20 },
//                         bottom: -30,
//                         width: { xs: '55%', md: '42%' },
//                         opacity: 0.16,
//                         zIndex: 0,
//                         pointerEvents: 'none',
//                         filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.6))',
//                     }}
//                 />
//             )}
//             <Box sx={{ position: 'relative', zIndex: 1, minHeight: 0, overflow: 'hidden' }}>
//                 <Typography variant="caption" sx={{ color: 'primary.light', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
//                     {product.brand} · {product.category}
//                 </Typography>
//                 <Typography variant="h3" sx={{ fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1, mt: 1.5, maxWidth: 520, ...clampSx(2) }}>
//                     {product.name}
//                 </Typography>
//                 <Typography variant="body1" sx={{ opacity: 0.75, mt: 1.5, maxWidth: 460, ...clampSx(3) }}>
//                     {product.description}
//                 </Typography>
//                 <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mt: 2, gap: 1 }}>
//                     <Chip
//                         size="small"
//                         label={`SKU ${product.sku}`}
//                         sx={{ bgcolor: alpha('#fff', 0.08), color: '#fff', border: 1, borderColor: alpha('#fff', 0.1) }}
//                     />
//                     {product.color && (
//                         <Chip
//                             size="small"
//                             label={product.color}
//                             sx={{ bgcolor: alpha('#fff', 0.08), color: '#fff', border: 1, borderColor: alpha('#fff', 0.1) }}
//                         />
//                     )}
//                     {product.tag && <Chip size="small" label={product.tag} color={product.tagColor} sx={{ fontWeight: 700 }} />}
//                 </Stack>
//             </Box>
//             <Stack direction="row" spacing={1.5} sx={{ position: 'relative', zIndex: 1, mt: 2 }}>
//                 <Button
//                     variant="contained"
//                     startIcon={<EditOutlinedIcon />}
//                     sx={{ borderRadius: 999, bgcolor: 'primary.main', '&:hover': { bgcolor: 'primary.dark' } }}
//                 >
//                     แก้ไขข้อมูล
//                 </Button>
//                 <Button
//                     variant="outlined"
//                     startIcon={<PrintOutlinedIcon />}
//                     sx={{ borderRadius: 999, color: '#fff', borderColor: alpha('#fff', 0.3), '&:hover': { borderColor: '#fff' } }}
//                 >
//                     พิมพ์ข้อมูล
//                 </Button>
//             </Stack>
//         </Box>
//     );

//     const specRender = (area: GridArea) => (
//         <Box
//             sx={{
//                 ...area,
//                 height: '100%',
//                 minWidth: 0,
//                 overflow: 'auto',
//                 borderRadius: 5,
//                 p: 3,
//                 bgcolor: '#f5f5f7',
//                 color: '#1a1a1a',
//                 ...hoverLiftSx,
//             }}
//         >
//             <Stack direction="row" spacing={0.75} alignItems="center">
//                 <TuneOutlinedIcon fontSize="small" sx={{ color: '#8a8a8a' }} />
//                 <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a8a8a' }}>
//                     ข้อมูลจำเพาะ
//                 </Typography>
//             </Stack>
//             <Typography variant="subtitle1" sx={{ fontWeight: 800, mt: 0.5, ...clampSx(2) }}>
//                 {product.name}
//             </Typography>
//             <Table size="small" sx={{ mt: 1 }}>
//                 <TableBody>
//                     {Object.entries(product.specs).map(([label, value]) => (
//                         <TableRow key={label} sx={{ '&:last-child td': { border: 0 } }}>
//                             <TableCell sx={{ pl: 0, color: '#666', borderColor: '#e5e5e5' }}>{label}</TableCell>
//                             <TableCell align="right" sx={{ pr: 0, fontWeight: 700, borderColor: '#e5e5e5' }}>
//                                 {value}
//                             </TableCell>
//                         </TableRow>
//                     ))}
//                 </TableBody>
//             </Table>
//         </Box>
//     );

//     const productRender = (area: GridArea) => (
//         <Box
//             sx={{
//                 ...area,
//                 height: '100%',
//                 minWidth: 0,
//                 position: 'relative',
//                 borderRadius: 5,
//                 overflow: 'hidden',
//                 display: 'flex',
//                 flexDirection: 'column',
//                 background: (theme) =>
//                     theme.palette.mode === 'dark' ? 'linear-gradient(135deg, #2a2a35, #14141a)' : 'linear-gradient(135deg, #eef0f4, #dfe3ea)',
//                 ...hoverLiftSx,
//             }}
//         >
//             {product.tag && (
//                 <Chip
//                     label={product.tag}
//                     color={product.tagColor}
//                     size="small"
//                     sx={{ position: 'absolute', top: 10, left: 10, zIndex: 1, fontWeight: 700 }}
//                 />
//             )}
//             <Box sx={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
//                 {!imageFailed ? (
//                     <Box
//                         component="img"
//                         src={productImageUrl(product)}
//                         alt={product.name}
//                         loading="lazy"
//                         onError={() => setImageFailed(true)}
//                         sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', filter: 'drop-shadow(0 12px 24px rgba(0,0,0,0.35))' }}
//                     />
//                 ) : (
//                     <Icon sx={{ fontSize: 80, color: (theme) => (theme.palette.mode === 'dark' ? alpha('#fff', 0.4) : 'text.disabled') }} />
//                 )}
//             </Box>
//             <Stack spacing={0.25} sx={{ px: 2, pb: 2 }}>
//                 <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.05em', color: 'primary.main' }}>
//                     {product.sku}
//                 </Typography>
//                 <Typography
//                     variant="body1"
//                     sx={{ fontWeight: 700, color: (theme) => (theme.palette.mode === 'dark' ? '#fff' : 'text.primary'), ...clampSx(2) }}
//                 >
//                     {product.name}
//                 </Typography>
//             </Stack>
//         </Box>
//     );

//     const priceRender = (area: GridArea) => (
//         <Box
//             sx={{
//                 ...area,
//                 height: '100%',
//                 minWidth: 0,
//                 borderRadius: 5,
//                 p: 2.5,
//                 bgcolor: 'primary.main',
//                 color: 'primary.contrastText',
//                 display: 'flex',
//                 flexDirection: 'column',
//                 justifyContent: 'center',
//                 overflow: 'hidden',
//                 ...hoverLiftSx,
//             }}
//         >
//             <PaidOutlinedIcon sx={{ opacity: 0.85, mb: 0.5 }} />
//             <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1 }}>
//                 {currency(product.price)}
//             </Typography>
//             <Typography variant="caption" sx={{ opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, mt: 1 }}>
//                 ราคาต่อหน่วย
//             </Typography>
//         </Box>
//     );

//     const packagingRender = (area: GridArea) => (
//         <Box
//             sx={{
//                 ...area,
//                 height: '100%',
//                 minWidth: 0,
//                 borderRadius: 5,
//                 p: 2.5,
//                 bgcolor: (theme) => (theme.palette.mode === 'dark' ? '#000' : 'grey.900'),
//                 color: '#fff',
//                 display: 'flex',
//                 flexDirection: 'column',
//                 justifyContent: 'center',
//                 overflow: 'hidden',
//                 ...hoverLiftSx,
//             }}
//         >
//             <Inventory2OutlinedIcon sx={{ opacity: 0.75, mb: 0.5 }} />
//             <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1 }}>
//                 {product.packQty}
//                 <Typography component="span" variant="body1" sx={{ fontWeight: 700, opacity: 0.75, ml: 0.5 }}>
//                     {product.packUnit}/ลัง
//                 </Typography>
//             </Typography>
//             <Typography variant="caption" sx={{ opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, mt: 1 }}>
//                 ขนาดบรรจุ {product.size}
//             </Typography>
//         </Box>
//     );

//     const discountRender = (area: GridArea) => (
//         <Box
//             sx={{
//                 ...area,
//                 height: '100%',
//                 minWidth: 0,
//                 borderRadius: 5,
//                 p: 2.5,
//                 display: 'flex',
//                 flexDirection: 'column',
//                 justifyContent: 'center',
//                 overflow: 'hidden',
//                 background: (theme) => `linear-gradient(135deg, ${theme.palette.warning.main} 0%, ${theme.palette.warning.dark} 100%)`,
//                 color: 'warning.contrastText',
//                 ...hoverLiftSx,
//             }}
//         >
//             <LocalOfferOutlinedIcon fontSize="medium" sx={{ opacity: 0.9, mb: 0.5 }} />
//             <Typography variant="h6" sx={{ fontWeight: 800 }}>
//                 ส่วนลดตามจำนวนสั่งซื้อ
//             </Typography>
//             <Typography variant="body1" sx={{ opacity: 0.9, mt: 0.5, ...clampSx(3) }}>
//                 {product.discountNote}
//             </Typography>
//         </Box>
//     );

//     const featureRender = (area: GridArea, index: number, highlight: string) => {
//         const accentColors = ['success', 'info', 'secondary', 'warning'] as const;
//         const accent = accentColors[index % accentColors.length];
//         return (
//             <Paper
//                 elevation={1}
//                 sx={{
//                     ...area,
//                     height: '100%',
//                     minWidth: 0,
//                     borderRadius: 5,
//                     p: 2.5,
//                     display: 'flex',
//                     flexDirection: 'column',
//                     justifyContent: 'center',
//                     overflow: 'hidden',
//                     ...hoverLiftSx,
//                 }}
//             >
//                 <Box
//                     sx={{
//                         width: 44,
//                         height: 44,
//                         flexShrink: 0,
//                         borderRadius: 3,
//                         bgcolor: (theme) => alpha(theme.palette[accent].main, 0.15),
//                         color: `${accent}.main`,
//                         display: 'flex',
//                         alignItems: 'center',
//                         justifyContent: 'center',
//                     }}
//                 >
//                     <CheckCircleOutlineIcon fontSize="medium" />
//                 </Box>
//                 <Typography variant="body1" sx={{ mt: 1.5, fontWeight: 500, ...clampSx(4) }}>
//                     {highlight}
//                 </Typography>
//             </Paper>
//         );
//     };

//     const cells: BentoItem<CellDef>[] = [];
//     cells.push({ w: 8, h: 5, weight: 5, data: { key: 'hero', type: 'hero', render: heroRender } });

//     if (Object.keys(product.specs).length > 0) {
//         cells.push({ w: 4, h: 6, weight: 5, data: { key: 'spec', type: 'spec', render: specRender } });
//     }

//     cells.push({ w: 3, h: 4, weight: 4, data: { key: 'product-photo', type: 'product', render: productRender } });
//     cells.push({ w: 3, h: 3, weight: 4, data: { key: 'price', type: 'stat', render: priceRender } });
//     cells.push({ w: 3, h: 3, weight: 4, data: { key: 'packaging', type: 'stat', render: packagingRender } });
//     cells.push({
//         w: 2,
//         h: 2,
//         weight: 2,
//         data: { key: 'brand', type: 'info', render: (area) => factCell(area, 0, StorefrontOutlinedIcon, product.brand, 'แบรนด์') },
//     });
//     cells.push({
//         w: 2,
//         h: 2,
//         weight: 2,
//         data: { key: 'category', type: 'info', render: (area) => factCell(area, 1, Icon, product.category, 'หมวดหมู่') },
//     });

//     if (product.color) {
//         const color = product.color;
//         cells.push({
//             w: 2,
//             h: 2,
//             weight: 2,
//             data: { key: 'color', type: 'info', render: (area) => factCell(area, 2, PaletteOutlinedIcon, color, 'สี') },
//         });
//     }

//     if (product.discountNote) {
//         cells.push({ w: 4, h: 3, weight: 3, data: { key: 'discount', type: 'discount', render: discountRender } });
//     }

//     product.highlights.forEach((highlight, index) => {
//         cells.push({
//             w: 3,
//             h: 3,
//             weight: 3,
//             data: { key: `highlight-${index}`, type: 'feature', render: (area) => featureRender(area, index, highlight) },
//         });
//     });

//     const narrowHeights: Partial<Record<CellType, number>> = { hero: 6, spec: 8, product: 5 };
//     const { cols, rowH } = computeBentoLayout(bentoWidth);
//     const scaled = scaleBentoItems(cells, cols, (item) => narrowHeights[item.data.type]);
//     const { placed, grid } = packBento(scaled, cols);
//     const maxY = placed.reduce((m, p) => Math.max(m, p.y + p.h), 0);
//     const gaps = findBentoGaps(grid, cols, maxY);

//     const fillerPool: { label: string; value: string }[] =
//         Object.keys(product.specs).length > 0
//             ? Object.entries(product.specs).map(([label, value]) => ({ label, value }))
//             : [
//                   { label: 'แบรนด์', value: product.brand },
//                   { label: 'หมวดหมู่', value: product.category },
//               ];

//     return (
//         <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
//             <Head title={product.name} />
//             <AppBar position="sticky" color="inherit" elevation={1}>
//                 <Toolbar sx={{ justifyContent: 'space-between' }}>
//                     <Box component={Link} href="/" sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none', color: 'inherit' }}>
//                         <Box sx={{ color: 'primary.main', display: 'flex' }}>
//                             <AppLogoIcon style={{ width: 32, height: 32, fill: 'currentColor' }} />
//                         </Box>
//                         <Typography variant="h6" sx={{ fontWeight: 700 }}>
//                             PIM <Box component="span" sx={{ fontWeight: 800, color: 'primary.main' }}>Pumpkin</Box>
//                         </Typography>
//                     </Box>
//                     {actions}
//                 </Toolbar>
//             </AppBar>

//             <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, p: { xs: 2, md: 4 }, flex: 1, width: '100%' }}>
//                 <Button component={Link} href="/" startIcon={<ArrowBackIcon />} size="small" sx={{ alignSelf: 'flex-start' }}>
//                     กลับ
//                 </Button>

//                 <Box
//                     ref={bentoRef}
//                     sx={{
//                         display: 'grid',
//                         gridTemplateColumns: `repeat(${cols}, 1fr)`,
//                         gridAutoRows: `${rowH}px`,
//                         gap: 1.25,
//                     }}
//                 >
//                     {placed.map((p) => cloneElement(p.data.render(gridArea(p.x, p.y, p.w, p.h)), { key: p.data.key }))}
//                     {gaps.map((g, index) =>
//                         cloneElement(
//                             factCell(
//                                 gridArea(g.x, g.y, g.w, g.h),
//                                 index,
//                                 TuneOutlinedIcon,
//                                 fillerPool[index % fillerPool.length].value,
//                                 fillerPool[index % fillerPool.length].label,
//                             ),
//                             {
//                                 key: `gap-${g.x}-${g.y}`,
//                             },
//                         ),
//                     )}
//                 </Box>

//                 {related.length > 0 && (
//                     <Box>
//                         <Typography variant="h6" sx={{ fontWeight: 700, mb: 1.5 }}>
//                             สินค้าที่เกี่ยวข้อง
//                         </Typography>
//                         <Box sx={{ columnCount: { xs: 2, sm: 3, md: 4 }, columnGap: 2 }}>
//                             {related.map((item) => (
//                                 <ProductCard key={item.id} product={item} />
//                             ))}
//                         </Box>
//                     </Box>
//                 )}
//             </Box>
//         </Box>
//     );
// }
import AppLogoIcon from '@/components/app-logo-icon';
import AppearanceToggleDropdown from '@/components/appearance-dropdown';
import { ProductCard } from '@/components/product-card';
import { currency, findProduct, productImageUrl, products, type IconType } from '@/data/products';
import { useElementWidth } from '@/hooks/use-element-width';
import { computeBentoLayout, findBentoGaps, gridArea, packBento, scaleBentoItems, type BentoItem } from '@/lib/bento';
import { type SharedData } from '@/types';
import { Head, Link, usePage } from '@inertiajs/react';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import LocalOfferOutlinedIcon from '@mui/icons-material/LocalOfferOutlined';
import LoginIcon from '@mui/icons-material/Login';
import PaidOutlinedIcon from '@mui/icons-material/PaidOutlined';
import PaletteOutlinedIcon from '@mui/icons-material/PaletteOutlined';
import PrintOutlinedIcon from '@mui/icons-material/PrintOutlined';
import StorefrontOutlinedIcon from '@mui/icons-material/StorefrontOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import { alpha, AppBar, Box, Button, Chip, Paper, Stack, Table, TableBody, TableCell, TableRow, Toolbar, Typography } from '@mui/material';
import { cloneElement, useState } from 'react';

type GridArea = { gridColumn: string; gridRow: string };
type CellType = 'hero' | 'spec' | 'product' | 'stat' | 'info' | 'feature' | 'discount';
type CellDef = { key: string; type: CellType; render: (area: GridArea) => React.ReactElement };

const hoverLiftSx = {
    transition: 'transform 0.2s ease, box-shadow 0.2s ease',
    '&:hover': { transform: 'translateY(-3px)', boxShadow: 6, zIndex: 2 },
} as const;
const clampSx = (lines: number) => ({ display: '-webkit-box', WebkitLineClamp: lines, WebkitBoxOrient: 'vertical', overflow: 'hidden' }) as const;

/** rotating palette for small fact tiles, so the grid reads as a lively mosaic instead of one flat color */
const STAT_VARIANTS: Array<Record<string, unknown>> = [
    { bgcolor: '#f5f5f7', color: '#1a1a1a' },
    { bgcolor: 'info.main', color: 'info.contrastText' },
    { bgcolor: 'background.paper', color: 'text.primary', boxShadow: 1 },
    { bgcolor: 'success.main', color: 'success.contrastText' },
    { bgcolor: 'primary.main', color: 'primary.contrastText' },
    { bgcolor: (theme: { palette: { mode: string } }) => (theme.palette.mode === 'dark' ? '#000' : 'grey.900'), color: '#fff' },
];

/** small icon + value + label tile, used both for real facts (brand/category/color) and for filling leftover grid gaps */
function factCell(area: GridArea, variantIndex: number, FactIcon: IconType, value: string, label: string, h = 2) {
    const compact = h <= 1;

    if (compact) {
        return (
            <Box
                sx={{
                    ...area,
                    height: '100%',
                    minWidth: 0,
                    borderRadius: '12px',
                    px: 1.5,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 1,
                    overflow: 'hidden',
                    ...hoverLiftSx,
                    ...STAT_VARIANTS[variantIndex % STAT_VARIANTS.length],
                }}
            >
                <FactIcon fontSize="small" sx={{ opacity: 0.85, flexShrink: 0 }} />
                <Typography variant="body2" noWrap sx={{ fontWeight: 800, minWidth: 0 }}>
                    {value}
                </Typography>
            </Box>
        );
    }

    return (
        <Box
            sx={{
                ...area,
                height: '100%',
                minWidth: 0,
                borderRadius: '14px',
                p: 2,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                overflow: 'hidden',
                ...hoverLiftSx,
                ...STAT_VARIANTS[variantIndex % STAT_VARIANTS.length],
            }}
        >
            <FactIcon fontSize="medium" sx={{ opacity: 0.85, mb: 0.75 }} />
            <Typography variant="subtitle1" noWrap sx={{ fontWeight: 800, lineHeight: 1.25 }}>
                {value}
            </Typography>
            <Typography variant="body2" noWrap sx={{ opacity: 0.8, fontWeight: 700, mt: 0.25 }}>
                {label}
            </Typography>
        </Box>
    );
}

export default function ProductShow({ id }: { id: number }) {
    const { auth } = usePage<SharedData>().props;
    const product = findProduct(id);
    const [imageFailed, setImageFailed] = useState(false);
    const { ref: bentoRef, width: bentoWidth } = useElementWidth<HTMLDivElement>();

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
                transition: 'all 0.2s ease-in-out',
                '&:hover': {
                    transform: 'translateY(-2px)',
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

    if (!product) {
        return (
            <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
                <Head title="ไม่พบสินค้า" />
                <AppBar position="sticky" color="inherit" elevation={1}>
                    <Toolbar sx={{ justifyContent: 'space-between' }}>
                        <Box
                            component={Link}
                            href="/"
                            sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none', color: 'inherit' }}
                        >
                            <Box sx={{ color: 'primary.main', display: 'flex' }}>
                                <AppLogoIcon style={{ width: 32, height: 32, fill: 'currentColor' }} />
                            </Box>
                            <Typography variant="h6" sx={{ fontWeight: 700 }}>
                                PIM{' '}
                                <Box component="span" sx={{ fontWeight: 800, color: 'primary.main' }}>
                                    Pumpkin
                                </Box>
                            </Typography>
                        </Box>
                        <Stack direction="row" spacing={1} alignItems="center">
                            <AppearanceToggleDropdown />
                            {actions}
                        </Stack>
                    </Toolbar>
                </AppBar>

                <Stack spacing={2} alignItems="flex-start" sx={{ p: { xs: 2, md: 4 } }}>
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

    const heroRender = (area: GridArea) => (
        <Box
            sx={{
                ...area,
                height: '100%',
                minWidth: 0,
                position: 'relative',
                overflow: 'hidden',
                borderRadius: '20px',
                p: { xs: 3, md: 4 },
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                background: (theme) =>
                    theme.palette.mode === 'dark'
                        ? 'linear-gradient(135deg, #1a1a24 0%, #0f0f18 100%)'
                        : 'linear-gradient(135deg, #1f2430 0%, #12141c 100%)',
                color: '#fff',
                ...hoverLiftSx,
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
            {!imageFailed && (
                <Box
                    component="img"
                    src={productImageUrl(product)}
                    alt=""
                    aria-hidden="true"
                    onError={() => setImageFailed(true)}
                    sx={{
                        position: 'absolute',
                        right: { xs: -40, md: -20 },
                        bottom: -30,
                        width: { xs: '55%', md: '42%' },
                        opacity: 0.16,
                        zIndex: 0,
                        pointerEvents: 'none',
                        filter: 'drop-shadow(0 20px 40px rgba(0,0,0,0.6))',
                    }}
                />
            )}
            <Box sx={{ position: 'relative', zIndex: 1, minHeight: 0, overflow: 'hidden' }}>
                <Typography variant="caption" sx={{ color: 'primary.light', fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
                    {product.brand} · {product.category}
                </Typography>
                <Typography variant="h3" sx={{ fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1, mt: 1.5, maxWidth: 520, ...clampSx(2) }}>
                    {product.name}
                </Typography>
                <Typography variant="body1" sx={{ opacity: 0.75, mt: 1.5, maxWidth: 460, ...clampSx(3) }}>
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
            <Stack direction="row" spacing={1.5} sx={{ position: 'relative', zIndex: 1, mt: 2 }}>
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
    );

    const specRender = (area: GridArea) => (
        <Box
            sx={{
                ...area,
                height: '100%',
                minWidth: 0,
                overflow: 'auto',
                borderRadius: '20px',
                p: 3,
                bgcolor: '#f5f5f7',
                color: '#1a1a1a',
                ...hoverLiftSx,
            }}
        >
            <Stack direction="row" spacing={0.75} alignItems="center">
                <TuneOutlinedIcon fontSize="small" sx={{ color: '#8a8a8a' }} />
                <Typography variant="caption" sx={{ fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#8a8a8a' }}>
                    ข้อมูลจำเพาะ
                </Typography>
            </Stack>
            <Typography variant="subtitle1" sx={{ fontWeight: 800, mt: 0.5, ...clampSx(2) }}>
                {product.name}
            </Typography>
            <Table size="small" sx={{ mt: 1 }}>
                <TableBody>
                    {Object.entries(product.specs).map(([label, value]) => (
                        <TableRow key={label} sx={{ '&:last-child td': { border: 0 } }}>
                            <TableCell sx={{ pl: 0, color: '#666', borderColor: '#e5e5e5' }}>{label}</TableCell>
                            <TableCell align="right" sx={{ pr: 0, fontWeight: 700, borderColor: '#e5e5e5' }}>
                                {value}
                            </TableCell>
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
        </Box>
    );

    const productRender = (area: GridArea) => (
        <Box
            sx={{
                ...area,
                height: '100%',
                minWidth: 0,
                position: 'relative',
                borderRadius: '20px',
                overflow: 'hidden',
                display: 'flex',
                flexDirection: 'column',
                background: (theme) =>
                    theme.palette.mode === 'dark' ? 'linear-gradient(135deg, #2a2a35, #14141a)' : 'linear-gradient(135deg, #eef0f4, #dfe3ea)',
                ...hoverLiftSx,
            }}
        >
            {product.tag && (
                <Chip
                    label={product.tag}
                    color={product.tagColor}
                    size="small"
                    sx={{ position: 'absolute', top: 10, left: 10, zIndex: 1, fontWeight: 700 }}
                />
            )}
            <Box sx={{ flex: 1, minHeight: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', p: 2 }}>
                {!imageFailed ? (
                    <Box
                        component="img"
                        src={productImageUrl(product)}
                        alt={product.name}
                        loading="lazy"
                        onError={() => setImageFailed(true)}
                        sx={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', filter: 'drop-shadow(0 12px 24px rgba(0,0,0,0.35))' }}
                    />
                ) : (
                    <Icon sx={{ fontSize: 80, color: (theme) => (theme.palette.mode === 'dark' ? alpha('#fff', 0.4) : 'text.disabled') }} />
                )}
            </Box>
            <Stack spacing={0.25} sx={{ px: 2, pb: 2 }}>
                <Typography variant="caption" sx={{ fontFamily: 'monospace', fontWeight: 700, letterSpacing: '0.05em', color: 'primary.main' }}>
                    {product.sku}
                </Typography>
                <Typography
                    variant="body1"
                    sx={{ fontWeight: 700, color: (theme) => (theme.palette.mode === 'dark' ? '#fff' : 'text.primary'), ...clampSx(2) }}
                >
                    {product.name}
                </Typography>
            </Stack>
        </Box>
    );

    const priceRender = (area: GridArea) => (
        <Box
            sx={{
                ...area,
                height: '100%',
                minWidth: 0,
                borderRadius: '14px',
                p: 2.5,
                bgcolor: 'primary.main',
                color: 'primary.contrastText',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                overflow: 'hidden',
                ...hoverLiftSx,
            }}
        >
            <PaidOutlinedIcon sx={{ opacity: 0.85, mb: 0.5 }} />
            <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1 }}>
                {currency(product.price)}
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.85, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, mt: 1 }}>
                ราคาต่อหน่วย
            </Typography>
        </Box>
    );

    const packagingRender = (area: GridArea) => (
        <Box
            sx={{
                ...area,
                height: '100%',
                minWidth: 0,
                borderRadius: '14px',
                p: 2.5,
                bgcolor: (theme) => (theme.palette.mode === 'dark' ? '#000' : 'grey.900'),
                color: '#fff',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                overflow: 'hidden',
                ...hoverLiftSx,
            }}
        >
            <Inventory2OutlinedIcon sx={{ opacity: 0.75, mb: 0.5 }} />
            <Typography variant="h4" sx={{ fontWeight: 900, letterSpacing: '-0.02em', lineHeight: 1 }}>
                {product.packQty}
                <Typography component="span" variant="body1" sx={{ fontWeight: 700, opacity: 0.75, ml: 0.5 }}>
                    {product.packUnit}/ลัง
                </Typography>
            </Typography>
            <Typography variant="caption" sx={{ opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, mt: 1 }}>
                ขนาดบรรจุ {product.size}
            </Typography>
        </Box>
    );

    const discountRender = (area: GridArea) => (
        <Box
            sx={{
                ...area,
                height: '100%',
                minWidth: 0,
                borderRadius: '14px',
                p: 2.5,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                overflow: 'hidden',
                background: (theme) => `linear-gradient(135deg, ${theme.palette.warning.main} 0%, ${theme.palette.warning.dark} 100%)`,
                color: 'warning.contrastText',
                ...hoverLiftSx,
            }}
        >
            <LocalOfferOutlinedIcon fontSize="medium" sx={{ opacity: 0.9, mb: 0.5 }} />
            <Typography variant="h6" sx={{ fontWeight: 800 }}>
                ส่วนลดตามจำนวนสั่งซื้อ
            </Typography>
            <Typography variant="body1" sx={{ opacity: 0.9, mt: 0.5, ...clampSx(3) }}>
                {product.discountNote}
            </Typography>
        </Box>
    );

    const featureRender = (area: GridArea, index: number, highlight: string) => {
        const accentColors = ['success', 'info', 'secondary', 'warning'] as const;
        const accent = accentColors[index % accentColors.length];
        return (
            <Paper
                elevation={1}
                sx={{
                    ...area,
                    height: '100%',
                    minWidth: 0,
                    borderRadius: '14px',
                    p: 2.5,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    overflow: 'hidden',
                    ...hoverLiftSx,
                }}
            >
                <Box
                    sx={{
                        width: 44,
                        height: 44,
                        flexShrink: 0,
                        borderRadius: '12px',
                        bgcolor: (theme) => alpha(theme.palette[accent].main, 0.15),
                        color: `${accent}.main`,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                    }}
                >
                    <CheckCircleOutlineIcon fontSize="medium" />
                </Box>
                <Typography variant="body1" sx={{ mt: 1.5, fontWeight: 500, ...clampSx(4) }}>
                    {highlight}
                </Typography>
            </Paper>
        );
    };

    const cells: BentoItem<CellDef>[] = [];
    cells.push({ w: 8, h: 5, weight: 5, data: { key: 'hero', type: 'hero', render: heroRender } });

    if (Object.keys(product.specs).length > 0) {
        cells.push({ w: 4, h: 6, weight: 5, data: { key: 'spec', type: 'spec', render: specRender } });
    }

    cells.push({ w: 3, h: 4, weight: 4, data: { key: 'product-photo', type: 'product', render: productRender } });
    cells.push({ w: 3, h: 3, weight: 4, data: { key: 'price', type: 'stat', render: priceRender } });
    cells.push({ w: 3, h: 3, weight: 4, data: { key: 'packaging', type: 'stat', render: packagingRender } });
    cells.push({
        w: 2,
        h: 2,
        weight: 2,
        data: { key: 'brand', type: 'info', render: (area) => factCell(area, 0, StorefrontOutlinedIcon, product.brand, 'แบรนด์') },
    });
    cells.push({
        w: 2,
        h: 2,
        weight: 2,
        data: { key: 'category', type: 'info', render: (area) => factCell(area, 1, Icon, product.category, 'หมวดหมู่') },
    });

    if (product.color) {
        const color = product.color;
        cells.push({
            w: 2,
            h: 2,
            weight: 2,
            data: { key: 'color', type: 'info', render: (area) => factCell(area, 2, PaletteOutlinedIcon, color, 'สี') },
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

    const narrowHeights: Partial<Record<CellType, number>> = { hero: 6, spec: 8, product: 5 };
    const { cols, rowH } = computeBentoLayout(bentoWidth);
    const scaled = scaleBentoItems(cells, cols, (item) => narrowHeights[item.data.type]);
    const { placed, grid } = packBento(scaled, cols);
    const maxY = placed.reduce((m, p) => Math.max(m, p.y + p.h), 0);
    const gaps = findBentoGaps(grid, cols, maxY);

    const fillerPool: { label: string; value: string }[] =
        Object.keys(product.specs).length > 0
            ? Object.entries(product.specs).map(([label, value]) => ({ label, value }))
            : [
                  { label: 'แบรนด์', value: product.brand },
                  { label: 'หมวดหมู่', value: product.category },
              ];

    return (
        <Box sx={{ minHeight: '100vh', bgcolor: 'background.default' }}>
            <Head title={product.name} />
            <AppBar position="sticky" color="inherit" elevation={1}>
                <Toolbar sx={{ justifyContent: 'space-between' }}>
                    <Box component={Link} href="/" sx={{ display: 'flex', alignItems: 'center', gap: 1, textDecoration: 'none', color: 'inherit' }}>
                        <Box sx={{ color: 'primary.main', display: 'flex' }}>
                            <AppLogoIcon style={{ width: 32, height: 32, fill: 'currentColor' }} />
                        </Box>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            PIM{' '}
                            <Box component="span" sx={{ fontWeight: 800, color: 'primary.main' }}>
                                Pumpkin
                            </Box>
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={1} alignItems="center">
                        <AppearanceToggleDropdown />
                        {actions}
                    </Stack>
                </Toolbar>
            </AppBar>

            <Box sx={{ display: 'flex', flexDirection: 'column', gap: 3, p: { xs: 2, md: 4 }, flex: 1, width: '100%' }}>
                <Button component={Link} href="/" startIcon={<ArrowBackIcon />} size="small" sx={{ alignSelf: 'flex-start' }}>
                    กลับ
                </Button>

                <Box
                    ref={bentoRef}
                    sx={{
                        display: 'grid',
                        gridTemplateColumns: `repeat(${cols}, 1fr)`,
                        gridAutoRows: `${rowH}px`,
                        gap: 1.25,
                        py: 2,
                    }}
                >
                    {placed.map((p) => cloneElement(p.data.render(gridArea(p.x, p.y, p.w, p.h)), { key: p.data.key }))}
                    {gaps.map((g, index) =>
                        cloneElement(
                            factCell(
                                gridArea(g.x, g.y, g.w, g.h),
                                index,
                                TuneOutlinedIcon,
                                fillerPool[index % fillerPool.length].value,
                                fillerPool[index % fillerPool.length].label,
                                g.h,
                            ),
                            {
                                key: `gap-${g.x}-${g.y}`,
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
            </Box>
        </Box>
    );
}