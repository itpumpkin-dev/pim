export type Locale = 'th' | 'en' | 'zh';

export const locales: { value: Locale; label: string }[] = [
    { value: 'th', label: 'ไทย' },
    { value: 'en', label: 'English' },
    { value: 'zh', label: '中文' },
];

/**
 * UI chrome only — product data (names, descriptions, specs, highlights, brand, category values)
 * stays Thai-only, since translating catalog content requires real per-product translations,
 * not a UI dictionary. See categoryLabels below for the one deliberate exception.
 */
const translations = {
    th: {
        'nav.home': 'หน้าแรก',
        'common.back': 'กลับ',
        'common.edit': 'แก้ไขข้อมูล',
        'common.print': 'พิมพ์ข้อมูล',
        'common.export': 'Export',
        'common.export.all': 'ทั้งหมด',
        'common.export.thisCategory': 'หมวดหมู่นี้',
        'common.exportThisProduct': 'Export ข้อมูลสินค้านี้',
        'common.packLabel': 'บรรจุ {qty} {unit}/ลัง',
        'common.noResults': 'ไม่พบสินค้าที่ค้นหา',

        'home.hero.slide1.title': 'คลังข้อมูลสินค้าเคมีภัณฑ์และกาว',
        'home.hero.slide1.subtitle': 'รวมข้อมูลสเปค ราคา และรายละเอียดสินค้าจากซูดาล ซันนิค และพัมคินไว้ในที่เดียว',
        'home.hero.slide2.title': 'จัดหมวดหมู่สินค้าอย่างเป็นระบบ',
        'home.hero.slide2.subtitle': 'ค้นหาและอ้างอิงข้อมูลสินค้าตามหมวดหมู่ได้อย่างรวดเร็วและเป็นระเบียบ',
        'home.hero.slide3.title': 'ตรวจสอบราคาและส่วนลดได้ง่าย',
        'home.hero.slide3.subtitle': 'ดูราคาต่อหน่วยและส่วนลดตามจำนวนสั่งซื้อของแต่ละสินค้าได้ทันที',
        'home.categories.heading': 'หมวดหมู่สินค้า',
        'home.products.heading': 'รายการสินค้า',
        'home.products.count': 'ทั้งหมด {count} รายการ',
        'home.products.filteredBy': '· หมวดหมู่ "{category}"',
        'home.search.placeholder': 'ค้นหาสินค้าหรือหมวดหมู่',

        'show.notFound.message': 'ไม่พบสินค้าที่คุณต้องการ',
        'show.notFound.backHome': 'กลับหน้า Home',
        'show.sku': 'SKU {sku}',
        'show.spec.heading': 'ข้อมูลจำเพาะ',
        'show.stat.pricePerUnit': 'ราคาต่อหน่วย',
        'show.stat.packagingCaption': 'ขนาดบรรจุ {size}',
        'show.stat.packUnitSuffix': '/ลัง',
        'show.fact.brand': 'แบรนด์',
        'show.fact.category': 'หมวดหมู่',
        'show.fact.color': 'สี',
        'show.discount.title': 'ส่วนลดตามจำนวนสั่งซื้อ',
        'show.related.heading': 'สินค้าที่เกี่ยวข้อง',
    },
    en: {
        'nav.home': 'Home',
        'common.back': 'Back',
        'common.edit': 'Edit',
        'common.print': 'Print',
        'common.export': 'Export',
        'common.export.all': 'All',
        'common.export.thisCategory': 'This category',
        'common.exportThisProduct': 'Export this product',
        'common.packLabel': '{qty} {unit}/case',
        'common.noResults': 'No matching products found',

        'home.hero.slide1.title': 'A single home for chemical & adhesive product data',
        'home.hero.slide1.subtitle': 'Specs, pricing, and product details from Soudal, Sunnic, and Pumpkin, all in one place',
        'home.hero.slide2.title': 'Products organized by category',
        'home.hero.slide2.subtitle': 'Find and reference product data by category quickly and cleanly',
        'home.hero.slide3.title': 'Check pricing and discounts at a glance',
        'home.hero.slide3.subtitle': "See each product's unit price and volume discounts instantly",
        'home.categories.heading': 'Categories',
        'home.products.heading': 'Products',
        'home.products.count': '{count} items total',
        'home.products.filteredBy': '· category "{category}"',
        'home.search.placeholder': 'Search products or categories',

        'show.notFound.message': "The product you're looking for wasn't found",
        'show.notFound.backHome': 'Back to Home',
        'show.sku': 'SKU {sku}',
        'show.spec.heading': 'Specifications',
        'show.stat.pricePerUnit': 'Price per unit',
        'show.stat.packagingCaption': 'Package size {size}',
        'show.stat.packUnitSuffix': '/case',
        'show.fact.brand': 'Brand',
        'show.fact.category': 'Category',
        'show.fact.color': 'Color',
        'show.discount.title': 'Volume discount',
        'show.related.heading': 'Related products',
    },
    zh: {
        'nav.home': '首页',
        'common.back': '返回',
        'common.edit': '编辑资料',
        'common.print': '打印资料',
        'common.export': '导出',
        'common.export.all': '全部',
        'common.export.thisCategory': '此类别',
        'common.exportThisProduct': '导出此产品',
        'common.packLabel': '每箱 {qty} {unit}',
        'common.noResults': '未找到符合条件的产品',

        'home.hero.slide1.title': '化学品与胶粘剂产品数据总汇',
        'home.hero.slide1.subtitle': '集中管理 Soudal、Sunnic、Pumpkin 的规格、价格与产品详情',
        'home.hero.slide2.title': '系统化的产品分类',
        'home.hero.slide2.subtitle': '按类别快速、清晰地查找和参考产品数据',
        'home.hero.slide3.title': '轻松查看价格与折扣',
        'home.hero.slide3.subtitle': '即时查看每个产品的单价与批量采购折扣',
        'home.categories.heading': '产品类别',
        'home.products.heading': '产品列表',
        'home.products.count': '共 {count} 项',
        'home.products.filteredBy': '· 类别「{category}」',
        'home.search.placeholder': '搜索产品或类别',

        'show.notFound.message': '找不到您要的产品',
        'show.notFound.backHome': '返回首页',
        'show.sku': 'SKU {sku}',
        'show.spec.heading': '规格参数',
        'show.stat.pricePerUnit': '单价',
        'show.stat.packagingCaption': '包装规格 {size}',
        'show.stat.packUnitSuffix': '/箱',
        'show.fact.brand': '品牌',
        'show.fact.category': '类别',
        'show.fact.color': '颜色',
        'show.discount.title': '批量采购折扣',
        'show.related.heading': '相关产品',
    },
} as const satisfies Record<Locale, Record<string, string>>;

export type TranslationKey = keyof (typeof translations)['th'];

export function translate(locale: Locale, key: TranslationKey, vars?: Record<string, string | number>): string {
    let text: string = translations[locale][key] ?? translations.th[key] ?? key;
    if (vars) {
        for (const [name, value] of Object.entries(vars)) {
            text = text.replaceAll(`{${name}}`, String(value));
        }
    }
    return text;
}

/**
 * The 12 home-page category chips are a small, fixed set shared across the whole catalog
 * (unlike per-product data), so translating just their display text is safe — filtering still
 * matches on the original Thai value in `product.category`.
 */
export const categoryLabels: Record<string, { en: string; zh: string }> = {
    'กาวยาแนว MS-Polymer': { en: 'MS-Polymer Sealant', zh: 'MS聚合物密封胶' },
    กาวตะปู: { en: 'Nail-Free Adhesive', zh: '免钉胶' },
    ซิลิโคน: { en: 'Silicone', zh: '硅酮胶' },
    โพลียูรีเทนยาแนว: { en: 'Polyurethane Sealant', zh: '聚氨酯密封胶' },
    พียูโฟม: { en: 'PU Foam', zh: '聚氨酯发泡剂' },
    อุปกรณ์ทำความสะอาด: { en: 'Cleaning Supplies', zh: '清洁用品' },
    'ปืนยาแนว/ปืนยิงโฟม': { en: 'Sealant & Foam Guns', zh: '打胶枪/发泡枪' },
    'น้ำยาล็อกเกลียว/ตรึงเพลา': { en: 'Threadlocker & Retainer', zh: '螺纹锁固剂/轴承固定胶' },
    กาวร้อน: { en: 'Hot Melt Glue', zh: '热熔胶' },
    เทปซ่อมแซม: { en: 'Repair Tape', zh: '修补胶带' },
    กาวอะคริลิคยาแนว: { en: 'Acrylic Sealant', zh: '丙烯酸密封胶' },
    'กาวอีพ็อกซี่/เอนกประสงค์': { en: 'Epoxy / Multi-Purpose Adhesive', zh: '环氧树脂/万能胶' },
};

export function translateCategory(locale: Locale, category: string): string {
    if (locale === 'th') return category;
    return categoryLabels[category]?.[locale] ?? category;
}
